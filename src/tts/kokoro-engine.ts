/**
 * Kokoro TTS engine — MLX neural TTS via Python subprocess.
 * Generates high-quality WAV audio using mlx-community/Kokoro-82M-bf16
 * and plays back via macOS `afplay` for reliable audio in Electron.
 *
 * Uses SIGSTOP/SIGCONT for pause/resume (same pattern as MacSayEngine).
 * Requires: Python venv at ~/.local/share/mlx-tts-venv with mlx-audio installed.
 */

import type { TTSEngine, TTSVoice, SpeakOptions } from './tts-types'
import { resolveVoiceId, clampSpeed } from './kokoro-safety'
import type { ChildProcess } from 'child_process'
import { Platform } from 'obsidian'
// Node.js modules — externalized by Vite, available in Obsidian's CJS environment
import * as childProcess from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const VENV_PATH = '~/.local/share/mlx-tts-venv'
const MODEL = 'mlx-community/Kokoro-82M-bf16'

/** Available Kokoro voice presets */
const KOKORO_VOICES: TTSVoice[] = [
	{ id: 'af_heart', name: 'Heart (Female)', language: 'en-US', isDefault: true },
	{ id: 'af_alloy', name: 'Alloy (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_aoede', name: 'Aoede (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_bella', name: 'Bella (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_jessica', name: 'Jessica (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_kore', name: 'Kore (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_nicole', name: 'Nicole (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_nova', name: 'Nova (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_river', name: 'River (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_sarah', name: 'Sarah (Female)', language: 'en-US', isDefault: false },
	{ id: 'af_sky', name: 'Sky (Female)', language: 'en-US', isDefault: false },
	{ id: 'am_adam', name: 'Adam (Male)', language: 'en-US', isDefault: false },
	{ id: 'am_echo', name: 'Echo (Male)', language: 'en-US', isDefault: false },
	{ id: 'am_eric', name: 'Eric (Male)', language: 'en-US', isDefault: false },
	{ id: 'am_liam', name: 'Liam (Male)', language: 'en-US', isDefault: false },
	{ id: 'am_michael', name: 'Michael (Male)', language: 'en-US', isDefault: false },
	{ id: 'am_onyx', name: 'Onyx (Male)', language: 'en-US', isDefault: false },
	{ id: 'bf_emma', name: 'Emma (British F)', language: 'en-GB', isDefault: false },
	{ id: 'bf_isabella', name: 'Isabella (British F)', language: 'en-GB', isDefault: false },
	{ id: 'bm_daniel', name: 'Daniel (British M)', language: 'en-GB', isDefault: false },
	{ id: 'bm_george', name: 'George (British M)', language: 'en-GB', isDefault: false },
	{ id: 'bm_lewis', name: 'Lewis (British M)', language: 'en-GB', isDefault: false },
]

export class KokoroEngine implements TTSEngine {
	readonly name = 'Kokoro'
	private endCallback: (() => void) | null = null
	private playbackProcess: ChildProcess | null = null
	private playbackPaused = false
	private currentProcess: ChildProcess | null = null
	private cacheDir = ''
	private pythonPath = ''
	private available: boolean | null = null

	// Pregeneration pipeline — generate next sentence while current plays
	private pregenProcess: ChildProcess | null = null
	private pregenText: string | null = null
	private pregenWavPath: string | null = null
	private pendingHint: { text: string; options: SpeakOptions } | null = null

	get isAvailable(): boolean {
		if (this.available !== null) return this.available

		if (!Platform.isMacOS) {
			this.available = false
			return false
		}

		// Check if venv exists with mlx-audio
		const venvPython = path.join(
			os.homedir(), '.local', 'share', 'mlx-tts-venv', 'bin', 'python3'
		)
		try {
			if (fs.existsSync(venvPython)) {
				// Quick check: can we import mlx_audio? execFileSync (array args, no shell) so a
				// venv path containing shell metacharacters cannot inject — see ATTACKSURFACE.md SURF-06.
				childProcess.execFileSync(
					venvPython,
					['-c', 'import mlx_audio'],
					{ encoding: 'utf-8', timeout: 5000 } as Record<string, unknown>
				)
				this.pythonPath = venvPython
				this.available = true
				return true
			}
		} catch {
			// mlx_audio not importable
		}
		this.available = false
		return false
	}

	initialize(): Promise<void> {
		if (!this.isAvailable) {
			return Promise.reject(new Error(`Kokoro engine not available. Install with:\n  python3 -m venv ${VENV_PATH}\n  source ${VENV_PATH}/bin/activate\n  pip install mlx-audio misaki num2words spacy phonemizer espeakng_loader`))
		}

		// Create temp cache directory for WAV files
		this.cacheDir = path.join(os.tmpdir(), `teleprompter-tts-kokoro-${Date.now()}`)
		if (!fs.existsSync(this.cacheDir)) {
			fs.mkdirSync(this.cacheDir, { recursive: true })
		}
		return Promise.resolve()
	}

	async speak(text: string, options: SpeakOptions): Promise<void> {
		this.stopPlayback()

		// Check pregeneration cache — skip generation if next sentence was pre-built
		if (this.pregenWavPath && this.pregenText === text) {
			const cachedWav = this.pregenWavPath
			this.pregenWavPath = null
			this.pregenText = null
			return this.playWav(cachedWav)
		}

		// Cancel stale pregeneration (text didn't match)
		this.cancelPregen()

		const wavFile = await this.generateWav(text, options)
		return this.playWav(wavFile)
	}

	/** Generate a WAV file for the given text. Returns the file path. */
	private generateWav(text: string, options: SpeakOptions): Promise<string> {
		// Resolve against the allowlist / clamp to a number BEFORE interpolating into the Python
		// script below — settings.ttsVoice/ttsRate are attacker-reachable and otherwise unvalidated.
		const voiceId = resolveVoiceId(options.voice, KOKORO_VOICES.map((v) => v.id))
		const speed = clampSpeed(options.rate)
		const outputPrefix = `sent_${Date.now()}`
		const outputPath = this.cacheDir

		const script = `
import sys
sys.stdout.reconfigure(line_buffering=True)
from mlx_audio.tts.generate import generate_audio
generate_audio(
    text=${JSON.stringify(text)},
    model="${MODEL}",
    voice="${voiceId}",
    speed=${speed},
    output_path="${outputPath.replace(/\\/g, '\\\\')}",
    file_prefix="${outputPrefix}",
    verbose=False,
    play=False
)
print("DONE:" + "${outputPrefix}_000.wav")
`

		return new Promise<string>((resolve, reject) => {
			const proc = childProcess.spawn(
				this.pythonPath,
				['-c', script],
				{ cwd: outputPath } as Record<string, unknown>
			)
			this.currentProcess = proc

			let stdout = ''
			let stderr = ''

			proc.stdout?.on('data', (data: Buffer) => {
				stdout += data.toString()
			})
			proc.stderr?.on('data', (data: Buffer) => {
				stderr += data.toString()
			})

			proc.on('close', (code: number) => {
				this.currentProcess = null

				if (code !== 0) {
					reject(new Error(`Kokoro generation failed: ${stderr}`))
					return
				}

				const doneMatch = stdout.match(/DONE:(.+\.wav)/)
				if (!doneMatch) {
					reject(new Error('Kokoro: no WAV file produced'))
					return
				}

				resolve(path.join(outputPath, doneMatch[1]))
			})

			proc.on('error', (err: Error) => {
				this.currentProcess = null
				reject(new Error(`Failed to spawn Kokoro: ${err.message}`))
			})
		})
	}

	/** Hint the engine about the next sentence to pregenerate during playback */
	hintNext(text: string, options: SpeakOptions): void {
		this.pendingHint = { text, options }
	}

	/** Start pregenerating the hinted sentence (called when playback begins) */
	private startPregen(): void {
		if (!this.pendingHint) return
		const { text, options } = this.pendingHint
		this.pendingHint = null

		// Don't pregenerate if we already have it cached
		if (this.pregenText === text && this.pregenWavPath) return

		this.cancelPregen()
		this.pregenText = text

		// Resolve against the allowlist / clamp to a number BEFORE interpolating into the Python
		// script below — settings.ttsVoice/ttsRate are attacker-reachable and otherwise unvalidated.
		const voiceId = resolveVoiceId(options.voice, KOKORO_VOICES.map((v) => v.id))
		const speed = clampSpeed(options.rate)
		const outputPrefix = `pregen_${Date.now()}`
		const outputPath = this.cacheDir

		const script = `
import sys
sys.stdout.reconfigure(line_buffering=True)
from mlx_audio.tts.generate import generate_audio
generate_audio(
    text=${JSON.stringify(text)},
    model="${MODEL}",
    voice="${voiceId}",
    speed=${speed},
    output_path="${outputPath.replace(/\\/g, '\\\\')}",
    file_prefix="${outputPrefix}",
    verbose=False,
    play=False
)
print("DONE:" + "${outputPrefix}_000.wav")
`

		const proc = childProcess.spawn(
			this.pythonPath,
			['-c', script],
			{ cwd: outputPath } as Record<string, unknown>
		)
		this.pregenProcess = proc

		let stdout = ''
		proc.stdout?.on('data', (data: Buffer) => {
			stdout += data.toString()
		})

		proc.on('close', (code: number) => {
			if (this.pregenProcess === proc) {
				this.pregenProcess = null
			}
			if (code === 0) {
				const doneMatch = stdout.match(/DONE:(.+\.wav)/)
				if (doneMatch && this.pregenText === text) {
					this.pregenWavPath = path.join(outputPath, doneMatch[1])
				}
			}
		})
	}

	/** Cancel any running pregeneration */
	private cancelPregen(): void {
		if (this.pregenProcess) {
			try { this.pregenProcess.kill() } catch { /* ignore */ }
			this.pregenProcess.removeAllListeners()
			this.pregenProcess = null
		}
		this.pregenText = null
		this.pregenWavPath = null
	}

	private playWav(wavPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				const proc = childProcess.spawn('afplay', [wavPath])
				this.playbackProcess = proc
				this.playbackPaused = false

				// Start pregenerating next sentence while this one plays
				this.startPregen()

				proc.on('close', () => {
					if (this.playbackProcess === proc) {
						this.playbackProcess = null
						this.playbackPaused = false
						this.endCallback?.()
					}
					resolve()
				})

				proc.on('error', (err: Error) => {
					this.playbackProcess = null
					this.playbackPaused = false
					reject(new Error(`afplay failed: ${err.message}`))
				})
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Audio playback failed'
				reject(new Error(message))
			}
		})
	}

	pause(): void {
		if (this.playbackProcess?.pid && !this.playbackPaused) {
			try {
				process.kill(this.playbackProcess.pid, 'SIGSTOP')
				this.playbackPaused = true
			} catch {
				// Process may have already exited
			}
		}
	}

	resume(): void {
		if (this.playbackProcess?.pid && this.playbackPaused) {
			try {
				process.kill(this.playbackProcess.pid, 'SIGCONT')
				this.playbackPaused = false
			} catch {
				// Process already exited while paused — trigger end callback
				// so the service advances to the next sentence
				this.playbackProcess = null
				this.playbackPaused = false
				this.endCallback?.()
			}
		} else if (this.playbackPaused && !this.playbackProcess) {
			// Process exited while paused (close event cleared playbackProcess)
			this.playbackPaused = false
			this.endCallback?.()
		}
	}

	/** Stop only playback (preserve pregeneration cache for next sentence) */
	private stopPlayback(): void {
		if (this.playbackProcess) {
			if (this.playbackPaused) {
				try { if (this.playbackProcess.pid) process.kill(this.playbackProcess.pid, 'SIGCONT') } catch { /* ignore */ }
			}
			try { this.playbackProcess.kill() } catch { /* ignore */ }
			this.playbackProcess.removeAllListeners()
			this.playbackProcess = null
			this.playbackPaused = false
		}

		if (this.currentProcess) {
			try { this.currentProcess.kill() } catch { /* ignore */ }
			this.currentProcess.removeAllListeners()
			this.currentProcess = null
		}
	}

	stop(): void {
		this.stopPlayback()
		this.cancelPregen()
		this.pendingHint = null
	}

	getVoices(): Promise<TTSVoice[]> {
		return Promise.resolve(KOKORO_VOICES)
	}

	onEnd(callback: () => void): void {
		this.endCallback = callback
	}

	destroy(): void {
		this.stop()
		this.endCallback = null

		// Clean up cache directory
		if (this.cacheDir) {
			try {
				const files = fs.readdirSync(this.cacheDir)
				for (const file of files) {
					fs.unlinkSync(path.join(this.cacheDir, file))
				}
				fs.rmdirSync(this.cacheDir)
			} catch {
				// Best effort cleanup
			}
		}
	}
}
