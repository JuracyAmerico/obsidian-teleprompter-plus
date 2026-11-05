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
