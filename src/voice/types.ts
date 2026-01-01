/**
 * Voice Tracking Types
 *
 * TypeScript interfaces for the voice tracking system.
 */

/**
 * Represents a tokenized element from the script text.
 * Can be either a word (TOKEN) or a delimiter (whitespace, punctuation).
 */
export interface TextElement {
  /** Type of element */
  type: 'TOKEN' | 'DELIMITER'
  /** The actual text content */
  value: string
  /** Position index in the token array */
  index: number
}

/**
 * Result from the speech matching algorithm.
 */
export interface MatchResult {
  /** Index of the best matching word in the reference text */
  matchedWordIndex: number
  /** The token that was matched */
  token: TextElement | null
}

/**
 * Voice tracking status states.
 */
export type VoiceTrackingStatus =
  | 'off'           // Voice tracking disabled
  | 'initializing'  // Loading model
  | 'listening'     // Actively recognizing speech
  | 'paused'        // Temporarily paused
  | 'error'         // Error state

/**
 * Voice tracking error types.
 */
export type VoiceTrackingError =
  | 'model-not-found'
  | 'model-download-failed'
  | 'microphone-denied'
  | 'microphone-not-found'
  | 'recognition-failed'
  | 'browser-not-supported'

/**
 * Configuration for voice tracking.
 */
export interface VoiceTrackingConfig {
  /** Language code for recognition (e.g., 'en-US') */
  language: string
  /** Scroll behavior when moving to matched word */
  scrollBehavior: 'instant' | 'smooth'
  /** Whether to show the status indicator overlay */
  showIndicator: boolean
  /** Model path or URL */
  modelPath?: string

  // Tuning parameters (user-adjustable for speaking pace)
  /** Confidence threshold for accepting a match (0-1) */
  confidenceThreshold?: number
  /** Look-ahead window size for matching */
  windowSize?: number
  /** Maximum words to scroll at once (smaller = smoother) */
  maxJumpDistance?: number
  /** Minimum words before triggering a scroll */
  minJumpDistance?: number
  /** How often to process partial results (ms) */
  updateFrequencyMs?: number
  /** Base duration for scroll animation (ms) */
  animationBaseMs?: number
  /** Extra animation time per word jumped (ms) */
  animationPerWordMs?: number

  // Pause detection settings
  /** Enable pause detection (stops scrolling when user pauses speaking) */
  pauseDetection?: boolean
  /** Time without new speech to consider as a pause (ms) */
  pauseThresholdMs?: number

  // Scroll position settings
  /** Where current word appears on screen (0-100%, from top) */
  scrollPosition?: number
}

/**
 * Events emitted by the voice tracking service.
 */
export interface VoiceTrackingEvents {
  /** Called when status changes */
  onStatusChange: (_status: VoiceTrackingStatus) => void
  /** Called when speech is recognized */
  onRecognizedText: (_text: string, _isFinal: boolean) => void
  /** Called when a word match is found */
  onWordMatch: (_wordIndex: number, _scrollPosition: number) => void
  /** Called on error */
  onError: (_error: VoiceTrackingError, _message: string) => void
}

/**
 * Supported languages for voice recognition.
 */
export interface VoiceLanguage {
  /** Language code (e.g., 'en-US') */
  code: string
  /** Display name */
  name: string
  /** Vosk model name */
  voskModel: string
  /** Model size in MB */
  modelSizeMB: number
}

/**
 * Available voice languages.
 */
export const VOICE_LANGUAGES: VoiceLanguage[] = [
  {
    code: 'en-US',
    name: 'English (US)',
    voskModel: 'vosk-model-small-en-us-0.15',
    modelSizeMB: 40
  },
  // Future languages (Phase 2)
  // { code: 'pt-BR', name: 'Portuguese (Brazil)', voskModel: 'vosk-model-small-pt-0.3', modelSizeMB: 31 },
  // { code: 'es-ES', name: 'Spanish', voskModel: 'vosk-model-small-es-0.42', modelSizeMB: 39 },
  // { code: 'fr-FR', name: 'French', voskModel: 'vosk-model-small-fr-0.22', modelSizeMB: 41 },
  // { code: 'de-DE', name: 'German', voskModel: 'vosk-model-small-de-0.15', modelSizeMB: 45 },
]

/**
 * Model download progress information.
 */
export interface ModelDownloadProgress {
  /** Whether download is in progress */
  downloading: boolean
  /** Progress percentage (0-100) */
  progress: number
  /** Downloaded bytes */
  downloadedBytes: number
  /** Total bytes */
  totalBytes: number
  /** Error message if failed */
  error?: string
}

/**
 * Word position in the rendered DOM.
 */
export interface WordPosition {
  /** Word index in the token array */
  wordIndex: number
  /** The DOM element containing this word (if found) */
  element: HTMLElement | null
  /** Offset from top of content area */
  offsetTop: number
  /** The word text */
  text: string
}
