import { describe, expect, test } from 'bun:test'
import { scriptHash } from '../script-fingerprint'
import { resolveScript, type NoteLookup } from './bench'
import { contentMatchingHash, contentMatchingSize, renderedScriptWords, verifyWords } from './script-words'
import type { RecordedMatch, TraceSession, TracedScript } from './trace'

describe('renderedScriptWords', () => {
	test('drops what voice never counts: markup, code, stage cues, comments, section targets; decodes entities', () => {
		const markdown = [
			'# Opening {0:30}',
			'',
			'I *spent* seven [pause] years at `inline code` Tableau & more.',
			'',
			'```js',
			'const hidden = true',
			'```',
			'',
			'<!-- a note to self -->',
			"- It's a [link](https://example.com).",
		].join('\n')
		expect(renderedScriptWords(markdown)).toEqual(
			['Opening', 'I', 'spent', 'seven', 'years', 'at', 'Tableau', 'more', 'It', 's', 'a', 'link'],
		)
	})
})

describe('finding the prompted text of a note', () => {
	const raw = '---\ntitle: x\n---\nBody text here.\n\n# References\n\nSmith (2020). A book.'
	const body = 'Body text here.'

	test('by traced size, without its frontmatter and its trailing bibliography', () => {
		expect(contentMatchingSize(raw, body.length, 3)).toBe(body)
		expect(contentMatchingSize(raw, body.length + 1, 3)).toBeNull()
	})

	test('by traced hash', () => {
		expect(contentMatchingHash(raw, scriptHash(body))).toBe(body)
		expect(contentMatchingHash(raw, scriptHash('something else'))).toBeNull()
	})
})

const match = (cur: number, curWord: string, proposed: number, proposedWord: string): RecordedMatch =>
	({ t: 0, heardIndex: 0, cur, curWord, proposed, proposedWord, global: false, total: 4 })

describe('verifyWords', () => {
	test('measures how many recorded word positions a reconstructed list reproduces', () => {
		const matches = [match(0, 'one', 2, 'three'), match(2, 'three', 3, 'FOUR')]
		expect(verifyWords(['one', 'two', 'three', 'four'], null, matches)).toEqual({ compared: 4, agreement: 1, tracedCount: 4 })
		expect(verifyWords(['one', 'two', 'tree', 'four'], null, matches).agreement).toBe(0.5)
	})
})

describe('resolveScript', () => {
	const session = (script: TracedScript | null, matches: RecordedMatch[] = []): TraceSession => ({
		id: 's', file: 'f', view: 'v', start: 0, end: 0, script, continued: false, heard: [], matches, rereads: [],
	})
	const lookup = (notes: { path: string; raw: string }[]): NoteLookup => ({
		read: path => {
			const note = notes.find(n => n.path === path)
			return note ? { raw: note.raw, mtime: 0 } : null
		},
		findBySize: (chars, words) => notes
			.map(n => ({ ...n, content: contentMatchingSize(n.raw, chars, words) }))
			.filter((n): n is { path: string; raw: string; content: string } => n.content !== null),
	})

	test('prefers the word list the trace recorded, exactly as recorded', () => {
		const resolved = resolveScript(session({ wordList: 'one two', script: 'ignored text' }), lookup([]), 'auto')
		expect(resolved).toMatchObject({ ok: true, origin: 'trace word list', words: ['one', 'two'] })
	})

	test('finds an old trace\'s note by size, and says which note it used', () => {
		const resolved = resolveScript(
			session({ contentChars: 13, incomingWords: 3, wrappedWords: 3 }, [match(0, 'one', 2, 'three')]),
			lookup([{ path: 'a/b.md', raw: 'One two three' }, { path: 'c.md', raw: 'Unrelated' }]),
			'auto',
		)
		expect(resolved).toMatchObject({ ok: true, origin: 'vault note with the traced size', notePath: 'a/b.md', language: 'en-US' })
	})

	test('never guesses: an edited note, a missing note, or words that disagree with the trace are unresolved', () => {
		const sized = session({ contentChars: 13, incomingWords: 3, wrappedWords: 3 })
		expect(resolveScript(sized, lookup([{ path: 'x.md', raw: 'One two three four' }]), 'auto')).toMatchObject({ ok: false })
		expect(resolveScript(session({ notePath: 'gone.md', scriptHash: 'abc' }), lookup([]), 'auto'))
			.toEqual({ ok: false, reason: 'note gone.md no longer exists' })
		expect(resolveScript(session({ notePath: 'x.md', scriptHash: scriptHash('old text') }), lookup([{ path: 'x.md', raw: 'new text' }]), 'auto'))
			.toEqual({ ok: false, reason: 'note x.md changed since the session' })
		const disagreeing = session({ script: 'One two three four' }, Array.from({ length: 5 }, () => match(1, 'nine', 2, 'ten')))
		expect(resolveScript(disagreeing, lookup([]), 'auto')).toMatchObject({ ok: false })
		const twoNotes = lookup([{ path: 'a.md', raw: 'One two three' }, { path: 'b.md', raw: 'Six six six!!' }])
		expect(resolveScript(session({ contentChars: 13, incomingWords: 3 }), twoNotes, 'auto')).toMatchObject({ ok: false })
	})
})
