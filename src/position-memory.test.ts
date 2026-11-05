import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { alignWords, makeAnchor, mapWordIndex, resolveAnchor, sourceLineOfWord, wordsOf } from './passage-anchor'
import {
	MAX_REMEMBERED_POSITIONS,
	forgetPosition,
	rememberPosition,
	renamePosition,
	validPositions,
	type NotePositions,
} from './position-memory'
import { obsidianStub } from './test-support/obsidian-stub'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('./settings')

const script = wordsOf(
	'Thanks for your time today. I spent seven years as a Solutions Engineer at Tableau with clients across Brazil. ' +
	'Then I moved to Canada with my family and finished a master degree in management last September. ' +
	'Now I am returning to presales because that is where my work had the most impact on customers.'
)
const indexOf = (word: string): number => script.indexOf(word)

describe('passage anchor', () => {
	test('an unchanged script resolves to the exact word', () => {
		const i = indexOf('Canada')
		expect(resolveAnchor(makeAnchor(script, i), script)).toBe(i)
	})

	test('an edit above the reader still finds the passage', () => {
		const anchor = makeAnchor(script, indexOf('Canada'))
		const edited = [...wordsOf('A brand new opening sentence goes here for this rehearsal.'), ...script]
		expect(edited[resolveAnchor(anchor, edited)]).toBe('Canada')
	})

	test('case and accents never count as an edit', () => {
		const anchor = makeAnchor(wordsOf('você foi para o Canadá com a família'), 4)
		expect(resolveAnchor(anchor, wordsOf('voce foi para o canada com a familia'))).toBe(4)
	})

	test('words that are gone fall back to the same share of the script', () => {
		const anchor = makeAnchor(script, Math.floor(script.length / 2))
		const other = Array.from({ length: 100 }, (_, i) => `other${i}`)
		const landed = resolveAnchor(anchor, other)
		expect(landed).toBeGreaterThan(40)
		expect(landed).toBeLessThan(60)
	})
})

describe('alignment', () => {
	test('one edit of any size maps both sides', () => {
		const added = Array.from({ length: 2000 }, (_, i) => `new${i}`)
		const to = [...script.slice(0, 5), ...added, ...script.slice(5)]
		const map = alignWords(script, to)
		expect(map[4]).toBe(4)
		expect(to[map[10]]).toBe(script[10])
	})

	test('a deleted word lands on the nearest surviving word before it', () => {
		const to = script.filter((_, i) => i !== 10)
		const map = alignWords(script, to)
		expect(map[10]).toBe(-1)
		expect(mapWordIndex(map, 10, to.length)).toBe(9)
	})

	test('a repeated word cannot pull it off course', () => {
		const from = wordsOf('the cat sat on the mat and the dog ran')
		const to = wordsOf('the cat really sat on the mat and the dog ran')
		const map = alignWords(from, to)
		expect(to[map[from.indexOf('dog')]]).toBe('dog')
		expect(map[3]).toBe(4)
	})
})

describe('position memory', () => {
	const anchorAt = (i: number) => makeAnchor(script, i)

	test('restart: a saved position loads from settings data, not memory', () => {
		expect(DEFAULT_SETTINGS.notePositions).toEqual({})
		const saved: NotePositions = {}
		rememberPosition(saved, 'a.md', anchorAt(indexOf('Canada')), 1)
		const reloaded = validPositions(JSON.parse(JSON.stringify(saved)))
		expect(script[resolveAnchor(reloaded['a.md'], script)]).toBe('Canada')
		const main = readFileSync(join(import.meta.dir, 'main.ts'), 'utf8')
		expect(main).toContain('validPositions(s.notePositions)')
	})

	test('restart: a script read to its end, or never started, keeps no position', () => {
		const saved: NotePositions = {}
		rememberPosition(saved, 'a.md', anchorAt(script.length - 1), 1)
		rememberPosition(saved, 'b.md', anchorAt(0), 1)
		expect(saved).toEqual({})
		rememberPosition(saved, 'c.md', anchorAt(10), 1)
		rememberPosition(saved, 'c.md', anchorAt(script.length - 1), 2)
		expect(saved['c.md']).toBeUndefined()
	})

	test('record holds words and an index, never a pixel, and a rename keeps it', () => {
		const saved: NotePositions = {}
		rememberPosition(saved, 'old/a.md', anchorAt(10), 1)
		expect(Object.keys(saved['old/a.md']).sort()).toEqual(
			['context', 'contextStart', 'fraction', 'savedAt', 'wordIndex']
		)
		expect(renamePosition(saved, 'old/a.md', 'new/b.md')).toBe(true)
		expect(saved['old/a.md']).toBeUndefined()
		expect(saved['new/b.md'].wordIndex).toBe(10)
		expect(renamePosition(saved, 'missing.md', 'x.md')).toBe(false)
		expect(renamePosition(saved, 'new', 'renamed/folder')).toBe(true)
		expect(saved['renamed/folder/b.md'].wordIndex).toBe(10)
		expect(renamePosition(saved, 'renamed/fol', 'other')).toBe(false)
	})

	test('bounds: past-end clamps, the cap holds, deleted notes drop, junk is refused', () => {
		const anchor = anchorAt(script.length - 2)
		expect(resolveAnchor(anchor, script.slice(0, 5))).toBeLessThanOrEqual(4)

		const saved: NotePositions = {}
		for (let i = 0; i < MAX_REMEMBERED_POSITIONS + 10; i++) rememberPosition(saved, `${i}.md`, anchorAt(10), i)
		expect(Object.keys(saved).length).toBe(200)
		expect(saved['0.md']).toBeUndefined()
		expect(saved[`${MAX_REMEMBERED_POSITIONS + 9}.md`]).toBeDefined()

		expect(forgetPosition(saved, '100.md')).toBe(true)
		expect(saved['100.md']).toBeUndefined()

		expect(validPositions('nope')).toEqual({})
		expect(validPositions([1])).toEqual({})
		expect(validPositions({ 'a.md': { wordIndex: 'x' }, 'b.md': null })).toEqual({})
	})
})

describe('source line', () => {
	test('a rendered word finds its own line, not the first copy of the word', () => {
		const content = '# Intro\n\nthe first line\n\nsecond **line** with a [link](http://x.io/y)\n\nthe third line'
		const rendered = wordsOf('Intro the first line second line with a link the third line')
		const thirdThe = rendered.lastIndexOf('the')
		expect(sourceLineOfWord(rendered, thirdThe, content)).toBe(6)
		expect(sourceLineOfWord(rendered, rendered.indexOf('second'), content)).toBe(4)
		expect(sourceLineOfWord([], 0, content)).toBe(-1)
	})
})

describe('long scripts and big rewrites', () => {
	const long = Array.from({ length: 4000 }, (_, i) => `word${(i * 7919) % 3989}`)

	test('an anchor deep in a long script lands exactly after an edit above it', () => {
		const anchor = makeAnchor(long, 3000)
		const edited = ['added', 'words', 'at', 'the', 'top', ...long]
		expect(resolveAnchor(anchor, edited)).toBe(3005)
	})

	test('rewriting a whole long note does not freeze the prompter', () => {
		const rewritten = long.map((_, i) => `other${i}`)
		const started = performance.now()
		alignWords(long, rewritten)
		expect(performance.now() - started).toBeLessThan(250)
	})
})

describe('two windows', () => {
	test('a view behind a floating window records no position', () => {
		const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
		const save = app.slice(app.indexOf('function saveNotePosition'), app.indexOf('function placeAgainAfterLateContent'))
		expect(save).toContain('!isFloating && plugin.floatingSession.active')
		expect(app).toContain('anchor: currentPassageAnchor()')
	})
})
