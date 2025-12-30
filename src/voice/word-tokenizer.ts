/**
 * Word Tokenizer
 *
 * Tokenizes text into words and delimiters for speech matching.
 * Ported from jlecomte/voice-activated-teleprompter (MIT license).
 */

import type { TextElement } from './types'

/**
 * Tokenize text into an array of TextElements (words and delimiters).
 *
 * @param text - The text to tokenize
 * @returns Array of TextElements with type, value, and index
 */
export function tokenize(text: string | null): TextElement[] {
  const results: TextElement[] = []

  if (text === null || text === undefined) {
    return results
  }

  let current: TextElement | null = null
  let i = 0

  while (i < text.length) {
    let s = text[i]
    let inToken: boolean

    // Special case for text within brackets [hints], which we skip
    if (s === '[') {
      const hintLength = text.substring(i).indexOf(']')
      s = hintLength > 0 ? text.substring(i, i + hintLength + 1) : text.substring(i)
      inToken = false
    } else {
      // Match letters (including accented Latin and Cyrillic), numbers, and underscores
      // Extended to support: Latin, Latin Extended, Cyrillic
      inToken = /[A-Za-zÀ-ÿА-Яа-я0-9_]/.test(s)
    }

    if (current === null) {
      current = {
        type: inToken ? 'TOKEN' : 'DELIMITER',
        value: s,
        index: 0
      }
    } else if (
      (current.type === 'TOKEN' && inToken) ||
      (current.type === 'DELIMITER' && !inToken)
    ) {
      // Continue building current token/delimiter
      current.value += s
    } else if (
      (current.type === 'TOKEN' && !inToken) ||
      (current.type === 'DELIMITER' && inToken)
    ) {
      // Transition between token and delimiter
      const lastIndex: number = current.index
      results.push(current)
      current = {
        type: inToken ? 'TOKEN' : 'DELIMITER',
        value: s,
        index: lastIndex + 1
      }
    }

    i += s.length
  }

  // Don't forget to add the last element
  if (current !== null) {
    results.push(current)
  }

  return results
}

/**
 * Get only the word tokens from text (filters out delimiters).
 *
 * @param text - The text to tokenize
 * @returns Array of word tokens only
 */
export function tokenizeWords(text: string | null): TextElement[] {
  return tokenize(text).filter(element => element.type === 'TOKEN')
}

/**
 * Convert tokens back to a normalized string for comparison.
 * Joins words with single spaces, trims, and normalizes whitespace.
 *
 * @param tokens - Array of TextElements
 * @returns Normalized string
 */
export function tokensToString(tokens: TextElement[]): string {
  return tokens
    .filter(element => element.type === 'TOKEN')
    .reduce((accumulator, currentToken) => accumulator + ' ' + currentToken.value, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clean a word for comparison.
 * Lowercase, trim, and remove non-alphabetic characters.
 *
 * @param word - The word to clean
 * @returns Cleaned word
 */
export function cleanWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[^a-zà-ÿа-я0-9]/gi, '')
}
