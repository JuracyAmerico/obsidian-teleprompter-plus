/**
 * Finding "the same passage" after the text around it changed. Live refresh, jumping to the note and
 * remembered position all need this, and pixels cannot answer it: they change with font size and
 * with every edit above the reader. Everything here works on words, so it is pure and testable; the
 * DOM half is `passage-dom.ts`.
 */

import { tokenize } from './voice/word-tokenizer'
import { findGlobalPosition } from './voice/speech-matcher'
import type { TextElement } from './voice/types'

/** Same word for matching purposes: case and accents never count as an edit. */
export function foldWord(word: string): string {
	return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function wordsOf(text: string): string[] {
	return tokenize(text).filter(t => t.type === 'TOKEN').map(t => t.value)
}

/** How far a mismatch may be skipped when realigning. Larger edits are caught by prefix and suffix. */
const REALIGN_WINDOW = 300

/** Comparisons one alignment may spend. A whole-note rewrite must not freeze the prompter. */
const REALIGN_BUDGET = 2_000_000

/**
 * For each word of `from`, its index in `to`, or -1 when it has no counterpart. Common prefix and
 * suffix go first, so one edit of any size costs nothing; what is left is walked forward, and a
 * realignment needs two words in a row so a stray "the" cannot pull it off course.
 */
export function alignWords(from: string[], to: string[]): Int32Array {
	const a = from.map(foldWord)
	const b = to.map(foldWord)
	const map = new Int32Array(a.length).fill(-1)

	let start = 0
	while (start < a.length && start < b.length && a[start] === b[start]) {
		map[start] = start
		start++
	}
	let endA = a.length - 1
	let endB = b.length - 1
	while (endA >= start && endB >= start && a[endA] === b[endB]) {
		map[endA] = endB
		endA--
		endB--
	}

	const twoInARow = (i: number, j: number): boolean =>
		a[i] === b[j] && (i === endA || j === endB || a[i + 1] === b[j + 1])

	let i = start
	let j = start
	let spent = 0
	while (i <= endA && j <= endB && spent < REALIGN_BUDGET) {
		if (a[i] === b[j]) {
			map[i] = j
			i++
			j++
			continue
		}
		let found = false
		for (let distance = 1; distance <= REALIGN_WINDOW && !found; distance++) {
			for (let skipA = 0; skipA <= distance; skipA++) {
				const nextI = i + skipA
				const nextJ = j + distance - skipA
				if (nextI > endA || nextJ > endB) continue
				spent++
				if (twoInARow(nextI, nextJ)) {
					i = nextI
					j = nextJ
					found = true
					break
				}
			}
		}
		if (!found) {
			i++
			j++
		}
	}
	return map
}

/**
 * Where a word landed. A deleted word resolves to the nearest surviving word before it, so the
 * reader never moves past text they have not read.
 */
export function mapWordIndex(map: Int32Array, index: number, targetLength: number): number {
	if (targetLength === 0) return 0
	for (let i = Math.min(index, map.length - 1); i >= 0; i--) {
		if (map[i] >= 0) return map[i]
	}
	return 0
}

/** A place in a script that survives the script changing: no pixels, by design. */
export interface PassageAnchor {
	wordIndex: number
	/** A few words starting at `contextStart`, used to find the place again. */
	context: string
	contextStart: number
	/** Share of the script already passed, for when the words themselves are gone. */
	fraction: number
}

const CONTEXT_WORDS = 8

export function makeAnchor(words: string[], wordIndex: number): PassageAnchor {
	const index = Math.max(0, Math.min(wordIndex, Math.max(0, words.length - 1)))
	const contextStart = Math.max(0, Math.min(index, words.length - CONTEXT_WORDS))
	return {
		wordIndex: index,
		context: words.slice(contextStart, contextStart + CONTEXT_WORDS).join(' '),
		contextStart,
		fraction: words.length > 1 ? index / (words.length - 1) : 0,
	}
}

/** Stricter than voice matching: this is one lookup with all the words known, not a guess at speech. */
const ANCHOR_MATCH = { windowSize: CONTEXT_WORDS, maxJumpDistance: 0, confidenceThreshold: 0.7 }

/** The start of this run of words nearest to `near`, or -1. The fuzzy search steps over long scripts, so it goes second. */
function nearestExactRun(run: string[], words: string[], near: number): number {
	const wanted = run.map(foldWord)
	if (wanted.length < 2) return -1
	let best = -1
	for (let start = 0; start <= words.length - wanted.length; start++) {
		if (foldWord(words[start]) !== wanted[0]) continue
		if (!wanted.every((word, i) => foldWord(words[start + i]) === word)) continue
		if (best < 0 || Math.abs(start - near) < Math.abs(best - near)) best = start
	}
	return best
}

/** Where an anchor is in this script now. Falls back to the same share of the script, clamped. */
export function resolveAnchor(anchor: PassageAnchor, words: string[]): number {
	if (words.length === 0) return 0
	const last = words.length - 1
	const offset = anchor.wordIndex - anchor.contextStart

	const contextWords = anchor.context.split(' ')
	const stillThere = contextWords.every(
		(word, i) => foldWord(words[anchor.contextStart + i] ?? '') === foldWord(word)
	)
	if (stillThere && contextWords[0] !== '') return Math.min(last, anchor.wordIndex)

	const exact = nearestExactRun(contextWords, words, anchor.contextStart)
	if (exact >= 0) return Math.min(last, exact + offset)

	const reference: TextElement[] = words.map((value, index) => ({ type: 'TOKEN', value, index }))
	const found = findGlobalPosition(anchor.context, reference, ANCHOR_MATCH, anchor.contextStart)
	if (found >= 0) return Math.min(last, found + offset)
	return Math.min(last, Math.round(anchor.fraction * last))
}

/** One word of the note's own text, with the 0-based line of `content` it sits on. */
export function sourceWords(content: string): { words: string[]; lineOf: number[] } {
	const words: string[] = []
	const lineOf: number[] = []
	content.split('\n').forEach((line, lineNumber) => {
		for (const word of wordsOf(line)) {
			words.push(word)
			lineOf.push(lineNumber)
		}
	})
	return { words, lineOf }
}

/** The line of `content` a rendered word came from, or -1 when the script has no words. */
export function sourceLineOfWord(renderedWords: string[], wordIndex: number, content: string): number {
	const { words, lineOf } = sourceWords(content)
	if (words.length === 0 || renderedWords.length === 0) return -1
	const map = alignWords(renderedWords, words)
	return lineOf[mapWordIndex(map, wordIndex, words.length)] ?? -1
}
