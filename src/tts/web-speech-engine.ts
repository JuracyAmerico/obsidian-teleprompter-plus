/**
 * Web Speech API engine for TTS.
 * Zero-dependency fallback that works everywhere.
 * Uses window.speechSynthesis for immediate, setup-free TTS.
 */

import type { TTSEngine, TTSVoice, SpeakOptions } from './tts-types'

export class WebSpeechEngine implements TTSEngine {
	readonly name = 'Web Speech'
	private synth: SpeechSynthesis
	private currentUtterance: SpeechSynthesisUtterance | null = null
	private endCallback: (() => void) | null = null
	private boundaryCallback: ((charIndex: number) => void) | null = null
	private voices: SpeechSynthesisVoice[] = []
	private voicesLoaded = false

	get isAvailable(): boolean {
		return typeof window !== 'undefined' && 'speechSynthesis' in window
	}

	constructor() {
		this.synth = window.speechSynthesis
	}

	async initialize(): Promise<void> {
		if (!this.isAvailable) {
			throw new Error('Web Speech API not available')
		}

		// Voices may load asynchronously
		await this.loadVoices()
	}

	private loadVoices(): Promise<void> {
		return new Promise<void>((resolve) => {
			const voices = this.synth.getVoices()
			if (voices.length > 0) {
				this.voices = voices
				this.voicesLoaded = true
				resolve()
				return
			}

			// Voices load asynchronously in some browsers
			const onVoicesChanged = () => {
				this.voices = this.synth.getVoices()
				this.voicesLoaded = true
				this.synth.removeEventListener('voiceschanged', onVoicesChanged)
				resolve()
			}
			this.synth.addEventListener('voiceschanged', onVoicesChanged)

			// Timeout fallback - some environments never fire voiceschanged
			setTimeout(() => {
				if (!this.voicesLoaded) {
					this.voices = this.synth.getVoices()
					this.voicesLoaded = true
					this.synth.removeEventListener('voiceschanged', onVoicesChanged)
					resolve()
				}
			}, 2000)
		})
	}

	/**
	 * Select the best available voice, preferring premium/enhanced voices.
	 * macOS has high-quality voices (Samantha, Daniel, Karen, etc.) that sound
	 * much more natural than the default compact voices.
	 */
	private selectBestVoice(preferredVoice?: string, language?: string): SpeechSynthesisVoice | null {
		if (!this.voices.length) return null

		// If user explicitly chose a voice, use it
		if (preferredVoice) {
			const match = this.voices.find(v => v.voiceURI === preferredVoice)
			if (match) return match
		}

		const lang = language || 'en'

		// Filter to matching language voices
		const langVoices = this.voices.filter(v =>
			v.lang.toLowerCase().startsWith(lang.toLowerCase())
		)
		if (!langVoices.length) return null

		// Premium voice names — these are higher quality on macOS/Electron
		// Ordered by quality (best first)
		const premiumNames = [
			'Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Rishi',
			'Shelley', 'Sandy', 'Reed', 'Flo', 'Rocko', 'Eddy',
		]

		// Try premium voices first
		for (const name of premiumNames) {
			const match = langVoices.find(v =>
				v.name.includes(name) && !v.name.includes('Compact')
			)
			if (match) return match
		}

		// Prefer any non-novelty, non-compact voice
		const novelty = ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles',
			'Cellos', 'Good News', 'Jester', 'Junior', 'Organ', 'Superstar',
			'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Ralph', 'Fred', 'Kathy']
		const normal = langVoices.find(v =>
			!novelty.some(n => v.name.includes(n)) && !v.name.includes('Compact')
		)
		if (normal) return normal

		// Last resort: default voice
		return langVoices.find(v => v.default) || langVoices[0]
	}

	async speak(text: string, options: SpeakOptions): Promise<void> {
		// Cancel any ongoing speech
		this.synth.cancel()

		return new Promise<void>((resolve, reject) => {
			const utterance = new SpeechSynthesisUtterance(text)
			utterance.rate = options.rate

			// Select best voice (smart selection with premium preference)
			const voice = this.selectBestVoice(options.voice, options.language)
			if (voice) utterance.voice = voice

			// Set language
			if (options.language) {
				utterance.lang = options.language
			}

			utterance.onend = () => {
				this.currentUtterance = null
				this.endCallback?.()
				resolve()
			}

			utterance.onerror = (event) => {
				this.currentUtterance = null
				// 'interrupted' and 'canceled' are expected during stop/pause
				if (event.error === 'interrupted' || event.error === 'canceled') {
					resolve()
				} else {
					reject(new Error(`Speech synthesis error: ${event.error}`))
				}
			}

			// Word boundary events for highlighting
			utterance.onboundary = (event) => {
				if (event.name === 'word' && this.boundaryCallback) {
					this.boundaryCallback(event.charIndex)
				}
			}

			this.currentUtterance = utterance
			this.synth.speak(utterance)

			// Chrome bug workaround: speech synthesis stops after ~15 seconds
			// of continuous speech. Resume periodically.
			const resumeInterval = setInterval(() => {
				if (!this.synth.speaking) {
					clearInterval(resumeInterval)
					return
				}
				this.synth.pause()
				this.synth.resume()
			}, 14000)

			utterance.onend = () => {
				clearInterval(resumeInterval)
				this.currentUtterance = null
				this.endCallback?.()
				resolve()
			}

			utterance.onerror = (event) => {
				clearInterval(resumeInterval)
				this.currentUtterance = null
				if (event.error === 'interrupted' || event.error === 'canceled') {
					resolve()
				} else {
					reject(new Error(`Speech synthesis error: ${event.error}`))
				}
			}
		})
	}

	pause(): void {
		this.synth.pause()
	}

	resume(): void {
		this.synth.resume()
	}

	stop(): void {
		this.synth.cancel()
		this.currentUtterance = null
	}

	async getVoices(): Promise<TTSVoice[]> {
		if (!this.voicesLoaded) {
			await this.loadVoices()
		}

		return this.voices.map(v => ({
			id: v.voiceURI,
			name: v.name,
			language: v.lang,
			isDefault: v.default,
		}))
	}

	onEnd(callback: () => void): void {
		this.endCallback = callback
	}

	onBoundary(callback: (charIndex: number) => void): void {
		this.boundaryCallback = callback
	}

	destroy(): void {
		this.stop()
		this.endCallback = null
		this.boundaryCallback = null
	}
}
