/**
 * TTS Service - Main orchestrator for text-to-speech playback.
 * Manages engine lifecycle, sentence queue, playback state, and events.
 */

import type {
	TTSEngine, TTSVoice, TTSState, TTSPlaybackState,
	TTSEngineType, TTSDocument, SpeakOptions,
} from './tts-types'
import { createTTSEngine } from './engine-factory'
import type { TTSEngineConfig } from './engine-factory'
import { cleanDocument, extractBibPath } from '../parser/text-cleaner'
import { resolveCitations, loadBibliography, clearBibCache } from '../parser/citation-resolver'
import { applyPronunciations, normalizeForSpeech, parsePronunciations, spokenSeparators } from '../parser/speech-normalizer'
import { contextAround } from './elevenlabs-request'
import type { CleanerOptions } from '../parser/text-cleaner'

/** Listener callback type */
type TTSListener<T> = (data: T) => void

/** TTS Service configuration */
export interface TTSServiceConfig {
	engineType: TTSEngineType
	rate: number
	voice: string
	language: string
	resolveCitations: boolean
	skipCodeBlocks: boolean
	skipTables: boolean
	// Cloud engine (ElevenLabs) — bring-your-own-key, only used when engineType === 'elevenlabs'
	elevenLabsApiKey: string
	elevenLabsVoiceId: string
	elevenLabsModelId: string
	elevenLabsStability?: number
	elevenLabsSimilarity?: number
}

const DEFAULT_CONFIG: TTSServiceConfig = {
	engineType: 'auto',
	rate: 1.0,
	voice: '',
	language: 'en',
	resolveCitations: true,
	skipCodeBlocks: true,
	skipTables: true,
	elevenLabsApiKey: '',
	elevenLabsVoiceId: '',
	elevenLabsModelId: 'eleven_flash_v2_5',
}

/** Builds the engine for a service. Tests pass a fake; the plugin uses the real factory. */
export type TTSEngineFactory = (type: TTSEngineType, config: TTSEngineConfig) => TTSEngine | null

export class TTSService {
	private engine: TTSEngine | null = null
	private config: TTSServiceConfig
	private createEngine: TTSEngineFactory
	private document: TTSDocument | null = null
	private currentIndex = 0
	private playbackState: TTSPlaybackState = 'idle'
	private isDestroyed = false
	private pronunciations: Array<[string, string]> = []
	/** Read the current sentence again instead of moving on when it ends. */
	private loop = false
	/** Bumped whenever the sentence being spoken is abandoned, so its late failure is not reported. */
	private speechTurn = 0
	/**
	 * The engine holds nothing to resume: the sentence was stopped, skipped or failed. Play then
	 * speaks the current sentence again; resume() would sit on "playing" in silence.
	 */
	private resumeFresh = false

	// Event listeners
	private sentenceStartListeners: TTSListener<{ index: number; text: string }>[] = []
	private sentenceEndListeners: TTSListener<{ index: number }>[] = []
	private stateChangeListeners: TTSListener<TTSState>[] = []
	private errorListeners: TTSListener<{ message: string }>[] = []
	private voicesLoadedListeners: TTSListener<TTSVoice[]>[] = []

	constructor(config: Partial<TTSServiceConfig> = {}, createEngine: TTSEngineFactory = createTTSEngine) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.createEngine = createEngine
	}

	/** Initialize the TTS engine */
	async initialize(): Promise<void> {
		if (this.engine) {
			this.engine.destroy()
		}

		this.engine = this.createEngine(this.config.engineType, {
			elevenLabsApiKey: this.config.elevenLabsApiKey,
			elevenLabsVoiceId: this.config.elevenLabsVoiceId,
			elevenLabsModelId: this.config.elevenLabsModelId,
			elevenLabsStability: this.config.elevenLabsStability,
			elevenLabsSimilarity: this.config.elevenLabsSimilarity,
		})
		if (!this.engine) {
			this.emitError('No TTS engine available')
			return
		}

		try {
			await this.engine.initialize()

			// Wire up end callback for sentence sequencing
			this.engine.onEnd(() => {
				if (this.isDestroyed) return
				this.onSentenceEnd()
			})

			// Load and emit voices
			const voices = await this.engine.getVoices()
			for (const listener of this.voicesLoadedListeners) {
				listener(voices)
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to initialize TTS engine'
			this.emitError(message)
		}
	}

	/** Prepare a document for TTS reading */
	prepareDocument(rawContent: string, bibContent?: string, bibPath?: string): void {
		const cleanerOptions: Partial<CleanerOptions> = {
			skipCodeBlocks: this.config.skipCodeBlocks,
			skipTables: this.config.skipTables,
		}

		// Check for bibliography in frontmatter
		let processedContent = rawContent
		const frontmatterBibPath = extractBibPath(rawContent)

		if (this.config.resolveCitations && bibContent && (bibPath || frontmatterBibPath)) {
			const cacheKey = bibPath || frontmatterBibPath || 'default'
			const entries = loadBibliography(bibContent, cacheKey)
			processedContent = resolveCitations(rawContent, entries)
		}

		this.document = cleanDocument(processedContent, cleanerOptions)
		this.currentIndex = 0
	}

	/** Set a pre-built TTSDocument directly (for DOM-based extraction) */
	setDocument(doc: TTSDocument): void {
		this.document = doc
		this.currentIndex = 0
	}

	/** Start or resume TTS playback */
	async play(): Promise<void> {
		if (!this.engine || !this.document) {
			// Silently ignore — this is expected during startup before a document is loaded
			console.debug('[TTS] play() called before initialization or document preparation — ignoring')
			return
		}

		if (this.playbackState === 'paused') {
			// Set state to 'playing' BEFORE resume — engine.resume() may
			// synchronously fire endCallback if the process died while paused,
			// and onSentenceEnd requires playbackState === 'playing'
			this.setPlaybackState('playing')
			if (this.resumeFresh) {
				await this.speakCurrentSentence()
				return
			}
			this.engine.resume()
			// Re-emit sentenceStart so highlight/scroll re-sync after pause
			this.emitSentenceStart()
			return
		}

		if (this.playbackState === 'playing') return

		this.setPlaybackState('playing')
		await this.speakCurrentSentence()
	}

	/** Pause TTS playback */
	pause(): void {
		if (this.playbackState !== 'playing' || !this.engine) return
		this.engine.pause()
		this.setPlaybackState('paused')
	}

	/**
	 * Pause on the sentence whose start is being announced, before a word of it is spoken: a
	 * sentence-start listener calls this (a take's section end stops before the next heading is read).
	 * Play then speaks that sentence from its start.
	 */
	pauseBeforeSentence(): void {
		if (this.playbackState !== 'playing' || !this.engine) return
		this.halt()
		this.setPlaybackState('paused')
	}

	/** Stop TTS playback and reset to beginning */
	stop(): void {
		if (!this.engine) return
		this.halt()
		this.currentIndex = 0
		this.setPlaybackState('idle')
	}

	/** Toggle play/pause */
	async togglePlayPause(): Promise<void> {
		if (this.playbackState === 'playing') {
			this.pause()
		} else {
			await this.play()
		}
	}

	/** Jump to the next sentence */
	async nextSentence(): Promise<void> {
		if (!this.document) return

		const wasPlaying = this.playbackState === 'playing'
		this.halt()

		if (this.currentIndex < this.document.allSentences.length - 1) {
			this.currentIndex++
		}

		if (wasPlaying) {
			this.setPlaybackState('playing')
			await this.speakCurrentSentence()
		} else {
			this.emitSentenceStart()
			this.emitStateChange()
		}
	}

	/** Jump to the previous sentence */
	async previousSentence(): Promise<void> {
		if (!this.document) return

		const wasPlaying = this.playbackState === 'playing'
		this.halt()

		if (this.currentIndex > 0) {
			this.currentIndex--
		}

		if (wasPlaying) {
			this.setPlaybackState('playing')
			await this.speakCurrentSentence()
		} else {
			this.emitSentenceStart()
			this.emitStateChange()
		}
	}

	/** Jump to a specific section by heading ID */
	async jumpToSection(headingId: string): Promise<void> {
		if (!this.document) return

		const sectionIndex = this.document.sections.findIndex(s => s.headingId === headingId)
		if (sectionIndex === -1) return

		const wasPlaying = this.playbackState === 'playing'
		this.halt()

		// Find the first sentence in this section
		const sentenceIndex = this.document.sectionMap.indexOf(sectionIndex)
		if (sentenceIndex !== -1) {
			this.currentIndex = sentenceIndex
		}

		if (wasPlaying) {
			this.setPlaybackState('playing')
			await this.speakCurrentSentence()
		} else {
			this.emitSentenceStart()
			this.emitStateChange()
		}
	}

	/** Jump to next section */
	async nextSection(): Promise<void> {
		if (!this.document) return

		const currentSectionIndex = this.document.sectionMap[this.currentIndex]
		if (currentSectionIndex === undefined) return

		const nextSectionStart = this.document.sectionMap.indexOf(currentSectionIndex + 1)
		if (nextSectionStart === -1) return

		const wasPlaying = this.playbackState === 'playing'
		this.halt()
		this.currentIndex = nextSectionStart

		if (wasPlaying) {
			this.setPlaybackState('playing')
			await this.speakCurrentSentence()
		} else {
			this.emitSentenceStart()
			this.emitStateChange()
		}
	}

	/** Jump to previous section */
	async previousSection(): Promise<void> {
		if (!this.document) return

		const currentSectionIndex = this.document.sectionMap[this.currentIndex]
		if (currentSectionIndex === undefined || currentSectionIndex === 0) return

		const prevSectionStart = this.document.sectionMap.indexOf(currentSectionIndex - 1)
		if (prevSectionStart === -1) return

		const wasPlaying = this.playbackState === 'playing'
		this.halt()
		this.currentIndex = prevSectionStart

		if (wasPlaying) {
			this.setPlaybackState('playing')
			await this.speakCurrentSentence()
		} else {
			this.emitSentenceStart()
			this.emitStateChange()
		}
	}

	/**
	 * Read the current sentence again from its start. Paused reading resumes with it; with nothing
	 * being read (idle) there is no current sentence, so nothing happens.
	 */
	async repeatCurrent(): Promise<void> {
		if (!this.engine || !this.document || this.playbackState === 'idle') return
		this.halt()
		this.setPlaybackState('playing')
		await this.speakCurrentSentence()
	}

	/** Loop on: the current sentence is read again each time it ends, until loop is turned off. */
	setLoop(on: boolean): void {
		if (this.loop === on) return
		this.loop = on
		this.emitStateChange()
	}

	/** Returns the new setting */
	toggleLoop(): boolean {
		this.setLoop(!this.loop)
		return this.loop
	}

	/** Update playback rate. Engines that can change a sentence already playing do so at once. */
	setRate(rate: number): void {
		this.config.rate = Math.max(0.5, Math.min(2.0, rate))
		this.engine?.setRate?.(this.config.rate)
		this.emitStateChange()
	}

	/** Update voice selection */
	setVoice(voiceId: string): void {
		this.config.voice = voiceId
		this.engine?.setVoice?.(voiceId)
		this.emitStateChange()
	}

	/** The "word = how to say it" list from settings */
	setPronunciations(list: string): void {
		this.pronunciations = parsePronunciations(list)
	}

	/** Update language */
	setLanguage(language: string): void {
		this.config.language = language
		this.emitStateChange()
	}

	/** Update configuration */
	updateConfig(partial: Partial<TTSServiceConfig>): void {
		this.config = { ...this.config, ...partial }
	}

	/** Get current state */
	getState(): TTSState {
		return {
			isActive: this.playbackState !== 'idle',
			playbackState: this.playbackState,
			currentSentenceIndex: this.currentIndex,
			totalSentences: this.document?.allSentences.length || 0,
			rate: this.config.rate,
			engineName: this.engine?.name || 'none',
			voiceId: this.config.voice,
			loop: this.loop,
		}
	}

	/** Get available voices from the current engine */
	async getVoices(): Promise<TTSVoice[]> {
		if (!this.engine) return []
		return this.engine.getVoices()
	}

	/** Get the current document */
	getDocument(): TTSDocument | null {
		return this.document
	}

	/** Get current sentence index */
	getCurrentIndex(): number {
		return this.currentIndex
	}

	// ===== Event subscription =====

	onSentenceStartEvent(listener: TTSListener<{ index: number; text: string }>): () => void {
		this.sentenceStartListeners.push(listener)
		return () => {
			this.sentenceStartListeners = this.sentenceStartListeners.filter(l => l !== listener)
		}
	}

	onSentenceEndEvent(listener: TTSListener<{ index: number }>): () => void {
		this.sentenceEndListeners.push(listener)
		return () => {
			this.sentenceEndListeners = this.sentenceEndListeners.filter(l => l !== listener)
		}
	}

	onStateChange(listener: TTSListener<TTSState>): () => void {
		this.stateChangeListeners.push(listener)
		return () => {
			this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== listener)
		}
	}

	onError(listener: TTSListener<{ message: string }>): () => void {
		this.errorListeners.push(listener)
		return () => {
			this.errorListeners = this.errorListeners.filter(l => l !== listener)
		}
	}

	onVoicesLoaded(listener: TTSListener<TTSVoice[]>): () => void {
		this.voicesLoadedListeners.push(listener)
		return () => {
			this.voicesLoadedListeners = this.voicesLoadedListeners.filter(l => l !== listener)
		}
	}

	/** Clean up all resources */
	destroy(): void {
		this.isDestroyed = true
		this.engine?.destroy()
		this.engine = null
		this.document = null
		this.sentenceStartListeners = []
		this.sentenceEndListeners = []
		this.stateChangeListeners = []
		this.errorListeners = []
		this.voicesLoadedListeners = []
		clearBibCache()
	}

	// ===== Private methods =====

	/** What the engine is given. The sentence on screen is untouched. English number words reach only English. */
	private spokenForm(sentence: string): string {
		const lang = (this.config.language || 'en').toLowerCase()
		const words = spokenSeparators(applyPronunciations(sentence, this.pronunciations), lang)
		return lang.startsWith('en') ? normalizeForSpeech(words) : words
	}

	private optionsFor(index: number): SpeakOptions {
		return {
			rate: this.config.rate,
			voice: this.config.voice || undefined,
			language: this.config.language,
			...contextAround(this.document?.allSentences ?? [], index, s => this.spokenForm(s)),
		}
	}

	private async speakCurrentSentence(): Promise<void> {
		if (!this.engine || !this.document || this.isDestroyed) return

		if (this.currentIndex >= this.document.allSentences.length) {
			// Reached end of document
			this.setPlaybackState('idle')
			return
		}

		const text = this.spokenForm(this.document.allSentences[this.currentIndex])
		this.emitSentenceStart()
		// A listener paused here (pauseBeforeSentence): the sentence waits for Play, unspoken.
		if (this.playbackState !== 'playing') return

		const options = this.optionsFor(this.currentIndex)
		const turn = ++this.speechTurn
		this.resumeFresh = false

		// Hint the engine about the next sentence for pregeneration. A loop reads this one again, and a
		// pregenerated next sentence would be a paid request for nothing.
		const nextIndex = this.currentIndex + 1
		if (!this.loop && nextIndex < this.document.allSentences.length && this.engine.hintNext) {
			// Same spoken form as speak(), or the engine's pregenerated cache key never hits.
			this.engine.hintNext(this.spokenForm(this.document.allSentences[nextIndex]), this.optionsFor(nextIndex))
		}

		try {
			await this.engine.speak(text, options)
		} catch (err) {
			// A sentence that was stopped or skipped may fail on its way out; that is not the reader's problem.
			if (this.isDestroyed || turn !== this.speechTurn) return
			this.failSpeech(err instanceof Error ? err.message : 'Speech failed')
		}
	}

	/**
	 * The current sentence could not be spoken. Reading pauses on it, so the Play button shows and
	 * pressing it tries the same sentence again, and the listeners hear why.
	 */
	private failSpeech(message: string): void {
		this.resumeFresh = true
		if (this.playbackState === 'playing') this.setPlaybackState('paused')
		this.emitError(message)
	}

	/** Abandons the sentence in the engine. Whatever it was doing, play must speak afresh. */
	private halt(): void {
		this.speechTurn++
		this.resumeFresh = true
		this.engine?.stop()
	}

	private onSentenceEnd(): void {
		if (this.isDestroyed || this.playbackState !== 'playing') return

		for (const listener of this.sentenceEndListeners) {
			listener({ index: this.currentIndex })
		}

		// Advance to next sentence, or stay on this one while looping
		if (!this.loop) this.currentIndex++

		if (this.currentIndex >= (this.document?.allSentences.length || 0)) {
			// End of document
			this.setPlaybackState('idle')
			return
		}

		// Speak next sentence
		void this.speakCurrentSentence()
	}

	private setPlaybackState(state: TTSPlaybackState): void {
		this.playbackState = state
		this.emitStateChange()
	}

	private emitSentenceStart(): void {
		if (!this.document) return
		const text = this.document.allSentences[this.currentIndex] || ''
		for (const listener of this.sentenceStartListeners) {
			listener({ index: this.currentIndex, text })
		}
	}

	private emitStateChange(): void {
		const state = this.getState()
		for (const listener of this.stateChangeListeners) {
			listener(state)
		}
	}

	private emitError(message: string): void {
		for (const listener of this.errorListeners) {
			listener({ message })
		}
	}
}
