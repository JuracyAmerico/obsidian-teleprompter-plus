/**
 * TTS (Text-to-Speech) type definitions for Teleprompter Plus.
 * Defines engine abstraction, playback state, and audio segment types.
 */

/** Available TTS engine types */
export type TTSEngineType = 'mac-say' | 'web-speech' | 'kokoro' | 'elevenlabs' | 'auto'

/** TTS playback state */
export type TTSPlaybackState = 'idle' | 'playing' | 'paused' | 'loading'

/** A voice available for TTS */
export interface TTSVoice {
	id: string
	name: string
	language: string
	isDefault: boolean
}

/** Options for speaking a sentence */
export interface SpeakOptions {
	rate: number     // 0.5 - 2.0
	voice?: string   // Voice ID
	language?: string
}

/** Represents a prepared audio segment (for Kokoro cache) */
export interface AudioSegment {
	sentenceIndex: number
	text: string
	audioPath?: string  // File path for cached audio (Kokoro)
	duration?: number   // Duration in milliseconds
}

/** Aggregate TTS state for UI and BroadcastChannel sync */
export interface TTSState {
	isActive: boolean
	playbackState: TTSPlaybackState
	currentSentenceIndex: number
	totalSentences: number
	rate: number
	engineName: string
	voiceId: string
}

/** Events emitted by the TTS service */
export interface TTSEventMap {
	'sentence-start': { index: number; text: string }
	'sentence-end': { index: number }
	'state-change': TTSState
	'error': { message: string }
	'voices-loaded': TTSVoice[]
}

/** Abstract TTS engine interface */
export interface TTSEngine {
	readonly name: string
	readonly isAvailable: boolean
	initialize(): Promise<void>
	speak(text: string, options: SpeakOptions): Promise<void>
	pause(): void
	resume(): void
	stop(): void
	getVoices(): Promise<TTSVoice[]>
	onEnd(callback: () => void): void
	onBoundary?(callback: (charIndex: number) => void): void
	/** Hint the engine about the next sentence so it can pregenerate audio */
	hintNext?(text: string, options: SpeakOptions): void
	destroy(): void
}

/** A cleaned document section for TTS reading */
export interface TTSSection {
	heading: string
	headingId: string
	sentences: string[]
}

/** A cleaned document ready for TTS */
export interface TTSDocument {
	sections: TTSSection[]
	allSentences: string[]  // Flat list for sequential playback
	sectionMap: number[]    // Maps sentence index -> section index
}
