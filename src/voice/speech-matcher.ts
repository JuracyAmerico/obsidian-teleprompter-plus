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

/** Recognizers often drop accents ("voce" for "você"), and that must not read as a different word. */
function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Configuration for speech matching algorithm.
 * These values control how aggressively the matcher follows speech.
 */
export interface SpeechMatcherConfig {
  windowSize: number           // Global re-sync window, and the floor of the local look-ahead (default: 6)
  confidenceThreshold: number  // Min confidence to accept match (default: 0.2)
}

/** Default configuration - balanced preset */
export const DEFAULT_MATCHER_CONFIG: SpeechMatcherConfig = {
  windowSize: 6,
  confidenceThreshold: 0.20
}

/** How many of the last words heard locate the reader. Enough to tell repeats apart, few enough to stay current. */
const TAIL_WORDS = 5
/** How far past the current place the reader can be found: a full clause, for a reader who surged ahead. */
const LOCAL_LOOK_AHEAD = TAIL_WORDS + 18
/**
 * Places just behind the current one are scored too, but never chosen. Without them a partial that only
 * repeats words already matched would have to land on the best lookalike AHEAD, and push the place on.
 */
const LOCAL_LOOK_BEHIND = 3
/**
 * A farther candidate pays this much per word of distance (in word-edit units, counting words the reader
 * says, not heading words). It breaks ties toward the nearer copy of a repeated phrase without pinning the
 * place behind a reader who moved on.
 */
const PROXIMITY_PENALTY = 0.04
/** Two words this close (edit distance over length) are the same word said with an accent: "tablo"/"tableau". */
const SAME_WORD_MAX_DISTANCE = 0.5
/** Skipping or adding a word this short costs half: recognizers drop and insert "a", "o", "the" freely. */
const SHORT_WORD_LENGTH = 3

/**
 * Passing over a heading word unsaid costs this much, when the reader then says a word after it. Readers
 * skip headings: a section number, a title, the interviewer's question they rehearse the answer to. At a
 * full word each, "## 2 Who is watching Canada" cost 3.5, more than the first two words of the section
 * could earn back, and the place waited behind the heading for a whole tail of new words.
 */
const HEADING_SKIP_COST = 0.05

/** One word compared with another: 0 identical, up to SAME_WORD_MAX_DISTANCE for an accent, 1 a different word. */
function wordCost(heard: string, script: string): number {
  if (heard === script) return 0
  const distance = levenshteinDistance(heard, script) / Math.max(heard.length, script.length)
  return distance <= SAME_WORD_MAX_DISTANCE ? distance : 1
}

function gapCost(word: string): number {
  return word.length <= SHORT_WORD_LENGTH ? 0.5 : 1
}

function matchKey(word: string): string {
  return foldAccents(word.toLowerCase())
}

/**
 * The cost of the heard words ending exactly at each script word in [from, to], by word-level
 * approximate matching with a free start (Sellers): the heard tail may begin anywhere, but it is
 * scored against the words that END at the candidate. That is what the old prefix match got wrong —
 * it always began at the current place, so every word between the place and the voice counted as
 * an edit, and a reader a few words ahead lost to a nearer, worse alignment.
 */
function tailCostsEndingAt(tail: string[], reference: TextElement[], from: number, to: number): number[] {
  // Room for the tail (and a dropped word or two) to sit wholly before the first candidate
  const start = Math.max(0, from - tail.length - 2)
  const candidates = reference.slice(start, to + 1)
  const script = candidates.map(t => matchKey(t.value))
  // Unsaid before a heard word: a heading word costs next to nothing. Unsaid after the last heard word:
  // full price, heading or not, so the place never runs ahead of the voice over a heading.
  const passOver = candidates.map((t, j) => (t.heading ? HEADING_SKIP_COST : gapCost(script[j])))
  // previous[j]: cost of the first i heard words ending at script[j - 1]; column 0 is "before the window"
  let previous = new Array<number>(script.length + 1).fill(0)
  let ended = previous
  for (const heard of tail) {
    const said = new Array<number>(script.length + 1)
    const passed = new Array<number>(script.length + 1).fill(Infinity)
    const trailing = new Array<number>(script.length + 1).fill(Infinity)
    said[0] = previous[0] + gapCost(heard)
    for (let j = 1; j <= script.length; j++) {
      said[j] = Math.min(
        previous[j - 1] + wordCost(heard, script[j - 1]), // heard word is this script word
        previous[j] + gapCost(heard),                     // heard word is not in the script
      )
      // script word j - 1 was not heard
      passed[j] = Math.min(said[j - 1], passed[j - 1]) + passOver[j - 1]
      trailing[j] = Math.min(said[j - 1], trailing[j - 1]) + gapCost(script[j - 1])
    }
    previous = said.map((cost, j) => Math.min(cost, passed[j]))
    ended = said.map((cost, j) => Math.min(cost, trailing[j]))
  }
  // Candidate index k sits at column k - start + 1
  return Array.from({ length: to - from + 1 }, (_, i) => ended[from + i - start + 1])
}

/**
 * Find where the reader is, near the current place, from what was just heard.
 *
 * The last TAIL_WORDS heard words are aligned against the script ending at each candidate word from a
 * little behind the place to LOCAL_LOOK_AHEAD past it. The cheapest alignment wins, with a small
 * penalty per word of distance so the nearer copy of a repeated phrase wins a tie. Case and accents
 * never count, and a word said with an accent ("brasil", "tablo") costs only a fraction of a miss.
 *
 * IMPORTANT: This function expects reference to be WORD-ONLY tokens (no delimiters).
 * The returned matchedWordIndex is the position in this word-only array, and may be BEHIND the
 * current place: that means the voice has not moved on, and callers must not go back for it.
 *
 * @param recognized - The recognized speech text (a whole cumulative partial is fine)
 * @param reference - Array of WORD-ONLY TextElements from the reference script
 * @param lastRecognizedTokenIndex - The current place
 * @param windowSize - Floor for the look-ahead (from config); the look-ahead is never shorter than LOCAL_LOOK_AHEAD
 * @returns MatchResult with the best place and its confidence, or null if nothing was heard
 */
export function computeSpeechRecognitionTokenIndex(
  recognized: string,
  reference: TextElement[],
  lastRecognizedTokenIndex: number,
  windowSize: number = DEFAULT_MATCHER_CONFIG.windowSize
): MatchResult | null {
  if (reference.length === 0) return null
  const place = Math.min(Math.max(0, lastRecognizedTokenIndex), reference.length - 1)
  return bestTailAlignment(recognized, reference, place, place - LOCAL_LOOK_BEHIND, place + Math.max(windowSize, LOCAL_LOOK_AHEAD))
}

/** How far either side of an estimated end the heard words are re-aligned. A recognizer drops or adds a word or two. */
const END_ALIGN_RADIUS = 3

/**
 * Where, near `approxEnd`, the last heard words end, with the same alignment and confidence as local
 * matching. A re-sync uses this to land on the last heard word, and to reject a match whose last words
 * do not actually line up with the script there (an off-script aside that happens to share letters).
 */
export function alignHeardEnd(recognized: string, reference: TextElement[], approxEnd: number): MatchResult | null {
  if (reference.length === 0) return null
  const place = Math.min(Math.max(0, approxEnd), reference.length - 1)
  return bestTailAlignment(recognized, reference, place, place - END_ALIGN_RADIUS, place + END_ALIGN_RADIUS)
}

/**
 * Added to the preset's threshold (0.15-0.25, set for the old letter-level score) before a tail
 * alignment may move the place. Measured on the interview fixture: off-script phrases align at
 * 0.3-0.5 and words actually read (every seventh one accented) at 0.8 and above. At 0.4, off-script
 * phrases move the matcher 1% of the time (0.3: 10%, none: 44%), and the gap test's reader, who says
 * something off-script after every second sentence, never has the place pulled ahead of them; the
 * cost is a slower follow when every third word is paraphrased.
 */
export const EVIDENCE_FLOOR = 0.4

/**
 * A forward move longer than this many said words must be carried by the support, not only the confidence.
 * Picked on the tune split: 2 and 3 also blocked real catch-ups (lag p95 5 to 6 words); 6 let a false
 * 6-word move through. Shorter moves follow reading and keep the confidence alone.
 */
const FAR_MOVE_WORDS = 4

/** Whether a tail alignment is strong enough to move the place. */
export function isConfidentMatch(confidence: number, config: SpeechMatcherConfig): boolean {
  return confidence >= EVIDENCE_FLOOR + config.confidenceThreshold
}

/** The cheapest place in [from, to] for the heard tail to end, nearer `place` winning ties. */
function bestTailAlignment(recognized: string, reference: TextElement[], place: number, from: number, to: number): MatchResult | null {
  const tail = tokenize(recognized)
    .filter(element => element.type === 'TOKEN')
    .slice(-TAIL_WORDS)
    .map(t => matchKey(t.value))
  if (tail.length === 0) return null

  const first = Math.max(0, from)
  const last = Math.min(reference.length - 1, to)
  const costs = tailCostsEndingAt(tail, reference, first, last)

  let best = 0
  let bestScore = Infinity
  for (let i = 0; i < costs.length; i++) {
    // Distance in words the reader says: the first word after a heading is next to the last one before it.
    const candidate = first + i
    const distance = candidate >= place ? spokenWordsBetween(reference, place, candidate) : spokenWordsBetween(reference, candidate, place)
    const score = costs[i] + PROXIMITY_PENALTY * distance
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }

  const matchedWordIndex = first + best
  const unexplained = tail.reduce((sum, word) => sum + gapCost(word), 0)
  return {
    matchedWordIndex,
    token: reference[matchedWordIndex],
    confidence: Math.max(0, 1 - costs[best] / tail.length),
    support: Math.max(0, 1 - costs[best] / unexplained),
  }
}

/** Words the reader says from `from` to `to`, heading words between them passed over unsaid. */
function spokenWordsBetween(reference: TextElement[], from: number, to: number): number {
  let said = 0
  for (let i = from + 1; i <= to; i++) if (!reference[i]?.heading) said++
  return said
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
    foldAccents(recognized.toLowerCase()),
    foldAccents(reference.toLowerCase())
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
  hintPosition: number = 0,
  searchRadius: number = Infinity
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

  // Bound the search to a window AROUND the reader's current position (hint).
  // The original jlecomte algorithm only ever matches a small local window ahead and
  // never searches the whole document — that is what prevents teleporting to the end.
  // We keep a (larger) bounded window so re-sync can relocate near where the user is
  // looking, but a few mis-heard words can never fling them to an unrelated section.
  const lastWindowStart = reference.length - windowSize + 1
  const scanStart = Math.max(0, Math.floor(hintPosition - searchRadius))
  const scanEnd = Math.min(lastWindowStart, Math.ceil(hintPosition + searchRadius) + 1)

  // Step size scaled to the SEARCHED range (not the whole doc) for efficiency
  const scanSpan = Math.max(1, scanEnd - scanStart)
  const stepSize = Math.max(1, Math.floor(scanSpan / 200))

  for (let i = scanStart; i < scanEnd; i += stepSize) {
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

  // ── Anti-wrong-section guards (2026-07-11) ──────────────────────────────────
  // On scripts with several near-identical sections (e.g. multiple "Story" blocks),
  // proximity weighting alone can still teleport to the wrong twin. Two guards:
  //
  // Guard 1 — AMBIGUITY FREEZE: if a rival match FAR from the winner (farther than
  // one look-ahead span) is nearly as confident, the evidence does not distinguish
  // the twins. Freezing (return -1) is a minor stall the next utterance resolves;
  // a wrong-section jump derails the whole rehearsal. Do no harm.
  const AMBIGUITY_MARGIN = 0.08
  const FAR_SPAN = windowSize * 2
  for (const match of matches) {
    if (match === bestMatch) continue
    if (Math.abs(match.index - bestMatch.index) <= FAR_SPAN) continue // same locale — fine
    if (bestMatch.confidence - match.confidence < AMBIGUITY_MARGIN) {
      return -1
    }
  }

  // Guard 2 — WEAK-EVIDENCE TELEPORT BLOCK: a couple of recognized words ("story",
  // "one that") must not fling the prompter far from where the reader actually is.
  // Long-distance jumps require at least 4 recognized words of evidence.
  const MIN_TOKENS_FOR_FAR_JUMP = 4
  const FAR_JUMP_WORDS = 50
  if (
    recognizedTokens.length < MIN_TOKENS_FOR_FAR_JUMP &&
    Math.abs(bestMatch.index - hintPosition) > FAR_JUMP_WORDS
  ) {
    return -1
  }
  // ────────────────────────────────────────────────────────────────────────────

  return bestMatch.index
}

/** Words that must agree before voice believes the reader went back. Under this, a repeat is a coincidence. */
const REREAD_TAIL_WORDS = 6
/** Closer than this is ordinary lag behind a reader moving forward, not going back. */
const REREAD_MIN_BEHIND = 8
/** How far back a re-read is looked for. Farther needs the reader's own hand: scroll or R. */
const REREAD_MAX_BEHIND = 200
const REREAD_LOOK_AHEAD = 40

/**
 * The reader went back to say something again: the last words heard sit behind the current place, and
 * nowhere near it. Returns the index of the word just heard, or -1.
 *
 * Moving back on thin evidence is what used to fling the highlight to an earlier copy of a repeated
 * phrase, so this asks for six words in order with at most one misheard, and answers -1 if they occur
 * twice in range, ahead included. The caller also waits for a second reading that has moved on.
 */
export function findRereadPosition(recognized: string, reference: TextElement[], currentIndex: number): number {
  const heard = tokenize(recognized).filter(t => t.type === 'TOKEN').map(t => foldAccents(t.value.toLowerCase()))
  if (heard.length < REREAD_TAIL_WORDS) return -1
  const tail = heard.slice(-REREAD_TAIL_WORDS)

  const scriptWord = (i: number): string => foldAccents((reference[i]?.value ?? '').toLowerCase())

  /** The last script word these heard words land on, or -1. Vosk often drops "o" and "a", so a gap is allowed. */
  const endOfMatchAt = (start: number): number => {
    if (scriptWord(start) !== tail[0]) return -1
    let at = start
    let misses = 0
    for (let i = 1; i < tail.length; i++) {
      const next = [1, 2, 3].find(step => scriptWord(at + step) === tail[i])
      if (next !== undefined) {
        at += next
      } else {
        if (++misses > 1) return -1
        at += 1
      }
    }
    return at
  }

  const first = Math.max(0, currentIndex - REREAD_MAX_BEHIND)
  const last = Math.min(reference.length - tail.length, currentIndex + REREAD_LOOK_AHEAD)
  let found = -1
  for (let start = first; start <= last; start++) {
    const end = endOfMatchAt(start)
    if (end < 0) continue
    // Words right at or ahead of the place mean the reader is simply moving forward
    if (end > currentIndex - REREAD_MIN_BEHIND) return -1
    // Two copies behind: the words do not say which one. Overlapping hits are the same place.
    if (found >= 0 && end - found >= tail.length) return -1
    found = end
  }
  return found
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

  // The best alignment is at or behind the place: the voice has not moved on
  if (result.matchedWordIndex <= currentIndex) {
    return currentIndex
  }

  // The confidence is that of the alignment that chose the place: the heard tail against the words
  // ending there. (It used to be measured against a window centred on the match, which a correct
  // match ending at that word could fail.)
  if (!isConfidentMatch(result.confidence, config)) {
    return currentIndex
  }

  // A longer move must be carried by what was heard, not by a couple of short words that happen to match.
  // "Yes I'm authorized", re-read from twenty words back, matched only "I'm" in "I'm based in Ontario"
  // twelve words ahead; at the old confidence (0.6 to 0.75) it moved the place there three times in one
  // rehearsal, and "scope I'm" did the same off-script. Their support is 0.33 to 0.5.
  if (spokenWordsBetween(reference, currentIndex, result.matchedWordIndex) > FAR_MOVE_WORDS && !isConfidentMatch(result.support, config)) {
    return currentIndex
  }

  // Return the TRUE matched position. Jump magnitude is owned by the service layer:
  // small steps are capped for smoothness, large forward gaps are handled by catch-up.
  // Capping here is what made the tracker permanently trail a fast reader (and it also
  // starved the catch-up logic, since the reported jump never exceeded maxJump).
  return result.matchedWordIndex
}
