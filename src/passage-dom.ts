/**
 * The DOM half of `passage-anchor.ts`: which rendered word sits where. Works with or without the
 * `.voice-word` spans, which exist only while voice runs, and counts words exactly as voice does so
 * an index here is an index there.
 */

import { tokenize } from './voice/word-tokenizer'

/** Text voice tracking never counts. Shared with the voice service so the two indexes cannot drift. */
export const UNTRACKED_TEXT_SELECTOR = 'pre, code, .embedded-note, script, style, .tp-stage-cue'

interface RenderedWord {
	node: Text
	start: number
	end: number
	value: string
}

export function renderedWords(container: HTMLElement): RenderedWord[] {
	const doc = container.ownerDocument
	const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode: node =>
			node.parentElement?.closest(UNTRACKED_TEXT_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
	})
	const words: RenderedWord[] = []
	while (walker.nextNode()) {
		const node = walker.currentNode as Text
		const text = node.textContent ?? ''
		if (!text.trim()) continue
		let offset = 0
		for (const element of tokenize(text)) {
			if (element.type === 'TOKEN') {
				words.push({ node, start: offset, end: offset + element.value.length, value: element.value })
			}
			offset += element.value.length
		}
	}
	return words
}

function wordRect(word: RenderedWord): DOMRect {
	const range = word.node.ownerDocument.createRange()
	range.setStart(word.node, word.start)
	range.setEnd(word.node, word.end)
	return range.getBoundingClientRect()
}

/** First word whose line reaches `offsetFromTop` pixels below the top of the visible area. */
export function wordAtViewportOffset(
	container: HTMLElement,
	words: RenderedWord[],
	offsetFromTop: number
): number {
	if (words.length === 0) return 0
	const targetY = container.getBoundingClientRect().top + offsetFromTop
	let low = 0
	let high = words.length - 1
	while (low < high) {
		const middle = Math.floor((low + high) / 2)
		if (wordRect(words[middle]).bottom < targetY) low = middle + 1
		else high = middle
	}
	return low
}

/** Scroll position that puts a word `offsetFromTop` pixels below the top of the visible area. */
export function scrollTopForWord(
	container: HTMLElement,
	words: RenderedWord[],
	wordIndex: number,
	offsetFromTop: number
): number {
	const word = words[Math.max(0, Math.min(wordIndex, words.length - 1))]
	if (!word) return 0
	const fromTop = wordRect(word).top - container.getBoundingClientRect().top
	return Math.max(0, container.scrollTop + fromTop - offsetFromTop)
}

/** The word under a mouse position, or -1 outside any tracked word. */
export function wordAtPoint(
	container: HTMLElement,
	words: RenderedWord[],
	clientX: number,
	clientY: number
): number {
	const caret = container.ownerDocument.caretRangeFromPoint(clientX, clientY)
	if (!caret || caret.startContainer.nodeType !== Node.TEXT_NODE) return -1
	const node = caret.startContainer as Text
	const offset = caret.startOffset
	let nearest = -1
	for (let i = 0; i < words.length; i++) {
		if (words[i].node !== node) continue
		if (offset >= words[i].start && offset <= words[i].end) return i
		// On a delimiter inside the same text: the next word is what the reader meant.
		if (nearest < 0 && words[i].start >= offset) nearest = i
	}
	return nearest
}

/**
 * Where each rendered line starts, in words and in pixels, so a reading position can be fractional.
 * Mirroring by whole words moves only when the eyeline crosses into a new line, a jump of one line
 * height; a fractional word index glides. Word space, not pixels, because the two views wrap the
 * same words into different lines (ISC-142).
 */
export interface LineTable {
	/** Index of each line's first word, then the word count as an end sentinel. Strictly increasing. */
	firstWord: number[]
	/** Content y of each line's top, then the last line's bottom. Strictly increasing. */
	top: number[]
	/** Area under `lineY` from the first line start to each line start, for the smoothing below. */
	area: number[]
}

export interface WordBox {
	top: number
	bottom: number
}

/**
 * Group word boxes, in reading order and content coordinates, into lines. A word starts a new line
 * when its vertical middle is below everything on the current line, so mixed font sizes and
 * superscripts stay on their line, and a table cell that starts higher never makes y run backwards.
 */
export function buildLineTable(boxes: WordBox[]): LineTable {
	const firstWord: number[] = []
	const top: number[] = []
	let lineBottom = Number.NEGATIVE_INFINITY
	boxes.forEach((box, index) => {
		// Hidden words (a collapsed callout) have no box and belong to no line.
		if (!(box.bottom > box.top)) return
		if ((box.top + box.bottom) / 2 > lineBottom) {
			const previous = top.length > 0 ? top[top.length - 1] : Number.NEGATIVE_INFINITY
			firstWord.push(index)
			top.push(Math.max(box.top, previous + 1))
			lineBottom = box.bottom
		} else {
			lineBottom = Math.max(lineBottom, box.bottom)
		}
	})
	if (top.length === 0) return { firstWord: [], top: [], area: [] }
	firstWord.push(boxes.length)
	top.push(Math.max(lineBottom, top[top.length - 1] + 1))
	const area = [0]
	for (let i = 1; i < top.length; i++) {
		area.push(area[i - 1] + ((firstWord[i] - firstWord[i - 1]) * (top[i - 1] + top[i])) / 2)
	}
	return { firstWord, top, area }
}

/** The line table of a rendered script, in the container's scroll coordinates. */
export function lineTable(container: HTMLElement, words: RenderedWord[]): LineTable {
	const origin = container.getBoundingClientRect().top - container.scrollTop
	return buildLineTable(
		words.map(word => {
			const rect = wordRect(word)
			return { top: rect.top - origin, bottom: rect.bottom - origin }
		})
	)
}

/** Largest i below `count` with values[i] <= target; 0 when none is. */
function lastAtOrBelow(values: number[], count: number, target: number): number {
	let low = 0
	let high = count - 1
	while (low < high) {
		const middle = Math.ceil((low + high) / 2)
		if (values[middle] <= target) low = middle
		else high = middle - 1
	}
	return low
}

/**
 * Content y of a fractional word index, straight between two line starts: exact at each line's
 * first word. Flat before the first line and after the last.
 */
export function lineY(table: LineTable, position: number): number {
	const lines = table.top.length - 1
	if (lines <= 0) return 0
	// Negated so a NaN lands on the first line instead of poisoning the search.
	if (!(position > table.firstWord[0])) return table.top[0]
	if (position >= table.firstWord[lines]) return table.top[lines]
	const i = lastAtOrBelow(table.firstWord, lines, position)
	const share = (position - table.firstWord[i]) / (table.firstWord[i + 1] - table.firstWord[i])
	return table.top[i] + share * (table.top[i + 1] - table.top[i])
}

/** Area under `lineY` from the first line start to `position`; negative before it. */
function areaTo(table: LineTable, position: number): number {
	const lines = table.top.length - 1
	const first = table.firstWord[0]
	if (position <= first) return (position - first) * table.top[0]
	if (position >= table.firstWord[lines]) return table.area[lines] + (position - table.firstWord[lines]) * table.top[lines]
	const i = lastAtOrBelow(table.firstWord, lines, position)
	const along = position - table.firstWord[i]
	const slope = (table.top[i + 1] - table.top[i]) / (table.firstWord[i + 1] - table.firstWord[i])
	return table.area[i] + along * table.top[i] + (slope * along * along) / 2
}

/**
 * Words on each side that a position's y is averaged over. Straight per-line interpolation is exact
 * at line starts but steep wherever a wrap leaves a few words a line of their own, and the two
 * views put those short lines in different places: measured live on 2026-11-25, the main view ran
 * 5-6 px a frame for 15 frames against the floating view's 1 px. Averaging over about two lines
 * of words makes the speed in each view the pixel height of the same run of words, which the two
 * views share wherever their wraps roughly agree.
 */
export const SMOOTHING_WORDS = 6

function clampPosition(table: LineTable, position: number): number {
	const lines = table.top.length - 1
	const first = table.firstWord[0]
	if (!(position > first)) return first
	return Math.min(position, table.firstWord[lines])
}

/**
 * Content y of a fractional word index: `lineY` averaged over `SMOOTHING_WORDS` either side.
 * Strictly increasing over the script, so `positionAtY` inverts it.
 */
export function yAtPosition(table: LineTable, position: number): number {
	if (table.top.length - 1 <= 0) return 0
	const at = clampPosition(table, position)
	return (areaTo(table, at + SMOOTHING_WORDS) - areaTo(table, at - SMOOTHING_WORDS)) / (2 * SMOOTHING_WORDS)
}

/** Bisection steps for `positionAtY`: a 10,000-word script comes out exact to 1e-11 words. */
const INVERSE_STEPS = 50

/** Fractional word index whose `yAtPosition` is `y`, clamped to the script. */
export function positionAtY(table: LineTable, y: number): number {
	const lines = table.top.length - 1
	if (lines <= 0) return 0
	let low = table.firstWord[0]
	let high = table.firstWord[lines]
	if (!(y > yAtPosition(table, low))) return low
	if (y >= yAtPosition(table, high)) return high
	for (let step = 0; step < INVERSE_STEPS; step++) {
		const middle = (low + high) / 2
		if (yAtPosition(table, middle) < y) low = middle
		else high = middle
	}
	return (low + high) / 2
}
