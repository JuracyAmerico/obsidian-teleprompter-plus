/**
 * Voice Tracking Module
 *
 * Provides voice-activated scrolling for Teleprompter Plus.
 * Uses vosk-browser for offline speech recognition.
 */

// Types
export type {
  TextElement,
  MatchResult,
  VoiceTrackingStatus,
  VoiceTrackingError,
  VoiceTrackingConfig,
  VoiceTrackingEvents,
  VoiceLanguage,
  ModelDownloadProgress,
  WordPosition
} from './types'

export { VOICE_LANGUAGES } from './types'

// Core algorithms
export { tokenize, tokenizeWords, tokensToString, cleanWord } from './word-tokenizer'
export { levenshteinDistance, similarity } from './levenshtein'
export {
  computeSpeechRecognitionTokenIndex,
  calculateMatchConfidence,
  findNextPosition
} from './speech-matcher'

// Services
export { VoskRecognizer } from './vosk-recognizer'
export { ModelManager, getModelManager } from './model-manager'
export {
  VoiceTrackingService,
  getVoiceTrackingService,
  resetVoiceTrackingService
} from './voice-tracking-service'
