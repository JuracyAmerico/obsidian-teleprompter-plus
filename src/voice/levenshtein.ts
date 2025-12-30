/**
 * Levenshtein Distance Algorithm
 *
 * Optimized implementation for calculating edit distance between strings.
 * Based on js-levenshtein (MIT license) via jlecomte/voice-activated-teleprompter.
 */

/**
 * Helper function to find minimum with character comparison optimization.
 */
function min(d0: number, d1: number, d2: number, bx: number, ay: number): number {
  return d0 < d1 || d2 < d1
    ? d0 > d2
      ? d2 + 1
      : d0 + 1
    : bx === ay
      ? d1
      : d1 + 1
}

/**
 * Calculate the Levenshtein (edit) distance between two strings.
 *
 * The Levenshtein distance is the minimum number of single-character edits
 * (insertions, deletions, or substitutions) required to change one string
 * into another.
 *
 * @param a - First string
 * @param b - Second string
 * @returns The edit distance (0 = identical strings)
 *
 * @example
 * levenshteinDistance('kitten', 'sitting') // Returns 3
 * levenshteinDistance('hello', 'hello')    // Returns 0
 * levenshteinDistance('', 'abc')           // Returns 3
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0
  }

  // Ensure a is the shorter string for optimization
  if (a.length > b.length) {
    const tmp = a
    a = b
    b = tmp
  }

  let la = a.length
  let lb = b.length

  // Trim common suffix
  while (la > 0 && a.charCodeAt(la - 1) === b.charCodeAt(lb - 1)) {
    la--
    lb--
  }

  // Trim common prefix
  let offset = 0
  while (offset < la && a.charCodeAt(offset) === b.charCodeAt(offset)) {
    offset++
  }

  la -= offset
  lb -= offset

  // Handle edge cases
  if (la === 0 || lb < 3) {
    return lb
  }

  // Main algorithm with 4-way parallelization
  let x = 0
  let y: number
  let d0: number, d1: number, d2: number, d3: number
  let dd = 0
  let dy: number
  let ay: number
  let bx0: number, bx1: number, bx2: number, bx3: number
  const vector: number[] = []

  // Initialize vector
  for (y = 0; y < la; y++) {
    vector.push(y + 1)
    vector.push(a.charCodeAt(offset + y))
  }

  const len = vector.length - 1

  // Process 4 characters at a time
  for (; x < lb - 3;) {
    bx0 = b.charCodeAt(offset + (d0 = x))
    bx1 = b.charCodeAt(offset + (d1 = x + 1))
    bx2 = b.charCodeAt(offset + (d2 = x + 2))
    bx3 = b.charCodeAt(offset + (d3 = x + 3))
    dd = x += 4

    for (y = 0; y < len; y += 2) {
      dy = vector[y]
      ay = vector[y + 1]
      d0 = min(dy, d0, d1, bx0, ay)
      d1 = min(d0, d1, d2, bx1, ay)
      d2 = min(d1, d2, d3, bx2, ay)
      dd = min(d2, d3, dd, bx3, ay)
      vector[y] = dd
      d3 = d2
      d2 = d1
      d1 = d0
      d0 = dy
    }
  }

  // Process remaining characters
  for (; x < lb;) {
    bx0 = b.charCodeAt(offset + (d0 = x))
    dd = ++x

    for (y = 0; y < len; y += 2) {
      dy = vector[y]
      vector[y] = dd = min(dy, d0, dd, bx0, vector[y + 1])
      d0 = dy
    }
  }

  return dd
}

/**
 * Calculate similarity ratio between two strings (0-1).
 *
 * @param a - First string
 * @param b - Second string
 * @returns Similarity ratio (1 = identical, 0 = completely different)
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0

  const distance = levenshteinDistance(a, b)
  const maxLength = Math.max(a.length, b.length)

  return 1 - distance / maxLength
}
