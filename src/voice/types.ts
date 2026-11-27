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
  /** A word of a heading: readers often pass over these without saying them. Words only. */
  heading?: boolean
}

/**
 * Result from the speech matching algorithm.
 */
export interface MatchResult {
  /** Index of the best matching word in the reference text */
  matchedWordIndex: number
  /** The token that was matched */
  token: TextElement | null
  /** How well the last heard words align with the script ending at that word, 0-1 (1 = exact) */
  confidence: number
  /**
   * The same alignment with each heard word weighed as it costs to leave out (short words at half), 0-1.
   * Two short words that happen to match ("I'm") carry the confidence of a whole tail; they carry little here.
   */
  support: number
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
  | 'permission-timeout'
  | 'recognition-failed'
  | 'no-on-device'
  | 'browser-not-supported'

/**
 * Configuration for voice tracking.
 */
export interface VoiceTrackingConfig {
  /** Recognition engine: 'apple' (on-device, macOS, most accurate), 'vosk' (offline model,
   *  cross-platform), or 'auto' (prefer Apple when available, else Vosk). */
  engine?: 'apple' | 'vosk' | 'auto'
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
  /** Window for the global re-sync search, and the floor of the local look-ahead */
  windowSize?: number
  /** Partials that only re-send or revise words already matched are matched at most this often (ms).
   *  A partial with a new word is always matched at once. */
  updateFrequencyMs?: number

  // Read by nothing. The app still passes these from saved settings, so they stay until it stops.
  /** @deprecated Ignored. Capping each step made the place trail a reader; FORWARD_CAP and the pace governor own step size. */
  maxJumpDistance?: number
  /** @deprecated Ignored. Small steps always commit; larger ones need agreeing matches (SMALL_STEP_WORDS). */
  minJumpDistance?: number
  /** @deprecated Ignored. The timed scroll animation was replaced by the damped follower; see `smoothness`. */
  animationBaseMs?: number
  /** @deprecated Ignored, as `animationBaseMs`. */
  animationPerWordMs?: number
  /** @deprecated Ignored. The speech-turn gate it fed was always open; the silence gate (VAD) handles pauses. */
  pauseDetection?: boolean
  /** @deprecated Ignored, as `pauseDetection`. */
  pauseThresholdMs?: number

  // Scroll position settings
  /** Where current word appears on screen (0-100%, from top) */
  scrollPosition?: number
  /** @deprecated Ignored. `highlightLead` and `scrollPosition` place the reading line. */
  readTrail?: number
  /** Scroll-follow smoothness 0..1 (lower = calmer glide, higher = snappier). */
  smoothness?: number
  /** Words to lead (+) or lag (-) the HIGHLIGHT vs the matched word. Offsets recognition
   *  latency / predictive partials so the highlight sits exactly on what you're reading.
   *  + = highlight sits ahead of your voice, - = behind. Default 0. */
  highlightLead?: number
  /** Show the per-word karaoke highlight. When false, voice tracking still scrolls the page
   *  smoothly to follow your voice, but no word is visually highlighted (no jumping box).
   *  Default false — smooth follow without the distracting per-word marker. */
  showWordHighlight?: boolean
}

/**
 * The reader's place moved: the matcher committed a word as where the reader is. Reported on every
 * commit, also when the word is on the line the page already shows (onWordMatch reports only a new
 * scroll target) and while a hand scroll holds the page still.
 */
export interface VoiceReadingMove {
  /** The committed word, the one heard: not the highlight, which may lead it. */
  wordIndex: number
  totalWords: number
  /** That word's span, to measure where the reader is; null before the spans are built. */
  span: HTMLElement | null
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
  {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    voskModel: 'vosk-model-small-pt-0.3',
    modelSizeMB: 31
  },
  // Future languages (Phase 2)
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
