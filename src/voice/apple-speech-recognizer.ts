/**
 * Apple Speech Recognizer
 *
 * On-device speech recognition for macOS via the `teleprompter-stt` Swift sidecar
 * (SFSpeechRecognizer). Far more accurate than Vosk's small model — which is what made
 * the scroll tracking lag/jump. Spawned with child_process, the same pattern KokoroEngine
 * uses for TTS. Parses the sidecar's JSON-lines stdout and emits the SAME events as
 * VoskRecognizer, so the VoiceTrackingService can use either interchangeably.
 *
 * Open-vocabulary (no grammar) — accuracy comes from the engine; the script-matcher still
 * constrains matching to the document's words, so occasional mis-hears don't lose your place.
 */

import type { ChildProcess } from 'child_process'
import type * as ChildProcessTypes from "child_process"
import * as native from "../platform/native"
import { Platform } from 'obsidian'
import type { VoiceTrackingStatus, VoiceTrackingError } from './types'

type ResultSubscriber = (_text: string, _isFinal: boolean) => void
type StatusSubscriber = (_status: VoiceTrackingStatus) => void
type ErrorSubscriber = (_error: VoiceTrackingError, _message: string) => void
type ProgressSubscriber = (_loaded: number, _total: number) => void

/** Stable install dir for the sidecar + disclaim launcher (mirrors Kokoro's ~/.local/share). */
function appleInstallDir(): string {
  return native.path().join(native.os().homedir(), '.local', 'share', 'teleprompter-plus')
}
/** The on-device STT binary. */
export function appleSidecarPath(): string {
  return native.path().join(appleInstallDir(), 'teleprompter-stt')
}
/** The disclaim launcher — runs the sidecar as its OWN TCC-responsible process so macOS reads
 *  the sidecar's Info.plist (Speech/Mic usage), not Obsidian's. Without it the helper is killed. */
export function appleLauncherPath(): string {
  return native.path().join(appleInstallDir(), 'disclaim-launcher')
}

/** How the recognizer reaches the OS: injectable so the failure paths can be tested without a Mac. */
export interface AppleRecognizerDeps {
  spawn: typeof ChildProcessTypes.spawn
  isMacOS: boolean
  sidecarExists: () => boolean
  /** Longest a helper that has shown it is current may stay silent before it is declared dead. */
  startTimeoutMs: number
  /** Longest to wait while macOS may be showing a permission dialog the user has to answer. Also the
   *  limit from spawn until the helper proves it reports whether a dialog is pending: an older
   *  helper never does, and must not be timed out while its dialog is still open. */
  permissionDialogTimeoutMs: number
  /** Recognition errors, with no transcript in between, that within recognitionErrorWindowMs fail the run. */
  maxConsecutiveRecognitionErrors: number
  /** The wall-clock window those errors must fall in. Apple raises the same error at its own silence
   *  timeout while the user pauses to think, seconds apart; only a tight loop is a broken recognizer. */
  recognitionErrorWindowMs: number
  now: () => number
}

const STDERR_TAIL_BYTES = 2000

function defaultDeps(): AppleRecognizerDeps {
  return {
    spawn: ((...args: Parameters<typeof ChildProcessTypes.spawn>) => native.childProcess().spawn(...args)) as typeof ChildProcessTypes.spawn,
    isMacOS: Platform.isMacOS,
    sidecarExists: () => native.fs().existsSync(appleSidecarPath()),
    startTimeoutMs: 15000,
    permissionDialogTimeoutMs: 90000,
    // The helper retries every ~150 ms, so 20 errors inside 10 s is a spin, not silence.
    maxConsecutiveRecognitionErrors: 20,
    recognitionErrorWindowMs: 10000,
    now: () => Date.now(),
  }
}

export class AppleSpeechRecognizer {
  private proc: ChildProcess | null = null
  private language = 'en-US'
  private isInitialized = false
  private isListening = false
  private stdoutBuffer = ''
  private contextFilePath: string | null = null
  private authTimer: ReturnType<typeof setTimeout> | null = null
  private stderrTail = ''
  private failedRun = false
  private helperReportsPrompt = false
  private recognitionErrorTimes: number[] = []
  private readonly deps: AppleRecognizerDeps

  constructor(deps: Partial<AppleRecognizerDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps }
  }

  private resultSubscribers: ResultSubscriber[] = []
  private statusSubscribers: StatusSubscriber[] = []
  private errorSubscribers: ErrorSubscriber[] = []
  private progressSubscribers: ProgressSubscriber[] = []

  /** Apple on-device speech is macOS-only and needs the compiled sidecar present. */
  static isSupported(): boolean {
    return Platform.isMacOS && native.fs().existsSync(appleSidecarPath()) && native.fs().existsSync(appleLauncherPath())
  }

  /** grammar is accepted for interface parity with VoskRecognizer but unused (open-vocab). */
  initialize(language = 'en-US', grammar?: string): Promise<void> {
    if (!this.deps.isMacOS) {
      this.emitError('browser-not-supported', 'Apple Speech recognition is only available on macOS')
      return Promise.reject(new Error('Apple Speech is macOS-only'))
    }
    if (!this.deps.sidecarExists()) {
      this.emitError('model-not-found', `Speech sidecar not found at ${appleSidecarPath()}. Build it with: swiftc -O teleprompter-stt.swift -o teleprompter-stt`)
      return Promise.reject(new Error('Apple Speech sidecar not installed'))
    }
    this.language = language || 'en-US'
    this.buildContextFile(grammar)
    this.isInitialized = true
    return Promise.resolve()
  }

  /** Refresh the contextualStrings file when the tracked document changes. */
  updateGrammar(grammar?: string): void {
    this.buildContextFile(grammar)
  }

  /** Write the script's salient words (the Vosk grammar doubles as our word list) to a temp file
   *  so the sidecar can feed them to Apple as contextualStrings — cuts mis-hears of uncommon words. */
  private buildContextFile(grammar?: string): void {
    this.contextFilePath = null
    if (!grammar) return
    try {
      const words = JSON.parse(grammar) as string[]
      // The caller (VoiceTrackingService.buildContextVocabulary) already curates + prioritizes this
      // list in natural casing, so here we only trim, drop the [unk] sentinel, dedup, and cap. We do
      // NOT re-filter by length — that would discard short proper nouns like "UX"/"Dr" we want to bias.
      const seen = new Set<string>()
      const salient: string[] = []
      for (const raw of words) {
        const w = raw.trim()
        if (!w || w === '[unk]') continue
        const key = w.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        salient.push(w)
      }
      const capped = salient.slice(0, 100)
      if (capped.length === 0) return
      const p = native.path().join(native.os().tmpdir(), 'teleprompter-stt-context.txt')
      native.fs().writeFileSync(p, capped.join('\n'), 'utf8')
      this.contextFilePath = p
    } catch {
      this.contextFilePath = null
    }
  }

  async start(): Promise<void> {
    if (this.isListening) return
    if (!this.isInitialized) {
      await this.initialize(this.language)
    }

    this.emitStatus('initializing')

    // Spawn THROUGH the disclaim launcher so the sidecar runs under its own TCC identity.
    const sidecarArgs = [appleSidecarPath(), this.language]
    if (this.contextFilePath) sidecarArgs.push(this.contextFilePath)
    const proc = this.deps.spawn(appleLauncherPath(), sidecarArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    } as Record<string, unknown>)
    this.proc = proc
    this.stdoutBuffer = ''
    this.stderrTail = ''
    this.failedRun = false   // one error per helper run: its own error line, its exit, or the timeout
    this.helperReportsPrompt = false
    this.recognitionErrorTimes = []

    // Every handler below belongs to THIS helper run. A killed helper keeps writing for a moment
    // (the real one answers SIGTERM with a "stopped" line); none of that may touch a newer run.
    proc.stderr?.on('data', (chunk: Buffer) => {
      if (this.proc !== proc) return
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-STDERR_TAIL_BYTES)
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (this.proc !== proc) return
      this.stdoutBuffer += chunk.toString()
      let nl: number
      while ((nl = this.stdoutBuffer.indexOf('\n')) >= 0) {
        const line = this.stdoutBuffer.slice(0, nl).trim()
        this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1)
        if (line) this.handleLine(line)
        // A line can end the run (fail() kills the helper); whatever else this chunk carried
        // belongs to a helper that is gone.
        if (this.proc !== proc) {
          this.stdoutBuffer = ''
          break
        }
      }
    })

    proc.on('error', (err: Error) => {
      if (this.proc !== proc) return
      this.failedRun = true
      this.clearAuthTimer()
      this.emitError('recognition-failed', `Failed to start speech sidecar: ${err.message}`)
      this.emitStatus('error')
    })

    // A helper that exits on its own (TCC kill, crash, bad exit code) used to vanish silently,
    // leaving the UI on "initializing" until the timer fired. Report it with how it died.
    proc.on('close', (code: number | null, signal: string | null) => {
      if (this.proc !== proc) return
      const wasListening = this.isListening
      this.isListening = false
      this.proc = null
      this.clearAuthTimer()
      if (this.failedRun) return   // the helper already reported its own error before exiting
      this.failedRun = true
      const how = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
      const tail = this.stderrTail.trim()
      const when = wasListening ? 'stopped unexpectedly' : 'exited before it started listening'
      this.emitError('recognition-failed', `The speech helper ${when} (${how}).${tail ? ` Helper output: ${tail}` : ''}`)
      this.emitStatus('error')
    })

    // Never hang on "initializing". Until the helper shows it reports whether a permission dialog
    // is pending (an 'authorizing' status carrying a prompt field) it gets the long limit, because
    // an older helper never says so; handleLine drops to the short limit once it does.
    this.armTimer(this.deps.permissionDialogTimeoutMs, 'macOS is still waiting for a permission answer, or the speech helper is stuck.')
  }

  /** (Re)arm the start timeout. On expiry the helper is killed directly: going through stop()
   *  would emit 'off' after 'error' and erase the error from the UI. */
  private armTimer(ms: number, reason: string): void {
    this.clearAuthTimer()
    this.authTimer = setTimeout(() => {
      this.authTimer = null
      if (this.isListening || this.failedRun) return
      this.fail(
        'permission-timeout',
        `${reason} Open System Settings → Privacy & Security, allow Microphone and Speech Recognition for Teleprompter Plus (or Obsidian), then retry.`,
      )
    }, ms)
  }

  /** Kill the helper without announcing a state change. Its pipes are detached too: the real
   *  helper still prints a "stopped" line on SIGTERM, which would otherwise arrive as an 'off'. */
  private killHelper(): void {
    this.isListening = false
    this.stdoutBuffer = ''
    const proc = this.proc
    if (!proc) return
    this.proc = null
    try { proc.kill('SIGTERM') } catch { /* ignore */ }
    proc.removeAllListeners()
    proc.stdout?.removeAllListeners()
    proc.stderr?.removeAllListeners()
    // An 'error' with no listener throws; a failed kill can still raise one.
    proc.on('error', () => {})
  }

  private clearAuthTimer(): void {
    if (this.authTimer) {
      clearTimeout(this.authTimer)
      this.authTimer = null
    }
  }

  stop(): void {
    this.clearAuthTimer()
    this.killHelper()
    this.emitStatus('off')
  }

  dispose(): void {
    this.stop()
    this.resultSubscribers = []
    this.statusSubscribers = []
    this.errorSubscribers = []
    this.progressSubscribers = []
  }

  getIsInitialized(): boolean {
    return this.isInitialized
  }

  getIsListening(): boolean {
    return this.isListening
  }

  getLanguage(): string {
    return this.language
  }

  onResult(cb: ResultSubscriber): void { this.resultSubscribers.push(cb) }
  onStatus(cb: StatusSubscriber): void { this.statusSubscribers.push(cb) }
  onError(cb: ErrorSubscriber): void { this.errorSubscribers.push(cb) }
  onProgress(cb: ProgressSubscriber): void { this.progressSubscribers.push(cb) }

  // ===== Private =====

  private handleLine(line: string): void {
    let msg: { type?: string; value?: string; text?: string; code?: string; message?: string; onDevice?: boolean; prompt?: boolean }
    try {
      msg = JSON.parse(line) as typeof msg
    } catch {
      return // ignore non-JSON noise
    }

    switch (msg.type) {
      case 'partial':
        if (msg.text) {
          this.recognitionErrorTimes = []
          this.emitResult(msg.text, false)
        }
        break
      case 'final':
        if (msg.text) {
          this.recognitionErrorTimes = []
          this.emitResult(msg.text, true)
        }
        break
      case 'status':
        if (msg.value === 'listening' && this.language !== 'en-US' && msg.onDevice !== true) {
          // A helper older than this rule may be sending the audio to Apple. English keeps working
          // on it, because English has always had on-device recognition here.
          this.fail('no-on-device', 'This speech helper does not promise on-device recognition.')
        } else if (msg.value === 'listening') {
          this.isListening = true
          this.clearAuthTimer()
          this.emitStatus('listening')
        } else if (msg.value === 'authorizing' || msg.value === 'ready') {
          if (typeof msg.prompt === 'boolean') {
            // A current helper says whether macOS is showing a dialog the user has to answer
            // (which can take a while) or will answer at once (so silence means a hang).
            this.helperReportsPrompt = true
            this.armTimer(
              msg.prompt ? this.deps.permissionDialogTimeoutMs : this.deps.startTimeoutMs,
              msg.prompt
                ? 'macOS is still waiting for you to answer the permission dialog.'
                : 'The speech helper did not start listening in time.',
            )
          } else if (msg.value === 'ready' && this.helperReportsPrompt) {
            // Speech is cleared; a microphone dialog, if any, announces itself with its own message.
            this.armTimer(this.deps.startTimeoutMs, 'The speech helper did not start listening in time.')
          }
          this.emitStatus('initializing')
        } else if (msg.value === 'stopped') {
          this.emitStatus('off')
        }
        break
      case 'error':
        // The helper restarts its own recognition after a transient error ("no speech detected"
        // and the like) and keeps listening; that is noise, not a failure, unless it never stops.
        if (this.isListening && msg.code === 'recognition') {
          const now = this.deps.now()
          this.recognitionErrorTimes.push(now)
          this.recognitionErrorTimes = this.recognitionErrorTimes.filter(t => now - t <= this.deps.recognitionErrorWindowMs)
          if (this.recognitionErrorTimes.length < this.deps.maxConsecutiveRecognitionErrors) break
          this.fail('recognition-failed', `Speech recognition keeps failing (${msg.message || 'no details'}). Check that Speech Recognition is allowed in System Settings → Privacy & Security and that the language is installed.`)
          break
        }
        // Everything else is fatal for this run.
        this.fail(this.mapError(msg.code), msg.message || 'Speech recognition error')
        break
    }
  }

  /** End the run with an error: report once, stop the helper, and leave the status at 'error'. */
  private fail(code: VoiceTrackingError, message: string): void {
    this.failedRun = true
    this.clearAuthTimer()
    this.emitError(code, message)
    this.killHelper()
    this.emitStatus('error')
  }

  private mapError(code?: string): VoiceTrackingError {
    switch (code) {
      case 'no-on-device':
        return 'no-on-device'
      case 'speech-denied':
      case 'speech-restricted':
      case 'speech-undetermined':
      case 'mic-denied':
      case 'mic-restricted':
        return 'microphone-denied'
      case 'auth-timeout':
        return 'permission-timeout'
      case 'no-recognizer':
        return 'model-not-found'
      default:
        return 'recognition-failed'
    }
  }

  private emitResult(text: string, isFinal: boolean): void {
    for (const cb of this.resultSubscribers) cb(text, isFinal)
  }
  private emitStatus(status: VoiceTrackingStatus): void {
    for (const cb of this.statusSubscribers) cb(status)
  }
  private emitError(error: VoiceTrackingError, message: string): void {
    for (const cb of this.errorSubscribers) cb(error, message)
  }
}
