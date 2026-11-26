import { afterEach, describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { scriptHash, wordListText } from './script-fingerprint'
import { tokenizeWords } from './word-tokenizer'

void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')

describe('scriptHash', () => {
	test('is stable, 14 hex characters, and tells near-identical scripts apart', () => {
		const a = scriptHash('Thanks for having me today.')
		expect(a).toMatch(/^[0-9a-f]{14}$/)
		expect(scriptHash('Thanks for having me today.')).toBe(a)
		expect(scriptHash('Thanks for having me today!')).not.toBe(a)
		expect(scriptHash('')).toMatch(/^[0-9a-f]{14}$/)
	})

	test('the word list splits back into the exact words the matcher indexes', () => {
		const words = tokenizeWords("Don't cross-border, it's 2026.")
		expect(wordListText(words).split(' ')).toEqual(words.map(w => w.value))
	})
})

// --- A DOM just large enough for initialize(): one paragraph of text the service wraps in spans. ---

interface FakeNode { textContent: string; parentElement: FakeElement | null }
interface FakeElement {
	children: unknown[]
	textContent: string
	replaceChild: (fragment: { nodes: unknown[] }, old: FakeNode) => void
	closest: () => null
	classList: { contains: () => boolean; add: () => void; remove: () => void }
	querySelectorAll: () => unknown[]
	addEventListener: () => void
	removeEventListener: () => void
	ownerDocument: { defaultView: null }
	scrollTop: number
	clientHeight: number
}

const saved = { document: globalThis.document, NodeFilter: (globalThis as Record<string, unknown>).NodeFilter }
afterEach(() => {
	globalThis.document = saved.document
	;(globalThis as Record<string, unknown>).NodeFilter = saved.NodeFilter
})

function fakeContentArea(text: string): FakeElement {
	const classList = { contains: () => false, add: () => {}, remove: () => {} }
	const area: FakeElement = {
		children: [],
		get textContent() { return text },
		replaceChild: (fragment, old) => {
			area.children.splice(area.children.indexOf(old), 1, ...fragment.nodes)
		},
		closest: () => null,
		classList,
		querySelectorAll: () => [],
		addEventListener: () => {},
		removeEventListener: () => {},
		ownerDocument: { defaultView: null },
		scrollTop: 0,
		clientHeight: 600,
	}
	const node: FakeNode = { textContent: text, parentElement: area }
	area.children.push(node)
	;(globalThis as Record<string, unknown>).NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 }
	globalThis.document = {
		createTreeWalker: () => {
			const nodes = area.children.filter((c): c is FakeNode => (c as FakeNode).parentElement === area)
			let i = -1
			return {
				get currentNode() { return nodes[i] },
				nextNode: () => (++i < nodes.length ? nodes[i] : null),
			}
		},
		createDocumentFragment: () => {
			const nodes: unknown[] = []
			return { nodes, appendChild: (n: unknown) => nodes.push(n) }
		},
		createElement: () => ({ className: '', dataset: {}, textContent: '', offsetTop: 0, classList }),
		createTextNode: (value: string) => ({ textContent: value }),
	} as unknown as Document
	return area
}

function traceInitialize(script: string, rendered: string, source?: { path: string; mtime: number }) {
	const recognizer = {
		onResult: () => {}, onStatus: () => {}, onError: () => {}, onProgress: () => {},
		updateGrammar: () => {}, getIsInitialized: () => true, getLanguage: () => 'en-US', dispose: () => {},
	}
	const service = new VoiceTrackingService({ engine: 'vosk', language: 'en-US' }, recognizer as never)
	const events: { event: string; data: Record<string, unknown> }[] = []
	service.onDiagnostic = (event, data) => events.push({ event, data })
	service.initialize(script, fakeContentArea(rendered) as unknown as HTMLElement, source)
	return events
}

describe('the trace records what a replay needs', () => {
	const markdown = '# Rehearsal\n\nI spent **seven** years at `code` Tableau.'
	const rendered = 'Rehearsal I spent seven years at Tableau.'

	test('init carries the script text, its hash, the language and the note when the host gives it', () => {
		const init = traceInitialize(markdown, rendered, { path: 'notes/rehearsal.md', mtime: 1764000000000 })
			.find(e => e.event === 'init')?.data
		expect(init).toMatchObject({
			script: markdown,
			scriptHash: scriptHash(markdown),
			contentChars: markdown.length,
			language: 'en-US',
			notePath: 'notes/rehearsal.md',
			noteMtime: 1764000000000,
		})
	})

	test('init leaves the note fields out when the host does not know the note', () => {
		const init = traceInitialize(markdown, rendered).find(e => e.event === 'init')?.data
		expect(init).toBeDefined()
		expect(init && 'notePath' in init).toBe(false)
		expect(init?.script).toBe(markdown)
	})

	test('wrapped carries the exact rendered word list the matcher indexes, with its hash', () => {
		const wrapped = traceInitialize(markdown, rendered).find(e => e.event === 'wrapped')?.data
		const expected = 'Rehearsal I spent seven years at Tableau'
		expect(wrapped).toMatchObject({ words: 7, wordList: expected, wordsHash: scriptHash(expected) })
	})
})
