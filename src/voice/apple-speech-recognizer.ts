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
import * as childProcess from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Platform } from 'obsidian'
import type { VoiceTrackingStatus, VoiceTrackingError } from './types'

type ResultSubscriber = (_text: string, _isFinal: boolean) => void
type StatusSubscriber = (_status: VoiceTrackingStatus) => void
type ErrorSubscriber = (_error: VoiceTrackingError, _message: string) => void
type ProgressSubscriber = (_loaded: number, _total: number) => void

/** Stable install dir for the sidecar + disclaim launcher (mirrors Kokoro's ~/.local/share). */
function appleInstallDir(): string {
  return path.join(os.homedir(), '.local', 'share', 'teleprompter-plus')
}
/** The on-device STT binary. */
export function appleSidecarPath(): string {
  return path.join(appleInstallDir(), 'teleprompter-stt')
}
/** The disclaim launcher — runs the sidecar as its OWN TCC-responsible process so macOS reads
 *  the sidecar's Info.plist (Speech/Mic usage), not Obsidian's. Without it the helper is killed. */
export function appleLauncherPath(): string {
  return path.join(appleInstallDir(), 'disclaim-launcher')
}

export class AppleSpeechRecognizer {
  private proc: ChildProcess | null = null
  private language = 'en-US'
  private isInitialized = false
  private isListening = false
  private stdoutBuffer = ''
  private contextFilePath: string | null = null
  private authTimer: ReturnType<typeof setTimeout> | null = null
  // Generous: first run shows TWO macOS permission dialogs (Speech + Mic) that take time to
  // read and approve. After granting once, startup is instant. This only guards a dead sidecar.
  private readonly AUTH_TIMEOUT_MS = 90000

  private resultSubscribers: ResultSubscriber[] = []
  private statusSubscribers: StatusSubscriber[] = []
  private errorSubscribers: ErrorSubscriber[] = []
  private progressSubscribers: ProgressSubscriber[] = []

  /** Apple on-device speech is macOS-only and needs the compiled sidecar present. */
  static isSupported(): boolean {
    return Platform.isMacOS && fs.existsSync(appleSidecarPath()) && fs.existsSync(appleLauncherPath())
  }

  /** grammar is accepted for interface parity with VoskRecognizer but unused (open-vocab). */
  initialize(language = 'en-US', grammar?: string): Promise<void> {
    if (!Platform.isMacOS) {
      this.emitError('browser-not-supported', 'Apple Speech recognition is only available on macOS')
      return Promise.reject(new Error('Apple Speech is macOS-only'))
    }
    if (!fs.existsSync(appleSidecarPath())) {
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
      const salient = Array.from(new Set(
        words.map(w => w.trim()).filter(w => w.length >= 5 && w !== '[unk]')
      )).slice(0, 100)
      if (salient.length === 0) return
      const p = path.join(os.tmpdir(), 'teleprompter-stt-context.txt')
      fs.writeFileSync(p, salient.join('\n'), 'utf8')
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
    const proc = childProcess.spawn(appleLauncherPath(), sidecarArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    } as Record<string, unknown>)
    this.proc = proc
    this.stdoutBuffer = ''

    proc.stdout?.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString()
      let nl: number
      while ((nl = this.stdoutBuffer.indexOf('\n')) >= 0) {
        const line = this.stdoutBuffer.slice(0, nl).trim()
        this.stdoutBuffer = this.stdoutBuffer.slice(nl + 1)
        if (line) this.handleLine(line)
      }
    })

    proc.on('error', (err: Error) => {
      this.emitError('recognition-failed', `Failed to start speech sidecar: ${err.message}`)
      this.emitStatus('error')
    })

    proc.on('close', () => {
      this.isListening = false
      if (this.proc === proc) {
        this.proc = null
      }
    })

    // Never hang on "initializing": if we don't reach 'listening' in time, the most likely
    // cause is a denied/blocked permission for the spawned helper — surface it instead of freezing.
    this.clearAuthTimer()
    this.authTimer = setTimeout(() => {
      if (!this.isListening) {
        this.emitError('microphone-denied', 'Speech sidecar did not start listening — grant Obsidian Microphone + Speech Recognition in System Settings → Privacy & Security, then fully quit and reopen Obsidian.')
        this.emitStatus('error')
        this.stop()
      }
    }, this.AUTH_TIMEOUT_MS)
  }

  private clearAuthTimer(): void {
    if (this.authTimer) {
      clearTimeout(this.authTimer)
      this.authTimer = null
    }
  }

  stop(): void {
    this.isListening = false
    this.clearAuthTimer()
    if (this.proc) {
      try { this.proc.kill('SIGTERM') } catch { /* ignore */ }
      this.proc.removeAllListeners()
      this.proc = null
    }
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
    let msg: { type?: string; value?: string; text?: string; code?: string; message?: string }
    try {
      msg = JSON.parse(line)
    } catch {
      return // ignore non-JSON noise
    }

    switch (msg.type) {
      case 'partial':
        if (msg.text) this.emitResult(msg.text, false)
        break
      case 'final':
        if (msg.text) this.emitResult(msg.text, true)
        break
      case 'status':
        if (msg.value === 'listening') {
          this.isListening = true
          this.clearAuthTimer()
          this.emitStatus('listening')
        } else if (msg.value === 'authorizing' || msg.value === 'ready') {
          this.emitStatus('initializing')
        } else if (msg.value === 'stopped') {
          this.emitStatus('off')
        }
        break
      case 'error':
        this.emitError(this.mapError(msg.code), msg.message || 'Speech recognition error')
        this.emitStatus('error')
        break
    }
  }

  private mapError(code?: string): VoiceTrackingError {
    switch (code) {
      case 'speech-denied':
      case 'speech-restricted':
      case 'speech-undetermined':
        return 'microphone-denied'
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
