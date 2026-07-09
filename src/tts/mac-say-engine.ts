/**
 * macOS native `say` command TTS engine.
 * Uses the system's high-quality voices (Samantha, Daniel, etc.)
 * which sound significantly better than Web Speech API in Electron.
 *
 * Only available on macOS (isDesktopOnly: true).
 * Uses SIGSTOP/SIGCONT for pause/resume.
 */

import type { TTSEngine, TTSVoice, SpeakOptions } from './tts-types'
import type { ChildProcess } from 'child_process'
import { Platform } from 'obsidian'
import * as childProcess from 'child_process'

export class MacSayEngine implements TTSEngine {
	readonly name = 'macOS Say'
	private currentProcess: ChildProcess | null = null
	private endCallback: (() => void) | null = null
	private voices: TTSVoice[] = []
	private voicesLoaded = false
	private isPaused = false

	get isAvailable(): boolean {
		return Platform.isMacOS
	}

	async initialize(): Promise<void> {
		if (!this.isAvailable) {
			throw new Error('macOS say command not available')
		}
		await this.loadVoices()
	}

	private async loadVoices(): Promise<void> {
		try {
			const output = childProcess.execSync('say -v "?"', { encoding: 'utf-8' })
			const lines = output.split('\n').filter(Boolean)

			this.voices = lines.map(line => {
				// Format: "Name                lang    # Description"
				const match = line.match(/^(.+?)\s{2,}(\S+)\s+#/)
				if (!match) return null
				const name = match[1].trim()
				const lang = match[2].trim()
				return {
					id: name,
					name,
					language: lang.replace('_', '-'),
					isDefault: name === 'Samantha',
				}
			}).filter((v): v is TTSVoice => v !== null)

			this.voicesLoaded = true
		} catch {
			this.voices = []
			this.voicesLoaded = true
		}
	}

	/**
	 * Select the best voice for the given language.
	 * Prefers high-quality natural voices, avoids novelty voices.
	 */
	private selectVoice(preferredVoice?: string, language?: string): string {
		if (preferredVoice) {
			const match = this.voices.find(v => v.id === preferredVoice)
			if (match) return match.id
		}

		const lang = (language || 'en').toLowerCase()

		// Filter to matching language
		const langVoices = this.voices.filter(v =>
			v.language.toLowerCase().startsWith(lang)
		)
		if (!langVoices.length) return 'Samantha'

		// Premium voices ordered by quality (best first)
		const premium: Record<string, string[]> = {
			'en': ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Rishi', 'Aman', 'Tara'],
			'pt': ['Luciana', 'Fernanda'],
			'fr': ['Thomas', 'Amelie', 'Marie'],
			'es': ['Monica', 'Paulina', 'Jorge'],
		}

		const preferredNames = premium[lang] || premium['en'] || []
		for (const name of preferredNames) {
			if (langVoices.some(v => v.id === name)) return name
		}

		// Avoid novelty voices
		const novelty = new Set([
			'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles',
			'Cellos', 'Good News', 'Jester', 'Junior', 'Organ', 'Superstar',
			'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Ralph', 'Fred',
		])
		const normal = langVoices.find(v => !novelty.has(v.id))
		if (normal) return normal.id

		return langVoices[0].id
	}

	async speak(text: string, options: SpeakOptions): Promise<void> {
		this.stop()

		return new Promise<void>((resolve, reject) => {
			const voiceName = this.selectVoice(options.voice, options.language)
			// Convert rate (0.5-2.0 multiplier) to WPM for say command
			// Normal speaking pace ~175 WPM
			const wpm = Math.round(175 * options.rate)

			// spawn (no shell) blocks shell injection; the trailing `--` blocks ARGUMENT injection —
			// without it a note sentence beginning with `-` (e.g. "-o/tmp/x.aiff") is parsed by `say`
			// as a flag rather than spoken text. `--` forces everything after it to be positional.
			const args = ['-v', voiceName, '--rate', String(wpm), '--', text]

			try {
				const proc = childProcess.spawn('say', args)
				this.currentProcess = proc
				this.isPaused = false

				proc.on('close', () => {
					if (this.currentProcess === proc) {
						this.currentProcess = null
						this.isPaused = false
						this.endCallback?.()
					}
					resolve()
				})

				proc.on('error', (err: Error) => {
					this.currentProcess = null
					this.isPaused = false
					reject(new Error(`say command failed: ${err.message}`))
				})
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to spawn say'
				reject(new Error(message))
			}
		})
	}

	pause(): void {
		if (this.currentProcess?.pid && !this.isPaused) {
			try {
				process.kill(this.currentProcess.pid, 'SIGSTOP')
				this.isPaused = true
			} catch {
				// Process may have already exited
			}
		}
	}

	resume(): void {
		if (this.currentProcess?.pid && this.isPaused) {
			try {
				process.kill(this.currentProcess.pid, 'SIGCONT')
				this.isPaused = false
			} catch {
				// Process already exited while paused — trigger end callback
				this.currentProcess = null
				this.isPaused = false
				this.endCallback?.()
			}
		} else if (this.isPaused && !this.currentProcess) {
			// Process exited while paused (close event cleared currentProcess)
			this.isPaused = false
			this.endCallback?.()
		}
	}

	stop(): void {
		if (this.currentProcess) {
			if (this.isPaused) {
				// Resume first so kill works
				try { if (this.currentProcess.pid) process.kill(this.currentProcess.pid, 'SIGCONT') } catch { /* ignore */ }
			}
			try {
				this.currentProcess.kill()
			} catch {
				// Process may have already exited
			}
			this.currentProcess.removeAllListeners()
			this.currentProcess = null
			this.isPaused = false
		}
	}

	async getVoices(): Promise<TTSVoice[]> {
		if (!this.voicesLoaded) {
			await this.loadVoices()
		}
		return this.voices
	}

	onEnd(callback: () => void): void {
		this.endCallback = callback
	}

	destroy(): void {
		this.stop()
		this.endCallback = null
	}
}
