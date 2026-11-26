/**
 * Voice Tracking Service
 *
 * Main orchestrator that connects speech recognition with script matching
 * and scroll control. This is the primary interface for voice tracking.
 */

import { phoneLog } from '../platform/phone-log'
import { REFERENCE_FRAME_MS, followShare } from './follow-easing'
import type {
  TextElement,
  VoiceTrackingStatus,
  VoiceTrackingError,
  VoiceTrackingConfig,
  VoiceReadingMove,
  WordPosition
} from './types'
import { tokenize, cleanWord } from './word-tokenizer'
import { UNTRACKED_TEXT_SELECTOR } from '../passage-dom'
import { normalizeForSpeech } from '../parser/speech-normalizer'
import {
  alignHeardEnd,
  findGlobalPosition,
  findNextPosition,
  findRereadPosition,
  isConfidentMatch,
  type SpeechMatcherConfig,
} from './speech-matcher'
import { buildContextHints } from './context-hints'
import { scriptHash, wordListText, type ScriptSource } from './script-fingerprint'
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
  // Speech matching tuning. The app always passes its own values; these only serve a bare service.
  confidenceThreshold: 0.35,  // Higher = stricter matching
  windowSize: 5,              // Global re-sync window
  updateFrequencyMs: 500,     // At most one partial matched per this many ms (the newest held one runs at the end)
  // Scroll position default (20% from top = 80% runway below)
  scrollPosition: 20
}

// Feature flag: Karaoke word highlighting
const ENABLE_KARAOKE_HIGHLIGHTING = true

// Verbose match/scroll logging to the console for diagnosing tracking. Flip on when needed.
const DEBUG_VOICE_MATCH = false

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
  private readonly fixedRecognizer: boolean
  private readonly createRecognizer: (kind: 'apple' | 'vosk') => VoskRecognizer | AppleSpeechRecognizer
  private readonly languagesWithoutOnDevice = new Set<string>()
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
  private scrollFrameWindow: Window | null = null
  private isInitialized: boolean = false  // Track if word spans are created

  private lastMatchedIndex: number = -1

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
  // Live-tunable from settings: FOLLOW_FACTOR (smoothness) — lower = calmer glide, higher = snappier.
  private get FOLLOW_FACTOR(): number { return this.config.smoothness ?? 0.16 }
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

  // Callbacks
  /**
   * Diagnostic tap: every matcher decision, so a stalled rehearsal can be traced from a log
   * file instead of guessed at. Off unless the host assigns a handler.
   */
  onDiagnostic?: (_event: string, _data: Record<string, unknown>) => void
  onPauseChange?: (_isPaused: boolean) => void
  onWordMatch?: (_wordIndex: number, _scrollPosition: number) => void
  /** Every commit of the reader's place, for timing takes against the script's headings. */
  onReadingMove?: (_move: VoiceReadingMove) => void
  onStatusChange?: (_status: VoiceTrackingStatus) => void
  onRecognizedText?: (_text: string, _isFinal: boolean) => void
  onError?: (_error: VoiceTrackingError, _message: string) => void
  onProgress?: (_loaded: number, _total: number) => void

  /**
   * Create a new VoiceTrackingService.
   *
   * @param config - Configuration options
   */
  constructor(
    config: Partial<VoiceTrackingConfig> = {},
    recognizer?: VoskRecognizer | AppleSpeechRecognizer,
    createRecognizer?: (kind: 'apple' | 'vosk') => VoskRecognizer | AppleSpeechRecognizer,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    // Engine selection: Apple on-device Speech (macOS, far more accurate) when available,
    // else Vosk (offline model, cross-platform). 'auto' prefers Apple when supported.
    this.fixedRecognizer = recognizer !== undefined
    this.createRecognizer = createRecognizer ?? (kind => kind === 'apple' ? new AppleSpeechRecognizer() : new VoskRecognizer())
    this.recognizer = recognizer ?? this.createRecognizer(this.preferredEngine())
    this.wireRecognizer(this.recognizer)
  }

  /** Apple when it can serve this language on this Mac, otherwise the offline Vosk model. */
  private preferredEngine(): 'apple' | 'vosk' {
    const wantApple = this.config.engine === 'apple' ||
      (this.config.engine !== 'vosk' && AppleSpeechRecognizer.isSupported())
    return wantApple && !this.languagesWithoutOnDevice.has(this.config.language) ? 'apple' : 'vosk'
  }

  /** Each recognizer only speaks while it is the current one, so a replaced engine cannot confuse the app. */
  private wireRecognizer(recognizer: VoskRecognizer | AppleSpeechRecognizer): void {
    recognizer.onResult((text, isFinal) => {
      if (recognizer === this.recognizer) this.handleRecognitionResult(text, isFinal)
    })

    recognizer.onStatus((status) => {
      if (recognizer !== this.recognizer) return
      this.status = status
      this.onStatusChange?.(status)
    })

    recognizer.onError((error, message) => {
      if (recognizer !== this.recognizer) return
      if (error === 'no-on-device' && !this.fixedRecognizer) {
        this.fallBackToOfflineEngine()
        return
      }
      this.onError?.(error, message)
    })

    recognizer.onProgress((loaded, total) => {
      if (recognizer === this.recognizer) this.onProgress?.(loaded, total)
    })
  }

  private replaceRecognizer(kind: 'apple' | 'vosk'): void {
    const previous = this.recognizer
    this.recognizer = this.createRecognizer(kind)
    this.wireRecognizer(this.recognizer)
    // After this call stack, because a failing engine is still finishing its own shutdown.
    void Promise.resolve().then(() => previous.dispose())
  }

  /** Apple said the audio would have to leave this Mac. Remember that and carry on offline. */
  private fallBackToOfflineEngine(): void {
    this.languagesWithoutOnDevice.add(this.config.language)
    this.replaceRecognizer('vosk')
    this.start().catch((error) => {
      this.onError?.('recognition-failed', error instanceof Error ? error.message : String(error))
    })
  }

  /** A script in another language needs a recognizer listening in that language. */
  private ensureRecognizerForLanguage(): void {
    if (this.fixedRecognizer) return
    if (this.recognizer.getLanguage() !== this.config.language && this.recognizer.getIsInitialized()) {
      this.replaceRecognizer(this.preferredEngine())
    }
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
   * @param source - The note the script came from, when the host knows it. Only traced.
   */
  initialize(content: string, contentArea: HTMLElement, source?: ScriptSource): void {
    // Tokenize the content
    const nextTokens = tokenize(content)
    const nextWords = nextTokens.filter(t => t.type === 'TOKEN')

    // The service is a singleton shared by every open teleprompter view. A view with no note
    // loaded would otherwise wipe a working script to zero words: the recognizer keeps hearing
    // you, the matcher has nothing to match against, and tracking silently dies. Measured
    // 2026-09-16: 1087 words on the first run, 0 after a second view re-initialized it.
    // The script, its hash, the language and the note let scripts/voice-bench.ts replay the
    // session later against the same text. Built only when a trace handler is listening.
    if (this.onDiagnostic) {
      this.onDiagnostic('init', {
        incomingWords: nextWords.length,
        hadWords: this.wordTokens.length,
        contentChars: content.length,
        domChars: contentArea?.textContent?.length ?? -1,
        scriptHash: scriptHash(content),
        language: this.config.language,
        ...(source ? { notePath: source.path, noteMtime: source.mtime } : {}),
        script: content,
      })
    }

    if (nextWords.length === 0 && this.wordTokens.length > 0) {
      this.onDiagnostic?.('init-ignored', { reason: 'empty-content', keptWords: this.wordTokens.length })
      return
    }

    this.tokens = nextTokens
    this.wordTokens = nextWords

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

    // Re-tokenize from DOM content for accurate matching. Same guard as initialize(): an empty
    // content area belongs to a view with no script, and must never replace a working map.
    const domText = this.contentArea.textContent || ''
    const domTokens = tokenize(domText)
    const domWords = domTokens.filter(t => t.type === 'TOKEN')
    this.onDiagnostic?.('dom-map', { domWords: domWords.length, hadWords: this.wordTokens.length })
    if (domWords.length === 0 && this.wordTokens.length > 0) {
      this.onDiagnostic?.('dom-map-ignored', { reason: 'empty-content-area', keptWords: this.wordTokens.length })
      return
    }
    this.tokens = domTokens
    this.wordTokens = domWords

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
    // A previous session leaves its .voice-word spans in the DOM — stop() keeps them so a
    // restart is cheap. But the walker below REJECTS text already inside a .voice-word, so on
    // the second start it would find zero text nodes, rebuild zero tokens, and (by the
    // unconditional assignment further down) wipe the script the matcher needs. That is the
    // "works the first time, dead after re-enabling the mic" failure: measured 2026-09-16,
    // 1087 words at 22:39:27, 0 words three seconds later, recognizer still listening.
    // Unwrap first so every start begins from clean text.
    const staleSpans = this.contentArea.querySelectorAll('.voice-word')
    if (staleSpans.length > 0) {
      this.onDiagnostic?.('unwrap-before-rewrap', { staleSpans: staleSpans.length })
      this.unwrapWords()
    }

    // Skip elements that shouldn't be processed (code blocks, etc.)
    const skipSelectors = UNTRACKED_TEXT_SELECTOR

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
    // Assign UNCONDITIONALLY — even an empty result is correct: a body that is entirely inside
    // skipped selectors (one big code block / embedded note) legitimately has zero matchable words,
    // and keeping the stale code-inclusive list here would silently re-introduce the span↔token
    // drift this rebuild exists to kill (matcher would index words that have no spans).
    if (rebuiltTokens.length === 0 && this.wordTokens.length > 0) {
      // Legitimate only when the whole body sits inside skipped selectors. Anything else is the
      // stale-span failure above, so it must be visible instead of silently killing tracking.
      this.onDiagnostic?.('rebuild-empty', { lost: this.wordTokens.length, textNodes: textNodes.length })
    }
    this.wordTokens = rebuiltTokens

    // Update offsetTop values after DOM is modified
    this.wordSpans.forEach((span, index) => {
      const position = this.wordPositions.get(index)
      if (position) {
        position.offsetTop = span.offsetTop
        position.element = span
      }
    })

    this.isInitialized = true
    // The exact word list the matcher indexes, after rendering: what a replay needs to be exact.
    if (this.onDiagnostic) {
      const wordList = wordListText(this.wordTokens)
      this.onDiagnostic('wrapped', {
        words: this.wordTokens.length,
        spans: this.wordSpans.size,
        wordsHash: scriptHash(wordList),
        wordList,
      })
    }
  }

  /**
   * Highlight the current word (karaoke style).
   * @param wordIndex - Index of the word to highlight
   */
  highlightWord(wordIndex: number): void {
    // Word highlight disabled: keep the page following your voice (scrollToWord still runs), but
    // paint no per-word marker — no jumping highlight box to lose your place against.
    // NOTE: `highlightedWordIndex` is a RENDER-ONLY field (the painted marker's position). It stays
    // at its initial -1 while the marker is off; the matcher's true position is `currentWordIndex`.
    // Do not read `highlightedWordIndex` as "where the reader is" — read `currentWordIndex`.
    if (this.config.showWordHighlight === false) return
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
      this.ensureRecognizerForLanguage()

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

    // Cancel any ongoing scroll animation, and forget speech heard before the stop
    this.cancelScrollFrame()
    this.dropHeldPartial()
    this.lastMatchedPartialWords = 0

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
  }

  /**
   * Re-anchor tracking to a specific word index — the listening counterpart to "Jump to Section".
   * When the reader picks a section from the navigation panel, the page scrolls there but the matcher
   * would otherwise keep hunting near the OLD position (recovering only after the stall re-sync). This
   * snaps the matcher's index directly to the section's word so the next thing you say is matched from
   * there immediately. Like forceResync()/the manual-scroll SNAP, but to an exact, caller-supplied index
   * — no global search, no scroll estimation.
   *
   * @param wordIndex - Target word index. Clamped to the valid range; no-op if there are no words yet.
   */
  /**
   * The script changed under a running session: wrap the new text and carry on from this word.
   * The microphone is left alone, so nothing the reader says in the meantime is lost.
   */
  rebind(contentArea: HTMLElement, wordIndex: number): void {
    this.contentArea = contentArea
    this.buildWordPositionMap()
    this.seekToWord(wordIndex)
  }

  seekToWord(wordIndex: number): void {
    if (this.wordTokens.length === 0) return
    const clamped = Math.max(0, Math.min(this.wordTokens.length - 1, Math.floor(wordIndex)))

    // Re-anchor LOCAL matching here. We KNOW where the reader is (they chose it), so resume forward
    // matching from this word — don't arm a global search.
    this.currentWordIndex = clamped
    this.lastMatchedIndex = clamped
    this.needsGlobalSearch = false

    // Clear all latch / confirmation / pace state so the next partial matches cleanly from the new
    // anchor and isn't gated or clamped by history from the section we just left. A held partial was
    // heard before the move, so it is dropped too.
    this.recentMatchPositions = []
    this.dropHeldPartial()
    this.pendingGlobalIndex = -1
    this.consecutiveFailedMatches = 0
    this.resyncRequested = false
    this.resyncToScrollPending = false   // setting the index directly, not via scroll estimate
    this.pendingRereadIndex = -1
    this.resetPaceGovernor()             // discontinuity: don't clamp the next commit against old pace

    // CRITICAL — the "jumps then comes back" bug. If the reader was mid-reading, the auto-follow
    // animation loop is RUNNING and still easing the page toward the LAST-matched word's scroll
    // position. Re-anchoring the matcher index (above) does not touch that loop, so it would drag
    // the page straight back out of the section the caller just jumped to (confirmed: scrollTop
    // decayed 2465→195 with the FOLLOW_FACTOR signature while currentWordIndex held at the new
    // section). Stop the loop and point its target at where the page now sits, so nothing pulls it
    // back; the next real voice match re-arms the follow from the correct place.
    this.cancelScrollFrame()
    if (this.contentArea) this.targetScrollPos = this.contentArea.scrollTop

    // Repaint the karaoke marker at the new anchor (when enabled). Clear stale read/active marks first
    // so a BACKWARD jump doesn't leave words after the anchor dimmed as "already read".
    if (ENABLE_KARAOKE_HIGHLIGHTING) {
      this.wordSpans.forEach(span => span.classList.remove('voice-active', 'voice-past'))
      this.highlightedWordIndex = -1
      this.highlightWord(clamped)
    }
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
   * Build the contextualStrings hint list for Apple's on-device recognizer from the ORIGINAL token
   * text (case and hyphenated names kept), NOT the lowercased Vosk grammar. The list is capped, so it
   * goes to the script's rarest words first: see buildContextHints.
   */
  private buildContextVocabulary(): string | undefined {
    const hints = buildContextHints(this.tokens)
    return hints.length ? JSON.stringify(hints) : undefined
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

    this.dropHeldPartial()

    // Scroll to top
    if (this.contentArea) {
      this.contentArea.scrollTop = 0
    }
  }

  // Partial throttle: a partial that only re-sends or revises words already matched is matched at most
  // once per PARTIAL_THROTTLE_MS. One that arrives inside the window is HELD, the newest replacing an
  // older one, and matched when the window ends. Dropping it instead lost the last words before a
  // pause, and the place sat behind the voice until the reader spoke again.
  private lastPartialProcessTime: number = 0
  private lastMatchedPartialWords: number = 0
  private heldPartial: string | null = null
  private heldPartialTimer: number | null = null
  private heldPartialTimerWindow: Window | null = null
  private pendingRereadIndex: number = -1 // A re-read seen once, waiting for speech to confirm it

  // Smooth scroll animation state
  private scrollAnimationId: number | null = null

  // Getters for tuning parameters (from config)
  private get PARTIAL_THROTTLE_MS(): number { return this.config.updateFrequencyMs ?? 400 }
  private get SCROLL_POSITION(): number { return this.config.scrollPosition ?? 30 }

  /**
   * Handle recognition results from the recognizer: a final is matched at once; a partial is matched
   * at once or, inside the throttle window, held and matched when the window ends.
   */
  private handleRecognitionResult(rawText: string, isFinal: boolean): void {
    // Speech recognizers return numbers as DIGITS ("$759", "2:24", "30%") while a teleprompter
    // script spells them out ("seven hundred and fifty-nine dollars") — which is exactly what a
    // script written to be READ ALOUD should do. Those two never match token-for-token, so a
    // number-dense passage stalls the matcher while the mic keeps listening. Normalising the
    // heard text into the script's spoken form puts both sides in the same alphabet.
    // The DOM script is deliberately left untouched: word indices map to spans for highlighting.
    // The spoken forms it writes are English, so other languages keep what the recognizer heard.
    const text = this.config.language.startsWith('en') ? normalizeForSpeech(rawText) : rawText
    this.lastRecognizedText = text
    this.onRecognizedText?.(text, isFinal)

    if (isFinal) {
      // A final is the newest and most complete text of its utterance: a held partial is stale.
      this.dropHeldPartial()
      this.lastMatchedPartialWords = 0 // the next partial starts a new utterance
      this.matchRecognizedText(text, true)
      return
    }

    // Only process partials with at least 3 words: fewer are too few to match reliably
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length
    if (wordCount < 3) return

    // A partial with a different number of words carries a word the matcher has not seen: new
    // evidence of where the reader is, matched at once. Holding it for the throttle window is what
    // made a slow update rate trail the voice (the "Conservative" preset's 600 ms, at a non-native
    // reader's ~2.4 words a second). The throttle paces the rest: the recognizer re-sending or
    // revising words already matched.
    const wait = this.lastPartialProcessTime + this.PARTIAL_THROTTLE_MS - Date.now()
    if (wait > 0 && wordCount === this.lastMatchedPartialWords) {
      this.holdPartial(text, wait)
      return
    }
    this.dropHeldPartial()
    this.matchPartial(text)
  }

  private matchPartial(text: string): void {
    this.lastPartialProcessTime = Date.now()
    this.lastMatchedPartialWords = text.split(/\s+/).filter(w => w.length > 0).length
    this.matchRecognizedText(text, false)
  }

  /** Keep the newest partial heard inside the throttle window, and match it when the window ends. */
  private holdPartial(text: string, waitMs: number): void {
    this.heldPartial = text
    if (this.heldPartialTimer !== null) return // already scheduled for the end of this window
    this.heldPartialTimerWindow = this.contentWindow()
    this.heldPartialTimer = this.heldPartialTimerWindow.setTimeout(() => {
      this.heldPartialTimer = null
      const held = this.heldPartial
      this.heldPartial = null
      if (held !== null) this.matchPartial(held)
    }, waitMs)
  }

  private dropHeldPartial(): void {
    this.heldPartial = null
    if (this.heldPartialTimer === null) return
    const owner = this.heldPartialTimerWindow ?? window
    owner.clearTimeout(this.heldPartialTimer)
    this.heldPartialTimer = null
  }

  /** Match one recognized text against the script and move the place if the evidence allows. */
  private matchRecognizedText(text: string, isFinal: boolean): void {
    // Build speech matcher config from service config
    const matcherConfig: SpeechMatcherConfig = {
      windowSize: this.config.windowSize ?? 6,
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
        this.consecutiveFailedMatches = 0
        this.needsGlobalSearch = false
        this.resetPaceGovernor()  // discontinuity: don't clamp the next commit against pre-snap pace
        if (DEBUG_VOICE_MATCH) console.warn(`[VT]   SNAP → matcher re-anchored to scroll position #${snapTo} (manual scroll)`)
      }
    }

    // Going back to say a line again. One reading is not enough: a second one that has moved on
    // proves live speech, because a recognizer repeating itself in a pause never moves on.
    const rereadEnd = findRereadPosition(text, this.wordTokens, this.currentWordIndex)
    if (rereadEnd >= 0) {
      const movedOn = this.pendingRereadIndex >= 0 && rereadEnd > this.pendingRereadIndex && rereadEnd - this.pendingRereadIndex <= 12
      if (!movedOn) {
        if (this.pendingRereadIndex < 0 || rereadEnd < this.pendingRereadIndex) this.pendingRereadIndex = rereadEnd
        this.onDiagnostic?.('reread-held', { cur: this.currentWordIndex, reread: rereadEnd })
        return
      }
      this.onDiagnostic?.('reread', { from: this.currentWordIndex, to: rereadEnd })
      this.seekToWord(rereadEnd)
      this.scrollToWord(rereadEnd)
      return
    }
    this.pendingRereadIndex = -1

    let newIndex: number
    let isGlobalMatch = false  // Flag for global search result

    // Re-sync on initial start, on R, and after STALL_RESYNC_THRESHOLD partials without progress.
    // The wide search is bounded near where the reader is looking, so it can't jump to an unrelated
    // section, and its result must line up word by word (below) before it can move the place.
    if (this.needsGlobalSearch) {
      // A stall re-sync first looks just ahead of the place, where the tail-aligned matcher sees the
      // nearest copy of what was heard. The wide search below scores letters over a fixed window, so of
      // two nearby copies ("That is where the real work ... and that is where I have done") it can
      // prefer the farther one. R skips this: the reader asked to be found wherever they are.
      const nearby = findNextPosition(text, this.wordTokens, this.currentWordIndex, matcherConfig)
      const useNearby = !this.resyncRequested && nearby > this.currentWordIndex

      // findGlobalPosition answers where the heard words START (passage-anchor relies on that). The
      // reader is at the LAST of them: landing on the first left the place a whole utterance behind the
      // voice. The last words are re-aligned around their expected end, and must actually line up with
      // the script there: the letter-level global match alone accepted an off-script aside ("okay one
      // second my phone is ringing") and, confirmed by its own final, flung the place 30 words ahead.
      const heardEnd = (): number => {
        const hintPosition = this.estimateWordIndexFromScroll()  // where the reader is looking
        const heardStart = findGlobalPosition(text, this.wordTokens, matcherConfig, hintPosition, this.GLOBAL_SEARCH_RADIUS)
        if (heardStart < 0) return -1
        const heardWords = tokenize(text).filter(t => t.type === 'TOKEN').length
        const end = alignHeardEnd(text, this.wordTokens, heardStart + heardWords - 1)
        return end && isConfidentMatch(end.confidence, matcherConfig) ? end.matchedWordIndex : -1
      }
      const found = useNearby ? nearby : heardEnd()

      if (found >= 0) {
        newIndex = found
        isGlobalMatch = true
        this.needsGlobalSearch = false
        this.consecutiveFailedMatches = 0
      } else {
        // Nothing found: the forward match stands (no progress, unless R found the reader nearby)
        newIndex = nearby
      }
    } else {
      // Normal forward-only search
      newIndex = findNextPosition(text, this.wordTokens, this.currentWordIndex, matcherConfig)
    }

    // Calculate jump distance
    const jumpDistance = newIndex - this.currentWordIndex

    this.onDiagnostic?.('match', {
      final: isFinal,
      heard: text.split(/\s+/).filter(Boolean).slice(-8).join(' '),
      cur: this.currentWordIndex,
      curWord: this.wordTokens[this.currentWordIndex]?.value ?? '?',
      proposed: newIndex,
      proposedWord: this.wordTokens[newIndex]?.value ?? '?',
      jump: jumpDistance,
      global: isGlobalMatch,
      fails: this.consecutiveFailedMatches,
      total: this.wordTokens.length,
    })

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
        this.resetPaceGovernor()    // discontinuity: a catch-up jump must not be clamped by pace
        this.scrollToWord(newIndex)
      } else {
        // First far global match — hold it and re-search next time to confirm
        this.pendingGlobalIndex = newIndex
        this.needsGlobalSearch = true
      }
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
      // Two recent matches BOTH well ahead of the highlight — AND clustered with each other — mean a
      // genuine fall-behind. The cluster check matters: in repeat-heavy text two partials can each
      // latch a DIFFERENT far copy of a common word, both clearing the ahead threshold while pointing
      // at unrelated places. Without requiring them to agree (same as the `confirmed` gate), that
      // would spuriously trigger catch-up and switch OFF the pace governor exactly when the match is
      // least trustworthy. Requiring max−min ≤ AGREE_WORDS keeps catch-up to a real, consistent surge.
      const CATCHUP_AHEAD = this.AGREE_WORDS + 1
      const aheadPositions = this.recentMatchPositions.filter(
        p => p >= this.currentWordIndex + CATCHUP_AHEAD
      )
      const catchingUp = aheadPositions.length >= 2 &&
        (Math.max(...aheadPositions) - Math.min(...aheadPositions)) <= this.AGREE_WORDS
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
    // Every commit lands here. The place is reported before anything below can return early: a word
    // on the line already shown, or a hand scroll holding the page, is still where the reader is.
    this.onReadingMove?.({
      wordIndex,
      totalWords: this.wordTokens.length,
      span: this.wordSpans.get(wordIndex) ?? null,
    })

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
      this.cancelScrollFrame()
      if (DEBUG_VOICE_MATCH) console.warn('[VT]   scroll YIELD → manual scroll active, auto-follow paused')
      return
    }

    const h = this.contentArea.clientHeight
    // FIXED READING LINE (continuous follow). Keep the current word anchored at one height and ease
    // toward it on EVERY commit. The old model held the page still for a whole "band" (~5 lines) and
    // then jumped the word back up in one big leap — that hold-then-jump is the jumpiness. Anchoring
    // every line turns it into frequent small eased nudges = a smooth glide. It also means the line
    // you're reading never sinks to the bottom of the screen, so there's always runway below to read
    // ahead (the "couldn't read below" problem). The anchor is your "Current word position" setting.
    const anchorFrac = Math.min(0.6, Math.max(0.12, this.SCROLL_POSITION / 100))
    const desired = Math.max(0, wordTop - h * anchorFrac)

    // Retarget only when the word moved to a new line (target changed by more than a rounding wobble),
    // so the follow isn't re-armed for every partial while you speak the words on the current line.
    if (Math.abs(desired - this.targetScrollPos) > 1) {
      this.targetScrollPos = desired
      this.onWordMatch?.(wordIndex, this.targetScrollPos)
      phoneLog(`voice follow word ${wordIndex} target ${Math.round(desired)} from ${Math.round(this.contentArea.scrollTop)}`)
      this.startScrollFollow()
      if (DEBUG_VOICE_MATCH) console.warn(`[VT]   scroll follow → #${wordIndex}, target=${Math.round(desired)} (anchor ${Math.round(h * anchorFrac)} of ${h})`)
    } else if (DEBUG_VOICE_MATCH) {
      console.warn(`[VT]   scroll steady (#${wordIndex} already at anchor ${Math.round(h * anchorFrac)})`)
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

  /**
   * The window showing the script. A pop-out's frames keep firing when the main window is minimized
   * or behind a full-screen app; the bare requestAnimationFrame belongs to the main window and stops.
   */
  private contentWindow(): Window {
    return this.contentArea?.ownerDocument?.defaultView ?? window
  }

  private requestScrollFrame(callback: FrameRequestCallback): number {
    this.scrollFrameWindow = this.contentWindow()
    return this.scrollFrameWindow.requestAnimationFrame(callback)
  }

  /** A frame or timer can only be cancelled by the window that scheduled it. */
  private cancelScrollFrame(): void {
    if (this.scrollAnimationId === null) return
    const owner = this.scrollFrameWindow ?? window
    owner.cancelAnimationFrame(this.scrollAnimationId)
    this.scrollAnimationId = null
  }

  /** Per-frame critically-damped follow toward the latest target. Reuses scrollAnimationId so
   *  stop() cancels it. Settles exactly on target and idles until the next word moves it. */
  private startScrollFollow(): void {
    if (this.scrollAnimationId !== null) return  // loop already running — it reads the new target
    let lastFrameAt: number | null = null
    const step = (now: number): void => {
      if (!this.contentArea) { this.scrollAnimationId = null; return }
      const cur = this.contentArea.scrollTop
      const diff = this.targetScrollPos - cur
      if (Math.abs(diff) < 0.5) {
        this.contentArea.scrollTop = this.targetScrollPos
        this.scrollAnimationId = null
        return
      }
      // Time-based, so a 120 Hz phone glides as long as a 60 Hz screen does
      const elapsed = lastFrameAt === null ? REFERENCE_FRAME_MS : now - lastFrameAt
      lastFrameAt = now
      this.contentArea.scrollTop = cur + diff * followShare(this.FOLLOW_FACTOR, elapsed)
      this.scrollAnimationId = this.requestScrollFrame(step)
    }
    this.scrollAnimationId = this.requestScrollFrame(step)
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
