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
import { tokenize } from './word-tokenizer'
import { findNextPosition, findGlobalPosition, type SpeechMatcherConfig } from './speech-matcher'
import { VoskRecognizer } from './vosk-recognizer'

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
const ENABLE_KARAOKE_HIGHLIGHTING = false

/**
 * Voice Tracking Service - the main interface for voice-controlled scrolling.
 */
export class VoiceTrackingService {
  private recognizer: VoskRecognizer
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

  // Turn-based scrolling state
  private lastSpeechResultTime: number = 0      // Last time we received ANY speech result
  private isInSpeechTurn: boolean = false       // Are we currently in an active speech turn?
  private silenceCheckTimer: number | null = null  // Timer for detecting silence
  private pendingScrollTarget: number = -1      // Accumulated scroll target
  private matchAccumulator: number[] = []       // Recent match positions for averaging
  private readonly MATCH_ACCUMULATOR_SIZE = 3   // Require this many consistent matches

  // Callbacks
  onPauseChange?: (isPaused: boolean) => void
  onWordMatch?: (wordIndex: number, scrollPosition: number) => void
  onStatusChange?: (status: VoiceTrackingStatus) => void
  onRecognizedText?: (text: string, isFinal: boolean) => void
  onError?: (error: VoiceTrackingError, message: string) => void
  onProgress?: (loaded: number, total: number) => void

  /**
   * Create a new VoiceTrackingService.
   *
   * @param config - Configuration options
   */
  constructor(config: Partial<VoiceTrackingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.recognizer = new VoskRecognizer()

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
    this.contentArea = contentArea
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

    // Process each text node
    for (const textNode of textNodes) {
      const text = textNode.textContent || ''
      if (!text.trim()) continue

      const parent = textNode.parentElement
      if (!parent) continue

      // Split text into words and whitespace, preserving structure
      // This regex captures words and whitespace separately
      const parts = text.split(/(\s+)/)

      if (parts.length === 1 && !parts[0].trim()) continue

      // Create a document fragment with wrapped words
      const fragment = document.createDocumentFragment()

      for (const part of parts) {
        if (!part) continue

        // Check if this is whitespace
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part))
        } else {
          // This is a word - wrap it in a span
          const cleanWord = part.replace(/[^\w]/g, '').toLowerCase()

          if (cleanWord.length > 0 && globalWordIndex < this.wordTokens.length) {
            const span = document.createElement('span')
            span.className = 'voice-word'
            span.dataset.wordIndex = String(globalWordIndex)
            span.textContent = part

            fragment.appendChild(span)

            // Store references
            this.wordSpans.set(globalWordIndex, span)
            this.wordPositions.set(globalWordIndex, {
              wordIndex: globalWordIndex,
              element: span,
              offsetTop: 0, // Will be updated after DOM insertion
              text: part
            })

            globalWordIndex++
          } else {
            // Word without matching token (punctuation only, etc.)
            fragment.appendChild(document.createTextNode(part))
          }
        }
      }

      // Replace the text node with our fragment
      parent.replaceChild(fragment, textNode)
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
    // Remove highlight from previous word
    if (this.highlightedWordIndex >= 0 && this.highlightedWordIndex !== wordIndex) {
      const prevSpan = this.wordSpans.get(this.highlightedWordIndex)
      if (prevSpan) {
        prevSpan.classList.remove('voice-active')
      }
    }

    // Add highlight to current word
    const span = this.wordSpans.get(wordIndex)
    if (span) {
      span.classList.add('voice-active')
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
        await this.recognizer.initialize(this.config.language)
      }

      // Start listening
      await this.recognizer.start()

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

    let newIndex: number
    let isGlobalMatch = false  // Flag for global search result

    // Use global search when starting or after many failed matches
    if (this.needsGlobalSearch || this.consecutiveFailedMatches >= this.FAILED_MATCH_THRESHOLD) {
      // Get hint position based on current scroll (where user is looking)
      const hintPosition = this.estimateWordIndexFromScroll()

      const globalIndex = findGlobalPosition(text, this.wordTokens, matcherConfig, hintPosition)

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

    // Track failed matches (no forward progress from local search)
    if (jumpDistance <= 0 && !isGlobalMatch) {
      this.consecutiveFailedMatches++
    } else if (jumpDistance > 0 || isGlobalMatch) {
      this.consecutiveFailedMatches = 0
    }

    // For global matches, scroll immediately to the found position (bypass accumulator)
    if (isGlobalMatch) {
      this.currentWordIndex = newIndex
      this.lastMatchedIndex = newIndex
      this.matchAccumulator = []  // Clear accumulator on global jump
      this.scrollToWord(newIndex, 5)  // Use moderate animation duration
      return
    }

    // === TURN-BASED SCROLLING ===
    // Only process if we're in an active speech turn
    if (!this.isInSpeechTurn) {
      return
    }

    // For partial results, require minimum forward progress
    const minJump = isFinal ? 1 : this.MIN_JUMP_DISTANCE

    // Only accumulate forward matches
    if (jumpDistance >= minJump || (newIndex === 0 && this.currentWordIndex === 0)) {
      // Cap the jump to prevent jarring large jumps
      const cappedJump = Math.min(jumpDistance, this.MAX_JUMP_DISTANCE)
      const targetIndex = this.currentWordIndex + cappedJump

      // Accumulate this match - only scroll when we have consistent matches
      const scrollTarget = this.accumulateMatch(targetIndex)

      if (scrollTarget >= 0) {
        // We have enough consistent matches - now scroll!
        this.currentWordIndex = scrollTarget
        this.lastMatchedIndex = scrollTarget
        this.scrollToWord(scrollTarget, Math.abs(scrollTarget - this.currentWordIndex))
      }
    } else if (jumpDistance <= 0) {
      // No forward progress - might be pause or repetition
      // Reset pause state tracking
      this.noProgressCount++

      // Multiple no-progress results - speech may have paused
    }
  }

  /**
   * Scroll to a specific word position with smooth animation.
   * Also highlights the current word (karaoke style) if enabled.
   * @param wordIndex - Target word index
   * @param jumpDistance - Number of words being jumped (for animation timing)
   */
  private scrollToWord(wordIndex: number, jumpDistance: number = 5): void {
    const position = this.wordPositions.get(wordIndex)

    if (!position || !this.contentArea) {
      return
    }

    // Highlight the current word (karaoke style) if enabled
    if (ENABLE_KARAOKE_HIGHLIGHTING) {
      this.highlightWord(wordIndex)
    }

    // Calculate scroll position (keep word at configured % from top)
    const scrollPercent = this.SCROLL_POSITION / 100
    const targetScroll = Math.max(0, position.offsetTop - (this.contentArea.clientHeight * scrollPercent))

    // Emit event before scrolling
    this.onWordMatch?.(wordIndex, targetScroll)

    // Use custom smooth animation for voice tracking
    this.animateScrollTo(targetScroll, jumpDistance)
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
    this.unwrapWords()  // Restore original DOM
    this.recognizer.dispose()
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
