/**
 * Speech Matcher
 *
 * The core algorithm that matches recognized speech to the reference script.
 * Uses Levenshtein distance to find the best matching position.
 * Ported from jlecomte/voice-activated-teleprompter (MIT license).
 */

import type { TextElement, MatchResult } from './types'
import { tokenize, tokensToString } from './word-tokenizer'
import { levenshteinDistance } from './levenshtein'

/**
 * Configuration for speech matching algorithm.
 * These values control how aggressively the matcher follows speech.
 */
export interface SpeechMatcherConfig {
  windowSize: number           // Look-ahead window (default: 6)
  maxJumpDistance: number      // Max words to jump at once (default: 3)
  confidenceThreshold: number  // Min confidence to accept match (default: 0.2)
}

/** Default configuration - balanced preset */
export const DEFAULT_MATCHER_CONFIG: SpeechMatcherConfig = {
  windowSize: 6,
  maxJumpDistance: 3,
  confidenceThreshold: 0.20
}

/**
 * Find the best matching position in the reference text for recognized speech.
 *
 * Algorithm:
 * 1. Tokenize the recognized speech
 * 2. Create a look-ahead window from the current position
 * 3. Calculate Levenshtein distance for each possible match position
 * 4. Return the position with minimum distance
 *
 * IMPORTANT: This function expects reference to be WORD-ONLY tokens (no delimiters).
 * The returned matchedWordIndex is the position in this word-only array.
 *
 * @param recognized - The recognized speech text
 * @param reference - Array of WORD-ONLY TextElements from the reference script
 * @param lastRecognizedTokenIndex - The last matched position (start of look-ahead)
 * @param windowSize - Look-ahead window size (from config)
 * @returns MatchResult with the new matched position, or null if no match
 */
export function computeSpeechRecognitionTokenIndex(
  recognized: string,
  reference: TextElement[],
  lastRecognizedTokenIndex: number,
  windowSize: number = DEFAULT_MATCHER_CONFIG.windowSize
): MatchResult | null {
  // Tokenize the recognized input and filter to words only
  const recognizedTokens = tokenize(recognized).filter(
    element => element.type === 'TOKEN'
  )

  // If nothing recognized, return null
  if (recognizedTokens.length === 0) {
    return null
  }

  // Convert tokens to a comparison string
  const comparisonString = tokensToString(recognizedTokens)

  // Ensure we have a valid starting index
  if (lastRecognizedTokenIndex < 0) {
    lastRecognizedTokenIndex = 0
  }

  // Get reference tokens from current position using configured window size
  // NOTE: reference should already be word-only, but filter just in case
  const referenceTokens = reference
    .slice(lastRecognizedTokenIndex, lastRecognizedTokenIndex + windowSize)
    .filter(element => element.type === 'TOKEN')

  // If no reference tokens in window, no match possible
  if (referenceTokens.length === 0) {
    return null
  }

  // Calculate Levenshtein distances for each possible ending position
  const distances: number[] = []
  let i = 0

  while (++i <= referenceTokens.length) {
    // Build reference substring from first i tokens
    const referenceSubstring = referenceTokens
      .slice(0, i)
      .reduce(
        (accumulator, currentToken) => accumulator + ' ' + currentToken.value,
        ''
      )
      .replace(/\s+/g, ' ')
      .trim()

    // Calculate distance
    distances.push(levenshteinDistance(comparisonString, referenceSubstring))
  }

  // Find the index with minimum distance
  const minDistance = Math.min(...distances)
  const localIndex = distances.indexOf(minDistance)

  // Get the corresponding token
  const token = referenceTokens[localIndex]

  if (token) {
    // Return the GLOBAL word index (lastRecognizedTokenIndex + local position)
    // This is the index in the word-only array, matching wordPositions keys
    return {
      matchedWordIndex: lastRecognizedTokenIndex + localIndex,
      token: token
    }
  }

  return null
}

/**
 * Calculate match confidence based on Levenshtein distance.
 *
 * @param recognized - Recognized text
 * @param reference - Reference text at matched position
 * @returns Confidence score 0-1 (1 = perfect match)
 */
export function calculateMatchConfidence(
  recognized: string,
  reference: string
): number {
  if (!recognized || !reference) return 0

  const distance = levenshteinDistance(
    recognized.toLowerCase(),
    reference.toLowerCase()
  )
  const maxLength = Math.max(recognized.length, reference.length)

  if (maxLength === 0) return 1

  return Math.max(0, 1 - distance / maxLength)
}

/**
 * Find the best matching position anywhere in the document (global search).
 * Used when:
 * - Voice tracking first starts (to find initial position)
 * - After many consecutive failed matches (user may have jumped)
 *
 * @param recognized - The recognized speech text
 * @param reference - Array of WORD-ONLY TextElements (no delimiters)
 * @param config - Speech matcher configuration
 * @param hintPosition - Optional hint of where user is scrolled (word index). When provided,
 *                       matches near this position are preferred when confidence is similar.
 * @returns Best matching word index, or -1 if no good match found
 */
export function findGlobalPosition(
  recognized: string,
  reference: TextElement[],
  config: SpeechMatcherConfig = DEFAULT_MATCHER_CONFIG,
  hintPosition: number = 0
): number {
  // Tokenize the recognized input and filter to words only
  const recognizedTokens = tokenize(recognized).filter(
    element => element.type === 'TOKEN'
  )

  if (recognizedTokens.length < 2) {
    return -1 // Need at least 2 words for reliable global matching
  }

  const recognizedString = tokensToString(recognizedTokens)
  const windowSize = Math.max(recognizedTokens.length, config.windowSize)

  // Collect all matches above threshold
  const matches: { index: number; confidence: number }[] = []

  // Slide through the entire document with step size for efficiency
  // Use larger steps for longer documents
  const stepSize = Math.max(1, Math.floor(reference.length / 200))

  for (let i = 0; i < reference.length - windowSize + 1; i += stepSize) {
    // Get reference window
    const windowTokens = reference.slice(i, i + windowSize)
    const windowString = tokensToString(windowTokens)

    // Calculate confidence
    const confidence = calculateMatchConfidence(recognizedString, windowString)

    if (confidence >= config.confidenceThreshold) {
      matches.push({ index: i, confidence })
    }
  }

  // If no matches found, return -1
  if (matches.length === 0) {
    return -1
  }

  // Refine each match with single-step search
  if (stepSize > 1) {
    for (const match of matches) {
      const searchStart = Math.max(0, match.index - stepSize)
      const searchEnd = Math.min(reference.length - windowSize + 1, match.index + stepSize)

      for (let i = searchStart; i < searchEnd; i++) {
        const windowTokens = reference.slice(i, i + windowSize)
        const windowString = tokensToString(windowTokens)
        const confidence = calculateMatchConfidence(recognizedString, windowString)

        if (confidence > match.confidence) {
          match.confidence = confidence
          match.index = i
        }
      }
    }
  }

  // Score matches: combine confidence with proximity to hint position
  // A match needs to be significantly better (>10% more confident) to win over a closer match
  const PROXIMITY_WEIGHT = 0.1  // How much proximity matters vs confidence

  let bestMatch = matches[0]
  let bestScore = bestMatch.confidence

  for (const match of matches) {
    // Calculate proximity bonus (closer to hint = higher bonus)
    const distance = Math.abs(match.index - hintPosition)
    const maxDistance = reference.length
    const proximityBonus = (1 - distance / maxDistance) * PROXIMITY_WEIGHT

    const score = match.confidence + proximityBonus

    if (score > bestScore) {
      bestScore = score
      bestMatch = match
    }
  }

  return bestMatch.index
}

/**
 * Find the next matching position in word-only tokens.
 *
 * @param recognized - The recognized speech text
 * @param reference - Array of WORD-ONLY TextElements (no delimiters)
 * @param currentIndex - Current word position
 * @param config - Speech matcher configuration (from user settings/presets)
 * @returns New word index, or currentIndex if no better match found
 */
export function findNextPosition(
  recognized: string,
  reference: TextElement[],
  currentIndex: number,
  config: SpeechMatcherConfig = DEFAULT_MATCHER_CONFIG
): number {
  const result = computeSpeechRecognitionTokenIndex(
    recognized,
    reference,
    currentIndex,
    config.windowSize
  )

  if (!result || !result.token) {
    return currentIndex
  }

  // Allow matching at current position (for first word) or moving forward
  if (result.matchedWordIndex < currentIndex) {
    return currentIndex
  }

  // Check confidence by comparing LAST few words of recognized text
  // against words AROUND the matched position
  const recognizedTokens = tokenize(recognized).filter(t => t.type === 'TOKEN')

  // Take only the last 5 words of recognized text for comparison
  const lastRecognizedTokens = recognizedTokens.slice(-5)
  const recognizedString = tokensToString(lastRecognizedTokens)

  // Get reference words around the matched position (3 before, matched word, 3 after)
  // reference is already word-only, so no need to filter
  const matchStart = Math.max(0, result.matchedWordIndex - 3)
  const matchEnd = Math.min(reference.length, result.matchedWordIndex + 4)
  const referenceTokens = reference.slice(matchStart, matchEnd)
  const referenceString = tokensToString(referenceTokens)

  const confidence = calculateMatchConfidence(recognizedString, referenceString)

  // Use confidence threshold from config (set by user's preset)
  const effectiveThreshold = config.confidenceThreshold

  if (confidence < effectiveThreshold) {
    return currentIndex
  }

  // Use max jump from config (set by user's preset)
  const maxJump = config.maxJumpDistance
  const actualJump = result.matchedWordIndex - currentIndex

  if (actualJump > maxJump) {
    return currentIndex + maxJump
  }

  return result.matchedWordIndex
}
