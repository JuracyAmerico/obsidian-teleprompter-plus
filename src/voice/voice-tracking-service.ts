/**
 * Voice Tracking Service
 *
 * Main orchestrator that connects speech recognition with script matching
 * and scroll control. This is the primary interface for voice tracking.
 */

import type {
  TextElement,
  VoiceTrackingStatus,
  VoiceTrackingError,
  VoiceTrackingConfig,
  WordPosition
} from './types'
import { tokenize, cleanWord } from './word-tokenizer'
import { findNextPosition, findGlobalPosition, type SpeechMatcherConfig } from './speech-matcher'
import { VoskRecognizer } from './vosk-recognizer'
import { AppleSpeechRecognizer } from './apple-speech-recognizer'
import { SpeechActivityDetector } from './speech-activity-detector'

/**
 * Default configuration for voice tracking.
 */
const DEFAULT_CONFIG: VoiceTrackingConfig = {
  language: 'en-US',
  scrollBehavior: 'smooth',
  showIndicator: true,
  // Speech matching tuning - CONSERVATIVE to prevent snowball effect
  confidenceThreshold: 0.35,  // Higher = stricter matching (was 0.20)
  windowSize: 5,              // Smaller look-ahead window (was 6)
  maxJumpDistance: 2,         // Smaller max jump (was 3)
  minJumpDistance: 2,         // Min words before scrolling
  updateFrequencyMs: 800,     // Slower updates (was 500ms)
  animationBaseMs: 400,       // Base animation duration
  animationPerWordMs: 60,     // Extra animation time per word
  // Pause detection defaults
  pauseDetection: true,
  pauseThresholdMs: 1200,     // Time to detect pause
  // Scroll position default (20% from top = 80% runway below)
  scrollPosition: 20
}

// Feature flag: Karaoke word highlighting
const ENABLE_KARAOKE_HIGHLIGHTING = true

// Verbose match/scroll logging to the console for diagnosing tracking. Flip on when needed.
const DEBUG_VOICE_MATCH = true

// Feature flag: silence gate. When on, a no-forward-progress partial only counts toward a stall
// re-sync if the VAD says a human is actually speaking — so a pause (where Apple re-emits a stale
// partial) freezes the highlight instead of leaping it. Fail-open: if the mic VAD can't start,
// isSpeechActive() returns true and behavior is identical to this flag being off.
const ENABLE_SILENCE_GATE = true

// Feature flag: reading-pace governor. Humans read aloud at a roughly steady rate. This essay
// reuses vocabulary heavily, so the matcher can latch a repeated word onto a LATER copy and nudge
// the highlight forward; because backward correction is rejected, those nudges ratchet ahead and a
// constant HIGHLIGHT_LEAD can't undo a cumulative drift. The governor caps how fast the highlight
// may advance to the reader's measured words/sec (with headroom), so a word 8 positions ahead can't
// be reached in 200ms of speech — the ratchet is clamped while normal reading flows. Only gates the
// LOCAL forward-commit path; intentional catch-ups (stall re-sync, R, manual-scroll SNAP) bypass it.
const ENABLE_PACE_GOVERNOR = true

/**
 * Voice Tracking Service - the main interface for voice-controlled scrolling.
 */
export class VoiceTrackingService {
  private recognizer: VoskRecognizer | AppleSpeechRecognizer
  private config: VoiceTrackingConfig
  private tokens: TextElement[] = []
  private wordTokens: TextElement[] = []  // Word-only tokens (no delimiters)
  private wordPositions: Map<number, WordPosition> = new Map()
  private wordSpans: Map<number, HTMLSpanElement> = new Map()  // Karaoke word spans
  private currentWordIndex: number = 0
  private highlightedWordIndex: number = -1  // Currently highlighted word
  private status: VoiceTrackingStatus = 'off'
  private lastRecognizedText: string = ''
  private contentArea: HTMLElement | null = null
  private isInitialized: boolean = false  // Track if word spans are created

  // Pause detection state
  private lastSpeechTime: number = 0
  private lastMatchedIndex: number = -1
  private noProgressCount: number = 0
  private isPaused: boolean = false

  // Global search state - for starting from any position
  private needsGlobalSearch: boolean = true
  private consecutiveFailedMatches: number = 0
  private readonly FAILED_MATCH_THRESHOLD = 8  // After this many failures, try global search

  // Grammar-constrained recognition: vocabulary derived from the current script
  private vocabulary: string | undefined = undefined
  private contextVocabulary: string | undefined = undefined

  // Global-jump hardening: a FAR global match must be confirmed by a second,
  // agreeing global match before we commit — stops one mis-hear from flinging
  // the reader to an unrelated part of the document.
  private pendingGlobalIndex: number = -1
  private readonly GLOBAL_JUMP_CONFIRM_DISTANCE = 25  // words; farther jumps need confirmation

  // Forward catch-up: when the reader is clearly ahead, snap forward immediately
  // (bypassing the smooth per-step cap + accumulator) so we never trail a fast reader.
  // Per-update advance cap for smooth tracking. Fixed (not tied to the jittery preset) so it
  // keeps pace without lurching. NO forward "catch-up" easing — pushing ahead of the matched
  // position created a positive-feedback snowball that accelerated the further you read.
  private readonly SMOOTH_STEP_CAP = 10
  // Damped-follower scroll: each animation frame eases scrollTop a fraction toward the LATEST
  // target. Smooth like an animation, but it always reads the current target (no captured
  // velocity) so it can't overshoot/race; and it eases rather than hard-snapping, so no jumps.
  // FOLLOW_FACTOR: lower = smoother/calmer, higher = snappier. ~0.12-0.22 is the usable range.
  private targetScrollPos = 0
  // Both live-tunable from settings:
  // FOLLOW_FACTOR (smoothness) — lower = calmer glide, higher = snappier.
  private get FOLLOW_FACTOR(): number { return this.config.smoothness ?? 0.16 }
  // READ_TRAIL — how many words BEHIND your spoken word the scroll anchors. The fix for
  // "the scroll runs ahead of me": raise it until the line you're reading sits comfortably.
  private get READ_TRAIL(): number { return this.config.readTrail ?? 8 }
  // Anchor the scroll a few words BEHIND the spoken word, so the line you're reading always sits
  // slightly ahead of the scroll. Prevents the text from running ahead of your voice.
  private readonly READ_AHEAD_LAG = 4
  // Re-sync only relocates within this many words of where the reader is looking —
  // a bounded search can never teleport to the end of the document.
  private readonly GLOBAL_SEARCH_RADIUS = 120
  // If the local (forward-only) matcher makes zero progress for this many processed partials,
  // the reader has drifted past the ~13-word local window (typically at a section header where
  // Apple restarts its speech segment) and forward matching can NEVER recover on its own. Trigger
  // one bounded, scroll-anchored re-sync to re-acquire them. Safe now (unlike the old teleporting
  // auto-search) because the search is capped to GLOBAL_SEARCH_RADIUS around where they're looking
  // AND far jumps still need 2-of-3 confirmation. ~3 partials ≈ 1.2s of being stuck — tuned down
  // from 5 so the highlight unfreezes faster at section boundaries (the forward "freeze-then-leap"
  // lag), accepting slightly more eager re-sync as the trade.
  private readonly STALL_RESYNC_THRESHOLD = 3

  // Manual-scroll override: when the reader grabs the page (wheel / trackpad / touch) to reposition
  // — usually because tracking drifted — auto-follow must YIELD, or it fights them and snaps the page
  // back, making manual scrolling feel impossible. We record the last manual scroll and then:
  //   1. suspend auto-scroll for USER_SCROLL_GRACE_MS so the page stays where they put it, and
  //   2. arm a bounded re-sync so once they stop and speak, tracking re-acquires at the spot they
  //      scrolled to (the global search anchors to the new viewport via estimateWordIndexFromScroll).
  private userScrolledAt = 0
  private readonly USER_SCROLL_GRACE_MS = 2000
  private userScrollHandler: (() => void) | null = null
  private guardedScrollArea: HTMLElement | null = null
  // Set when the reader manually scrolls. The next partial SNAPS the matcher's index to the word
  // at the parked scroll position and resumes LOCAL matching from there — NOT a global re-search.
  // (An earlier version armed needsGlobalSearch here; combined with rapid manual scrolls + off-script
  //  speech it produced wild far jumps — "it jumps so far ahead". Snap-to-scroll + local is calm.)
  private resyncToScrollPending = false

  // Voice-activity detector (own mic, 85–3400 Hz band). Gates the stall re-sync so a genuine pause
  // can't be mistaken for the reader running ahead. Fail-open — see ENABLE_SILENCE_GATE.
  private speechDetector = new SpeechActivityDetector()

  // Reading-pace governor (see ENABLE_PACE_GOVERNOR). Rolling window of recent local-commit samples
  // {time, committed index} used to estimate words/sec and cap forward advance to human reading speed.
  private paceSamples: { t: number; idx: number }[] = []
  private lastCommitTime = 0
  private readonly PACE_WINDOW_MS = 4000      // estimate pace over the last ~4s of reading
  private readonly PACE_TOLERANCE = 1.7       // allow bursts up to 1.7× measured pace before clamping
  private readonly MIN_PACE_WPS = 1.5         // floor (words/sec) so the governor never strangles
  private readonly MAX_PACE_WPS = 6           // ceiling so a fast reader is never clamped to a crawl

  // Confidence gating (Textream): big forward jumps need 2-of-3 recent matches to agree; small
  // steps always commit. Stops a single over-match from pushing the highlight ahead of your voice.
  private recentMatchPositions: number[] = []
  private readonly SMALL_STEP_WORDS = 2   // a jump this small commits immediately (responsive)
  private readonly AGREE_WORDS = 3        // recent matches within this many words count as agreeing
  private readonly FORWARD_CAP = 10       // max words the highlight may advance in one commit (anti-lurch); raised from 5 so it catches up to a faster reader once alignment is exact
  // Lead (+) or lag (-) the highlight vs the matched word, to offset recognition latency and
  // Apple's predictive partials. User-tunable LIVE via the "Highlight offset" slider (no rebuild).
  // Default -4 = sit four words BEHIND the recognized word, so the highlight stays under your voice.
  // Why so negative: Apple emits words slightly BEFORE you finish saying them and the confirm-gate
  // commits up to FORWARD_CAP(5) words forward, so the matched index runs a few words ahead of your
  // literal voice; -2 wasn't enough to cover it. If -4 feels laggy, raise the slider toward 0.
  // Default +2: with span-index ≡ token-index, the only residual lag is recognition latency (Apple
  // emits the partial a beat after you speak), so the highlight should sit a hair AHEAD of the
  // committed word. This used to be -4 ONLY to mask the forward index-drift, which is now fixed.
  private get HIGHLIGHT_LEAD(): number { return this.config.highlightLead ?? 2 }
  // Set by forceResync(): the next global match commits immediately, no confirmation gate.
  private resyncRequested = false

  // Turn-based scrolling state
  private lastSpeechResultTime: number = 0      // Last time we received ANY speech result
  private isInSpeechTurn: boolean = false       // Are we currently in an active speech turn?
  private silenceCheckTimer: number | null = null  // Timer for detecting silence
  private pendingScrollTarget: number = -1      // Accumulated scroll target
  private matchAccumulator: number[] = []       // Recent match positions for averaging
  private readonly MATCH_ACCUMULATOR_SIZE = 2   // consistent matches before scrolling (rejects single overshoots, stays responsive)

  // Callbacks
  onPauseChange?: (_isPaused: boolean) => void
  onWordMatch?: (_wordIndex: number, _scrollPosition: number) => void
  onStatusChange?: (_status: VoiceTrackingStatus) => void
  onRecognizedText?: (_text: string, _isFinal: boolean) => void
  onError?: (_error: VoiceTrackingError, _message: string) => void
  onProgress?: (_loaded: number, _total: number) => void

  /**
   * Create a new VoiceTrackingService.
   *
   * @param config - Configuration options
   */
  constructor(config: Partial<VoiceTrackingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    // Engine selection: Apple on-device Speech (macOS, far more accurate) when available,
    // else Vosk (offline model, cross-platform). 'auto' prefers Apple when supported.
    const wantApple = this.config.engine === 'apple' ||
      (this.config.engine !== 'vosk' && AppleSpeechRecognizer.isSupported())
    this.recognizer = wantApple ? new AppleSpeechRecognizer() : new VoskRecognizer()

    // Wire up recognizer events
    this.recognizer.onResult((text, isFinal) => {
      this.handleRecognitionResult(text, isFinal)
    })

    this.recognizer.onStatus((status) => {
      this.status = status
      this.onStatusChange?.(status)
    })

    this.recognizer.onError((error, message) => {
      this.onError?.(error, message)
    })

    this.recognizer.onProgress((loaded, total) => {
      this.onProgress?.(loaded, total)
    })
  }

  /**
   * Check if voice tracking is supported in this environment.
   */
  static isSupported(): boolean {
    return VoskRecognizer.isSupported()
  }

  /**
   * Initialize the service with content and a reference to the content area.
   *
   * @param content - The script text to track
   * @param contentArea - The DOM element containing the rendered content
   */
  initialize(content: string, contentArea: HTMLElement): void {
    // Tokenize the content
    this.tokens = tokenize(content)
    this.wordTokens = this.tokens.filter(t => t.type === 'TOKEN')

    // Build a grammar from the script vocabulary and keep the recognizer in sync
    // (handles switching documents without reloading the Vosk model).
    this.vocabulary = this.buildGrammar()
    // Vosk needs the lowercased grammar; Apple's contextualStrings bias works far better with the
    // ORIGINAL casing/hyphens (proper nouns + headers are exactly what it mis-hears). Feed each
    // recognizer the form it wants.
    this.contextVocabulary = this.buildContextVocabulary()
    this.recognizer.updateGrammar(
      this.recognizer instanceof AppleSpeechRecognizer ? this.contextVocabulary : this.vocabulary
    )

    this.contentArea = contentArea
    this.attachUserScrollGuard(contentArea)
    this.currentWordIndex = 0
    this.lastRecognizedText = ''

    // Build word position map
    this.buildWordPositionMap()

    // Debug logging removed
  }

  /**
   * Build a map of word positions in the rendered DOM.
   * If karaoke highlighting is enabled, wraps each word in a span.
   * Otherwise, just estimates positions based on content height.
   */
  private buildWordPositionMap(): void {
    this.wordPositions.clear()
    this.wordSpans.clear()

    if (!this.contentArea) {
      return
    }

    // Re-tokenize from DOM content for accurate matching
    const domText = this.contentArea.textContent || ''
    this.tokens = tokenize(domText)
    this.wordTokens = this.tokens.filter(t => t.type === 'TOKEN')

    // If karaoke is disabled, use simple position estimation
    if (!ENABLE_KARAOKE_HIGHLIGHTING) {
      // Estimate word positions based on content height
      const contentHeight = this.contentArea.scrollHeight
      const totalWords = this.wordTokens.length

      for (let i = 0; i < totalWords; i++) {
        // Linear distribution of words across content height
        const estimatedTop = (i / totalWords) * contentHeight
        this.wordPositions.set(i, {
          wordIndex: i,
          element: null,
          offsetTop: estimatedTop,
          text: this.wordTokens[i].value
        })
      }

      this.isInitialized = true
      return
    }

    // === KARAOKE MODE: Wrap words in spans ===
    // Skip elements that shouldn't be processed (code blocks, etc.)
    const skipSelectors = 'pre, code, .embedded-note, script, style'

    // Collect all text nodes first (walker gets invalidated when DOM changes)
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(
      this.contentArea,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if inside elements we shouldn't modify
          const parent = node.parentElement
          if (parent?.closest(skipSelectors)) {
            return NodeFilter.FILTER_REJECT
          }
          // Skip if already wrapped in voice-word span
          if (parent?.classList.contains('voice-word')) {
            return NodeFilter.FILTER_REJECT
          }
          return NodeFilter.FILTER_ACCEPT
        }
      }
    )

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text)
    }

    let globalWordIndex = 0
    // Rebuilt in lockstep with the spans below so wordSpans.get(i) and wordTokens[i] are
    // ALWAYS the same physical word. This replaces the whole-document tokenize() at the top
    // of the method, which counted code blocks and split compounds differently than the wrap.
    const rebuiltTokens: TextElement[] = []

    // Process each text node
    for (const textNode of textNodes) {
      const text = textNode.textContent || ''
      if (!text.trim()) continue

      const parent = textNode.parentElement
      if (!parent) continue

      // Wrap words using the SAME tokenizer the matcher uses, so a span's index is
      // IDENTICAL to its wordTokens index. The previous code split on whitespace only,
      // which kept "cross-border" / "don't" as ONE span while tokenize() (hyphen and
      // apostrophe are delimiters) counts them as TWO word tokens. Each such compound
      // advanced the matcher's index by 2 but the span index by 1 — a per-occurrence
      // drift that accumulates with depth, so deep in the document the highlight lands
      // ~30 words AHEAD of the spoken word even though the matcher was locked on correctly.
      // Driving both off tokenize() makes span-index ≡ token-index by construction.
      const elements = tokenize(text)
      if (elements.length === 0) continue

      // Create a document fragment with wrapped words
      const fragment = document.createDocumentFragment()

      for (const element of elements) {
        if (element.type !== 'TOKEN') {
          // Delimiter (whitespace, punctuation, hyphen, apostrophe) — keep as plain text.
          fragment.appendChild(document.createTextNode(element.value))
          continue
        }

        // A word — wrap it, keyed by the matcher's token index.
        const span = document.createElement('span')
        span.className = 'voice-word'
        span.dataset.wordIndex = String(globalWordIndex)
        span.textContent = element.value

        fragment.appendChild(span)

        this.wordSpans.set(globalWordIndex, span)
        this.wordPositions.set(globalWordIndex, {
          wordIndex: globalWordIndex,
          element: span,
          offsetTop: 0, // Will be updated after DOM insertion
          text: element.value
        })
        rebuiltTokens.push(element)

        globalWordIndex++
      }

      // Replace the text node with our fragment
      parent.replaceChild(fragment, textNode)
    }

    // CRITICAL: the matcher must index the EXACT same word list as the highlight. Replace the
    // whole-document tokens (which included skipped code blocks and counted compounds differently)
    // with the tokens we actually wrapped, in order. Now wordSpans.get(i) ↔ wordTokens[i] forever.
    if (rebuiltTokens.length > 0) {
      this.wordTokens = rebuiltTokens
    }

    // Update offsetTop values after DOM is modified
    this.wordSpans.forEach((span, index) => {
      const position = this.wordPositions.get(index)
      if (position) {
        position.offsetTop = span.offsetTop
        position.element = span
      }
    })

    this.isInitialized = true
  }

  /**
   * Highlight the current word (karaoke style).
   * @param wordIndex - Index of the word to highlight
   */
  highlightWord(wordIndex: number): void {
    if (this.highlightedWordIndex === wordIndex) return

    // The previously-current word becomes "past" (read).
    if (this.highlightedWordIndex >= 0 && this.highlightedWordIndex !== wordIndex) {
      const prevSpan = this.wordSpans.get(this.highlightedWordIndex)
      if (prevSpan) {
        prevSpan.classList.remove('voice-active')
        prevSpan.classList.add('voice-past')
      }
    }

    // Mark everything up to the current word as past, then highlight the current word.
    // (Handles forward jumps so the read/unread boundary stays correct.)
    for (const [idx, span] of this.wordSpans) {
      if (idx < wordIndex) {
        if (!span.classList.contains('voice-past')) span.classList.add('voice-past')
        span.classList.remove('voice-active')
      }
    }

    const span = this.wordSpans.get(wordIndex)
    if (span) {
      span.classList.add('voice-active')
      span.classList.remove('voice-past')
      this.highlightedWordIndex = wordIndex
    }
  }

  /**
   * Clear all word highlights.
   */
  clearHighlights(): void {
    this.wordSpans.forEach(span => {
      span.classList.remove('voice-active')
    })
    this.highlightedWordIndex = -1
  }

  /**
   * Clean up word wrapping (restore original DOM).
   * Called when voice tracking is stopped or disposed.
   */
  private unwrapWords(): void {
    if (!this.contentArea || !this.isInitialized) return

    // Find all voice-word spans and replace with text nodes
    const spans = this.contentArea.querySelectorAll('.voice-word')
    spans.forEach(span => {
      const text = document.createTextNode(span.textContent || '')
      span.parentNode?.replaceChild(text, span)
    })

    // Normalize to merge adjacent text nodes
    this.contentArea.normalize()

    this.wordSpans.clear()
    this.isInitialized = false
  }

  /**
   * Start voice tracking.
   * Initializes the recognizer if needed and starts listening.
   */
  async start(): Promise<void> {
    if (this.status === 'listening') {
      return
    }

    try {
      // Initialize recognizer if not already done
      if (!this.recognizer.getIsInitialized()) {
        this.onStatusChange?.('initializing')
        await this.recognizer.initialize(
          this.config.language,
          this.recognizer instanceof AppleSpeechRecognizer ? this.contextVocabulary : this.vocabulary
        )
      }

      // Start listening
      this.resetPaceGovernor()
      await this.recognizer.start()

      // Start the silence-gate VAD in parallel (fail-open: never throws, never blocks tracking).
      if (ENABLE_SILENCE_GATE) {
        void this.speechDetector.start().then(() => {
          if (DEBUG_VOICE_MATCH) {
            console.warn(`[VT]   silence gate ${this.speechDetector.getIsAvailable() ? 'ACTIVE' : 'unavailable → fail-open'}`)
          }
        })
      }

    } catch (error) {
      console.error('Failed to start voice tracking:', error)
      throw error
    }
  }

  /**
   * Stop voice tracking.
   */
  stop(): void {
    this.recognizer.stop()
    this.speechDetector.stop()
    this.lastRecognizedText = ''

    // Reset global search state - next start will find position from scratch
    this.needsGlobalSearch = true
    this.consecutiveFailedMatches = 0

    // Cancel any ongoing scroll animation
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId)
      this.scrollAnimationId = null
    }

    // Clear turn-based scrolling state
    if (this.silenceCheckTimer !== null) {
      window.clearTimeout(this.silenceCheckTimer)
      this.silenceCheckTimer = null
    }
    this.isInSpeechTurn = false
    this.matchAccumulator = []
    this.pendingScrollTarget = -1
    this.noProgressCount = 0

    // Clear karaoke highlights (but keep spans for potential restart)
    this.clearHighlights()
  }

  /**
   * Toggle voice tracking on/off.
   */
  async toggle(): Promise<void> {
    if (this.status === 'listening') {
      this.stop()
    } else {
      await this.start()
    }
  }

  /**
   * User-triggered re-sync. Forgets the current position and re-locates the
   * reader from the next few spoken words via a fresh global search. Bind this
   * to a hotkey so a presenter who drifts can snap back without stopping.
   */
  forceResync(): void {
    this.needsGlobalSearch = true
    this.resyncRequested = true   // next global match commits immediately, even a far one
    this.consecutiveFailedMatches = 0
    this.pendingGlobalIndex = -1
    this.matchAccumulator = []
  }

  /**
   * Build a Vosk grammar (JSON string-array of allowed words) from the current
   * script. Constraining recognition to words actually in the document is the
   * single biggest accuracy win — far fewer mis-hears, far fewer false jumps.
   * Returns undefined for very large or empty vocabularies so we fall back to
   * open recognition (Vosk's grammar FST is impractical past ~1k unique words).
   */
  private buildGrammar(): string | undefined {
    const unique = new Set<string>()
    for (const t of this.wordTokens) {
      const w = cleanWord(t.value)
      if (w) unique.add(w)
    }
    if (unique.size === 0 || unique.size > 1000) return undefined
    return JSON.stringify([...unique, '[unk]'])
  }

  /**
   * Build the contextualStrings hint list for Apple's on-device recognizer from the ORIGINAL
   * token text (preserving case + internal hyphens), NOT the lowercased Vosk grammar. Proper
   * nouns and section headers ("Module", "Hamid", "U-Haul", "UX") are exactly what SFSpeechRecognizer
   * mis-hears, and the bias is much stronger when they are supplied in natural form. We surface those
   * "strong" tokens first (capitalized / numeric / hyphenated), then fill with other 4+ char words,
   * dedup case-insensitively, and cap the list (Apple ignores an oversized hint set).
   */
  private buildContextVocabulary(): string | undefined {
    const isStrong = (w: string) => /^[A-ZÀ-Þ0-9]/.test(w) || w.includes('-')
    const strip = (v: string) => v.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, '')
    const strong: string[] = []
    const rest: string[] = []
    const seen = new Set<string>()
    for (const t of this.wordTokens) {
      const w = strip(t.value)
      if (!w || w === '[unk]') continue
      const key = w.toLowerCase()
      if (seen.has(key)) continue
      if (isStrong(w)) { seen.add(key); strong.push(w) }
      else if (w.length >= 4) { seen.add(key); rest.push(w) }
    }
    // Cap matches the Swift sidecar's contextualStrings limit (100); strong tokens are first so
    // proper nouns survive the cut even when the script is long.
    const salient = [...strong, ...rest].slice(0, 100)
    return salient.length ? JSON.stringify(salient) : undefined
  }

  /**
   * Reset tracking position to the beginning.
   */
  reset(): void {
    this.currentWordIndex = 0
    this.lastRecognizedText = ''

    // Reset global search state - will search for position on next speech
    this.needsGlobalSearch = true
    this.consecutiveFailedMatches = 0

    // Reset turn-based scrolling state
    this.matchAccumulator = []
    this.pendingScrollTarget = -1
    this.noProgressCount = 0

    // Scroll to top
    if (this.contentArea) {
      this.contentArea.scrollTop = 0
    }
  }

  // Throttle partial results to avoid too many scroll operations
  private lastPartialProcessTime: number = 0

  // Smooth scroll animation state
  private scrollAnimationId: number | null = null

  // Getters for tuning parameters (from config)
  private get PARTIAL_THROTTLE_MS(): number { return this.config.updateFrequencyMs ?? 400 }
  private get MIN_JUMP_DISTANCE(): number { return this.config.minJumpDistance ?? 3 }
  private get MAX_JUMP_DISTANCE(): number { return this.config.maxJumpDistance ?? 8 }
  private get SCROLL_DURATION_BASE_MS(): number { return this.config.animationBaseMs ?? 350 }
  private get SCROLL_DURATION_PER_WORD_MS(): number { return this.config.animationPerWordMs ?? 50 }
  private get PAUSE_DETECTION_ENABLED(): boolean { return this.config.pauseDetection ?? true }
  private get PAUSE_THRESHOLD_MS(): number { return this.config.pauseThresholdMs ?? 1500 }
  private get SCROLL_POSITION(): number { return this.config.scrollPosition ?? 30 }

  /**
   * Handle recognition results from the recognizer.
   * Uses turn-based scrolling: accumulates matches during active speech,
   * only scrolls when we have consistent matches.
   */
  private handleRecognitionResult(text: string, isFinal: boolean): void {
    this.lastRecognizedText = text
    this.onRecognizedText?.(text, isFinal)

    const now = Date.now()

    // Mark that we received speech - this starts/continues a speech turn
    this.markSpeechActivity()

    // For partial results, throttle to avoid too many match operations
    if (!isFinal) {
      if (now - this.lastPartialProcessTime < this.PARTIAL_THROTTLE_MS) {
        return // Skip this partial, too soon
      }
      // Only process partials with at least 3 words
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length
      if (wordCount < 3) {
        return // Too few words to match reliably
      }
      this.lastPartialProcessTime = now
    }

    // Build speech matcher config from service config
    const matcherConfig: SpeechMatcherConfig = {
      windowSize: this.config.windowSize ?? 6,
      maxJumpDistance: this.config.maxJumpDistance ?? 3,
      confidenceThreshold: this.config.confidenceThreshold ?? 0.20
    }

    // Manual-scroll snap: the reader scrolled to reposition, so trust where they parked the page.
    // Move the matcher's index to the word at the scroll position and resume LOCAL matching from
    // there — no global re-search (which produced the far jumps). The page itself stays put while
    // the grace window is active (the YIELD below); this only re-anchors WHERE matching looks.
    if (this.resyncToScrollPending) {
      this.resyncToScrollPending = false
      const snapTo = this.estimateWordIndexFromScroll()
      if (snapTo >= 0 && Math.abs(snapTo - this.currentWordIndex) > this.SMALL_STEP_WORDS) {
        this.currentWordIndex = snapTo
        this.lastMatchedIndex = snapTo
        this.recentMatchPositions = []
        this.matchAccumulator = []
        this.consecutiveFailedMatches = 0
        this.needsGlobalSearch = false
        this.resetPaceGovernor()  // discontinuity: don't clamp the next commit against pre-snap pace
        if (DEBUG_VOICE_MATCH) console.warn(`[VT]   SNAP → matcher re-anchored to scroll position #${snapTo} (manual scroll)`)
      }
    }

    let newIndex: number
    let isGlobalMatch = false  // Flag for global search result

    // Global search ONLY on initial start / explicit R re-sync — NEVER on mid-reading
    // failures. The old auto-global-search-on-failures (consecutiveFailedMatches) is exactly
    // what teleported the reader to the end on a few mis-hears. Off-script now simply holds
    // position until forward matching resumes or the user presses R. And the search is
    // bounded near where they're looking, so it can't jump to an unrelated section.
    if (this.needsGlobalSearch) {
      // Get hint position based on current scroll (where user is looking)
      const hintPosition = this.estimateWordIndexFromScroll()

      const globalIndex = findGlobalPosition(text, this.wordTokens, matcherConfig, hintPosition, this.GLOBAL_SEARCH_RADIUS)

      if (globalIndex >= 0) {
        // Found a match anywhere in document
        newIndex = globalIndex
        isGlobalMatch = true
        this.needsGlobalSearch = false
        this.consecutiveFailedMatches = 0
      } else {
        // No global match found, try local anyway
        newIndex = findNextPosition(text, this.wordTokens, this.currentWordIndex, matcherConfig)
      }
    } else {
      // Normal forward-only search
      newIndex = findNextPosition(text, this.wordTokens, this.currentWordIndex, matcherConfig)
    }

    // Calculate jump distance
    const jumpDistance = newIndex - this.currentWordIndex

    if (DEBUG_VOICE_MATCH) {
      const heardTail = text.split(/\s+/).filter(Boolean).slice(-6).join(' ')
      const matchedWord = this.wordTokens[newIndex]?.value ?? '?'
      const curWord = this.wordTokens[this.currentWordIndex]?.value ?? '?'
      console.warn(
        `[VT] ${isFinal ? 'FINAL' : 'part '} heard:"…${heardTail}" | match #${newIndex} "${matchedWord}"` +
        ` | cur #${this.currentWordIndex} "${curWord}" | jump ${jumpDistance} | ${isGlobalMatch ? 'GLOBAL' : 'local'}`
      )
    }

    // Track failed matches (no forward progress from local search)
    if (jumpDistance <= 0 && !isGlobalMatch) {
      // Silence gate: a no-progress partial only counts toward a stall if a human is actually
      // speaking. During a real pause Apple re-emits a stale partial — without this gate those
      // pile up and trigger a spurious catch-up leap. Fail-open: isSpeechActive() is true when the
      // VAD is unavailable, so this collapses to the original behavior.
      const speaking = !ENABLE_SILENCE_GATE || this.speechDetector.isSpeechActive()
      if (speaking) {
        this.consecutiveFailedMatches++
        // Prolonged stall: the reader has run past the local match window and forward matching can't
        // recover. Arm ONE bounded re-sync (scroll-anchored, ±GLOBAL_SEARCH_RADIUS, confirmation-gated)
        // so the next partial re-acquires them instead of staying stuck until they press R.
        if (this.consecutiveFailedMatches >= this.STALL_RESYNC_THRESHOLD) {
          this.needsGlobalSearch = true
          this.consecutiveFailedMatches = 0
          if (DEBUG_VOICE_MATCH) console.warn('[VT]   STALL → bounded re-sync armed (reader drifted past local window)')
        }
      } else if (DEBUG_VOICE_MATCH) {
        console.warn('[VT]   silence gate → stale partial held (no speech energy), not counting toward re-sync')
      }
    } else if (jumpDistance > 0 || isGlobalMatch) {
      this.consecutiveFailedMatches = 0
    }

    // Global matches: small corrections commit immediately, but a FAR jump must be
    // confirmed by a second agreeing global match before we move — one mis-hear can
    // no longer fling the reader to an unrelated section.
    if (isGlobalMatch) {
      // HARD-reject BACKWARD re-acquisition. In a forward-read teleprompter the reader never needs
      // the highlight to jump back on its own — a stall means they ran AHEAD, so recovery is forward.
      // A backward global match is the matcher latching onto an EARLIER copy of a repeated phrase
      // (this essay reuses "the word pause", "my label didn't reflect", etc.), which flings the
      // highlight hundreds of words back ("the highlight is way behind"). Confirmation isn't enough —
      // two repeated-phrase matches can agree and confirm a wrong −266 jump — so this is unconditional.
      // Deliberate back-navigation still works: R (resyncRequested) and manual scroll (the SNAP path)
      // both bypass this. If the highlight ever genuinely runs ahead, it simply holds until you read
      // forward into it or press R, instead of teleporting backward.
      if (!this.resyncRequested && newIndex < this.currentWordIndex - this.SMALL_STEP_WORDS) {
        this.needsGlobalSearch = false
        this.pendingGlobalIndex = -1
        if (DEBUG_VOICE_MATCH) console.warn(`[VT]   GLOBAL backward → #${newIndex} REJECTED (behind cur #${this.currentWordIndex}); holding`)
        return
      }
      const globalJump = Math.abs(newIndex - this.currentWordIndex)
      const confirmed = this.pendingGlobalIndex >= 0 &&
        Math.abs(newIndex - this.pendingGlobalIndex) <= 5

      if (this.resyncRequested || globalJump <= this.GLOBAL_JUMP_CONFIRM_DISTANCE || confirmed) {
        // User-requested re-sync commits immediately (no confirmation) — that's the whole point of R.
        this.resyncRequested = false
        this.pendingGlobalIndex = -1
        this.currentWordIndex = newIndex
        this.lastMatchedIndex = newIndex
        this.matchAccumulator = []  // Clear accumulator on global jump
        this.resetPaceGovernor()    // discontinuity: a catch-up jump must not be clamped by pace
        this.scrollToWord(newIndex)
      } else {
        // First far global match — hold it and re-search next time to confirm
        this.pendingGlobalIndex = newIndex
        this.needsGlobalSearch = true
      }
      return
    }

    // === TURN-BASED SCROLLING ===
    // Only process if we're in an active speech turn
    if (!this.isInSpeechTurn) {
      return
    }

    // Canonical model (jlecomte Content.tsx): on ANY forward match, snap the matched word to the
    // anchor immediately. No accumulator, no per-update cap, no momentum animation — those caused
    // the scroll to lag, then overshoot and race ahead of the reader across Apple's fast partials.
    if (jumpDistance > 0) {
      // Confidence gating (Textream's matchCharacters): a SMALL forward step commits immediately so
      // normal reading stays responsive; a LARGER jump must be confirmed by 2-of-3 recent matches
      // agreeing — so a single noisy over-match can't fling the highlight ahead of your voice.
      this.recentMatchPositions.push(newIndex)
      if (this.recentMatchPositions.length > 3) this.recentMatchPositions.shift()
      const smallStep = jumpDistance <= this.SMALL_STEP_WORDS
      let confirmed = false
      if (this.recentMatchPositions.length >= 2) {
        const agree = this.recentMatchPositions.filter(p => Math.abs(p - newIndex) <= this.AGREE_WORDS).length
        confirmed = agree >= 2
      }
      // CATCH-UP ESCAPE HATCH. The agreement gate above asks recent matches to CLUSTER near one
      // target — but when you surge through a mis-heard clause ("...U-Haul work, was an international
      // mover — which is to say..."), each partial matches a DIFFERENT forward word, so they never
      // cluster and the jump is gated forever: the highlight freezes on "Marina" while you read on.
      // The fix uses the one fact that makes "behind" different from "fling ahead": you cannot
      // accidentally SPEAK words far ahead, so two independent matches BOTH landing well past the
      // highlight mean the reader genuinely moved on. That is safe to chase immediately. (A single
      // noisy over-match still can't trigger it — it takes two votes. Backward flings are rejected
      // elsewhere.) FORWARD_CAP still bounds each step, so catch-up closes the gap over 1–2 commits
      // rather than one jarring leap.
      const CATCHUP_AHEAD = this.AGREE_WORDS + 1
      const aheadVotes = this.recentMatchPositions.filter(
        p => p >= this.currentWordIndex + CATCHUP_AHEAD
      ).length
      const catchingUp = aheadVotes >= 2
      if (smallStep || confirmed || catchingUp) {
        // Cap the advance so a single over-reaching match can't lurch the highlight far ahead.
        let capped = Math.min(newIndex, this.currentWordIndex + this.FORWARD_CAP)
        // Reading-pace governor: also cap to human reading speed, defeating the repeated-vocabulary
        // ratchet that a constant lead can't. Bypassed at start (no pace history yet) and fail-safe.
        // ALSO bypassed while catching up: a genuine fall-behind is a discontinuity, and clamping it
        // to "plausible pace" is exactly what keeps it permanently behind.
        if (ENABLE_PACE_GOVERNOR && !catchingUp) {
          const paced = this.governByPace(capped)
          if (DEBUG_VOICE_MATCH && paced < capped) {
            console.warn(`[VT]   pace clamp → #${paced} (matcher wanted #${capped}; held to reading speed)`)
          }
          capped = paced
        }
        if (catchingUp) this.resetPaceGovernor()  // discontinuity: don't let stale samples clamp the next step
        this.lastCommitTime = Date.now()
        this.pendingGlobalIndex = -1
        this.currentWordIndex = capped
        this.lastMatchedIndex = capped
        this.scrollToWord(capped)
        if (DEBUG_VOICE_MATCH) console.warn(`[VT]   COMMIT #${capped} (target #${newIndex}, ${smallStep ? 'small step' : confirmed ? '2-of-3 confirmed' : 'catch-up'})`)
      } else if (DEBUG_VOICE_MATCH) {
        console.warn(`[VT]   GATED big jump → #${newIndex} (recent ${this.recentMatchPositions.join(',')}; need 2 within ${this.AGREE_WORDS} words)`)
      }
    } else {
      this.noProgressCount++  // no forward progress — likely a pause or repetition
    }
  }

  /**
   * Reading-pace governor. Estimates the reader's words/sec from a rolling window of recent commits
   * and caps the proposed advance so the highlight can't move faster than a human reads aloud. This
   * is what defeats the repeated-vocabulary ratchet: a matched word many positions ahead simply can't
   * be reached in the elapsed speech time, so it's held back to where the voice plausibly is.
   * Returns the pace-capped index (>= currentWordIndex). No history yet → returns the input unchanged.
   */
  /** Clear pace history so the next commit isn't clamped against a stale window (start / jumps). */
  private resetPaceGovernor(): void {
    this.paceSamples = []
    this.lastCommitTime = 0
  }

  private governByPace(proposed: number): number {
    const now = Date.now()
    // Sample the proposed (already FORWARD_CAP-limited) index, then trim the window.
    this.paceSamples.push({ t: now, idx: proposed })
    while (this.paceSamples.length > 0 && now - this.paceSamples[0].t > this.PACE_WINDOW_MS) {
      this.paceSamples.shift()
    }
    // Need a little history and a known last commit before clamping.
    if (this.paceSamples.length < 3 || this.lastCommitTime === 0) return proposed

    const head = this.paceSamples[0]
    const tail = this.paceSamples[this.paceSamples.length - 1]
    const winMs = tail.t - head.t
    if (winMs <= 0) return proposed

    // words/sec over the window, bounded so we neither strangle nor free-wheel.
    const wps = Math.min(this.MAX_PACE_WPS, Math.max(this.MIN_PACE_WPS, ((tail.idx - head.idx) / winMs) * 1000))
    const dtSec = (now - this.lastCommitTime) / 1000
    // Max words this commit may advance: pace × elapsed × headroom, but never fewer than a small step
    // so steady reading is never throttled.
    const maxAdvance = Math.max(this.SMALL_STEP_WORDS, Math.ceil(wps * dtSec * this.PACE_TOLERANCE))
    return Math.min(proposed, this.currentWordIndex + maxAdvance)
  }

  /**
   * Scroll to a specific word position with smooth animation.
   * Also highlights the current word (karaoke style) if enabled.
   * @param wordIndex - Target word index
   * @param jumpDistance - Number of words being jumped (for animation timing)
   */
  private scrollToWord(wordIndex: number): void {
    // Lead the highlight slightly to offset recognition latency (the matched word trails your
    // actual reading by a word or two). HIGHLIGHT_LEAD is the knob for "behind" vs "ahead".
    const ledIndex = Math.max(0, Math.min(this.wordTokens.length - 1, wordIndex + this.HIGHLIGHT_LEAD))

    // The highlight is the primary position tracker (Textream-style word highlighting).
    if (ENABLE_KARAOKE_HIGHLIGHTING) this.highlightWord(ledIndex)

    const position = this.wordPositions.get(ledIndex) ?? this.wordPositions.get(wordIndex)
    if (!position || !this.contentArea) {
      return
    }

    // Read the word's offset from the LIVE span, not the init-time snapshot. The cached offsetTop
    // is measured once at build time; on notes with a properties table / images / late font load the
    // layout shifts afterward, leaving the cache stale (often 0). A stale 0 makes wordViewportY hugely
    // negative, which trips the "above viewport" branch and yanks the page to the very top — from
    // which the scroll-anchored re-sync then re-acquires the intro instead of where you actually are.
    const liveSpan = this.wordSpans.get(ledIndex) ?? this.wordSpans.get(wordIndex)
    const wordTop = liveSpan ? liveSpan.offsetTop : position.offsetTop

    // Manual-scroll override: the reader just grabbed the page — keep the highlight (set above)
    // but don't fight their scroll. Cancel any in-flight follow and hold; auto-follow resumes
    // USER_SCROLL_GRACE_MS after they stop scrolling.
    if (Date.now() - this.userScrolledAt < this.USER_SCROLL_GRACE_MS) {
      if (this.scrollAnimationId !== null) {
        cancelAnimationFrame(this.scrollAnimationId)
        this.scrollAnimationId = null
      }
      if (DEBUG_VOICE_MATCH) console.warn('[VT]   scroll YIELD → manual scroll active, auto-follow paused')
      return
    }

    const h = this.contentArea.clientHeight
    // Rest = where the highlighted word sits right after the page advances (Scroll position setting).
    const restFrac = Math.min(0.8, Math.max(0.15, this.SCROLL_POSITION / 100))
    // Trigger = how far down the word may drift before the page advances. The gap between rest and
    // trigger is the "hold band": while you read down through it (several lines), the page stays put.
    const triggerFrac = Math.min(0.9, restFrac + 0.4)

    const wordViewportY = wordTop - this.contentArea.scrollTop

    // HOLD, then ADVANCE: only move the page when the highlighted word reaches the lower trigger
    // (you've read down the screen) or has drifted above the top (a backward jump / re-sync).
    // Within the band: do nothing — the page holds still while you finish the line.
    if (wordViewportY > h * triggerFrac || wordViewportY < h * 0.05) {
      this.targetScrollPos = Math.max(0, wordTop - h * restFrac)
      this.onWordMatch?.(wordIndex, this.targetScrollPos)
      this.startScrollFollow()
      if (DEBUG_VOICE_MATCH) console.warn(`[VT]   scroll ADVANCE → highlight #${wordIndex}, wordY=${Math.round(wordViewportY)} > trigger=${Math.round(h * triggerFrac)}`)
    } else if (DEBUG_VOICE_MATCH) {
      console.warn(`[VT]   scroll hold (highlight #${wordIndex}, wordY=${Math.round(wordViewportY)} within band ${Math.round(h * restFrac)}–${Math.round(h * triggerFrac)})`)
    }
  }

  /** Let the reader's own scrolling take over. `wheel` + `touchmove` are user-gesture only — our
   *  programmatic scrollTop writes never fire them — so this can't false-trigger on auto-follow. */
  private attachUserScrollGuard(area: HTMLElement): void {
    this.detachUserScrollGuard()
    const mark = (): void => {
      this.userScrolledAt = Date.now()
      // Re-acquire wherever they parked the page — via a calm local snap, not a global search.
      this.resyncToScrollPending = true
    }
    this.userScrollHandler = mark
    this.guardedScrollArea = area
    area.addEventListener('wheel', mark, { passive: true })
    area.addEventListener('touchmove', mark, { passive: true })
  }

  private detachUserScrollGuard(): void {
    if (this.guardedScrollArea && this.userScrollHandler) {
      this.guardedScrollArea.removeEventListener('wheel', this.userScrollHandler)
      this.guardedScrollArea.removeEventListener('touchmove', this.userScrollHandler)
    }
    this.userScrollHandler = null
    this.guardedScrollArea = null
  }

  /** Per-frame critically-damped follow toward the latest target. Reuses scrollAnimationId so
   *  stop() cancels it. Settles exactly on target and idles until the next word moves it. */
  private startScrollFollow(): void {
    if (this.scrollAnimationId !== null) return  // loop already running — it reads the new target
    const step = (): void => {
      if (!this.contentArea) { this.scrollAnimationId = null; return }
      const cur = this.contentArea.scrollTop
      const diff = this.targetScrollPos - cur
      if (Math.abs(diff) < 0.5) {
        this.contentArea.scrollTop = this.targetScrollPos
        this.scrollAnimationId = null
        return
      }
      this.contentArea.scrollTop = cur + diff * this.FOLLOW_FACTOR
      this.scrollAnimationId = requestAnimationFrame(step)
    }
    this.scrollAnimationId = requestAnimationFrame(step)
  }

  /**
   * Animate scroll to target position with easing.
   * Uses easeInOutQuad for smooth acceleration and deceleration.
   * @param targetScroll - Target scroll position
   * @param jumpDistance - Number of words being jumped (affects duration)
   */
  private animateScrollTo(targetScroll: number, jumpDistance: number = 5): void {
    if (!this.contentArea) return

    // Cancel any existing animation
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId)
      this.scrollAnimationId = null
    }

    const startScroll = this.contentArea.scrollTop
    const distance = targetScroll - startScroll

    // If distance is very small, just set directly
    if (Math.abs(distance) < 5) {
      this.contentArea.scrollTop = targetScroll
      return
    }

    // Calculate dynamic duration based on jump distance
    // Larger jumps get more time for smoother motion
    const duration = this.SCROLL_DURATION_BASE_MS + (jumpDistance * this.SCROLL_DURATION_PER_WORD_MS)

    const startTime = performance.now()
    const contentArea = this.contentArea

    // Easing function: easeInOutQuad - smooth acceleration and deceleration
    // This feels more natural for following text than easeOutCubic
    const easeInOutQuad = (t: number): number => {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Apply easing
      const easedProgress = easeInOutQuad(progress)
      const newScrollTop = startScroll + (distance * easedProgress)

      contentArea.scrollTop = newScrollTop

      // Continue animation if not complete
      if (progress < 1) {
        this.scrollAnimationId = requestAnimationFrame(animate)
      } else {
        this.scrollAnimationId = null
      }
    }

    this.scrollAnimationId = requestAnimationFrame(animate)
  }

  /**
   * Estimate the word index based on current scroll position.
   * Used as a hint for global search to prefer matches near visible content.
   * @returns Estimated word index at the top of the visible area
   */
  private estimateWordIndexFromScroll(): number {
    if (!this.contentArea || this.wordSpans.size === 0) {
      return 0
    }

    const scrollTop = this.contentArea.scrollTop
    const viewportTop = scrollTop + (this.contentArea.clientHeight * 0.2)  // 20% from top

    // Find the word span closest to the current scroll position
    let closestIndex = 0
    let closestDistance = Infinity

    this.wordSpans.forEach((span, index) => {
      const spanTop = span.offsetTop
      const distance = Math.abs(spanTop - viewportTop)

      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    return closestIndex
  }

  /**
   * Mark that we received speech input - starts/continues a speech turn.
   */
  private markSpeechActivity(): void {
    const now = Date.now()
    this.lastSpeechResultTime = now

    // Start a new speech turn if we weren't in one
    if (!this.isInSpeechTurn) {
      this.isInSpeechTurn = true
    }

    // Reset/restart the silence detection timer
    this.resetSilenceTimer()
  }

  /**
   * Reset the silence detection timer.
   * Called whenever we receive speech input.
   */
  private resetSilenceTimer(): void {
    // Clear existing timer
    if (this.silenceCheckTimer !== null) {
      window.clearTimeout(this.silenceCheckTimer)
    }

    // Set new timer - if no speech for PAUSE_THRESHOLD_MS, end the turn
    this.silenceCheckTimer = window.setTimeout(() => {
      this.endSpeechTurn()
    }, this.PAUSE_THRESHOLD_MS)
  }

  /**
   * End the current speech turn (silence detected).
   */
  private endSpeechTurn(): void {
    if (this.isInSpeechTurn) {
      this.isInSpeechTurn = false

      // Clear the match accumulator - fresh start for next turn
      this.matchAccumulator = []
      this.pendingScrollTarget = -1
    }
  }

  /**
   * Add a match to the accumulator and check if we should scroll.
   * Returns the target word index if we have enough consistent matches, -1 otherwise.
   */
  private accumulateMatch(matchIndex: number): number {
    // Add to accumulator
    this.matchAccumulator.push(matchIndex)

    // Keep only recent matches
    if (this.matchAccumulator.length > this.MATCH_ACCUMULATOR_SIZE) {
      this.matchAccumulator.shift()
    }

    // Need enough matches to make a decision
    if (this.matchAccumulator.length < this.MATCH_ACCUMULATOR_SIZE) {
      return -1
    }

    // Check if matches are consistent (all within 3 words of each other)
    const min = Math.min(...this.matchAccumulator)
    const max = Math.max(...this.matchAccumulator)
    const spread = max - min

    if (spread > 5) {
      // Matches are too spread out - not consistent, remove oldest and wait
      this.matchAccumulator.shift()
      return -1
    }

    // Matches are consistent - use the median
    const sorted = [...this.matchAccumulator].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]

    // Clear accumulator after successful scroll decision
    this.matchAccumulator = []

    return median
  }

  /**
   * Update content (e.g., when the note changes).
   */
  updateContent(content: string): void {
    this.tokens = tokenize(content)
    this.wordTokens = this.tokens.filter(t => t.type === 'TOKEN')
    this.currentWordIndex = 0
    this.buildWordPositionMap()
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<VoiceTrackingConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current status.
   */
  getStatus(): VoiceTrackingStatus {
    return this.status
  }

  /**
   * Get current word index.
   */
  getCurrentWordIndex(): number {
    return this.currentWordIndex
  }

  /**
   * Get last recognized text.
   */
  getLastRecognizedText(): string {
    return this.lastRecognizedText
  }

  /**
   * Get total word count.
   */
  getTotalWords(): number {
    return this.wordTokens.length
  }

  /**
   * Check if voice tracking is active.
   */
  isActive(): boolean {
    return this.status === 'listening'
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stop()
    this.detachUserScrollGuard()
    this.unwrapWords()  // Restore original DOM
    this.recognizer.dispose()
    this.speechDetector.dispose()
    this.tokens = []
    this.wordTokens = []
    this.wordPositions.clear()
    this.wordSpans.clear()
    this.contentArea = null

    // Clean up turn-based scrolling timer
    if (this.silenceCheckTimer !== null) {
      window.clearTimeout(this.silenceCheckTimer)
      this.silenceCheckTimer = null
    }
  }
}

/**
 * Singleton instance for the voice tracking service.
 */
let voiceTrackingServiceInstance: VoiceTrackingService | null = null

/**
 * Get or create the voice tracking service singleton.
 */
export function getVoiceTrackingService(
  config?: Partial<VoiceTrackingConfig>
): VoiceTrackingService {
  if (!voiceTrackingServiceInstance) {
    voiceTrackingServiceInstance = new VoiceTrackingService(config)
  } else if (config) {
    voiceTrackingServiceInstance.updateConfig(config)
  }
  return voiceTrackingServiceInstance
}

/**
 * Reset the singleton instance (for testing or cleanup).
 */
export function resetVoiceTrackingService(): void {
  if (voiceTrackingServiceInstance) {
    voiceTrackingServiceInstance.dispose()
    voiceTrackingServiceInstance = null
  }
}
