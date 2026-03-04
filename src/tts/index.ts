export { TTSService } from './tts-service'
export type { TTSServiceConfig } from './tts-service'
export type {
	TTSEngine, TTSVoice, TTSState, TTSPlaybackState,
	TTSEngineType, TTSDocument, TTSSection, SpeakOptions,
	AudioSegment, TTSEventMap,
} from './tts-types'
export { createTTSEngine, getAvailableEngines } from './engine-factory'
export { WebSpeechEngine } from './web-speech-engine'
export { MacSayEngine } from './mac-say-engine'
export { KokoroEngine } from './kokoro-engine'
