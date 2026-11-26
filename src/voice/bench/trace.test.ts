import { describe, expect, test } from 'bun:test'
import { readTraceSessions } from './trace'
import { externalMoves } from './replay'

const line = (t: number, view: string, type: string, data: Record<string, unknown> = {}): string =>
	JSON.stringify({ t: new Date(Date.UTC(2026, 10, 26, 15, 0, 0, t)).toISOString(), view, type, ...data })

describe('readTraceSessions', () => {
	test('splits per view at the microphone going off and at script loads, carrying the script', () => {
		const text = [
			line(0, 'a', 'init', { contentChars: 10, incomingWords: 2, script: 'Hello there', scriptHash: 'h1' }),
			line(1, 'a', 'wrapped', { words: 2, wordList: 'Hello there', wordsHash: 'w1' }),
			line(2, 'a', 'status', { status: 'listening' }),
			line(3, 'a', 'heard', { final: false, text: 'Hello' }),
			line(4, 'b', 'heard', { final: false, text: 'Other view' }),
			line(5, 'a', 'heard', { final: false, text: 'Hello there' }),
			line(6, 'a', 'match', { cur: 0, curWord: 'Hello', proposed: 1, proposedWord: 'there', global: false, total: 2 }),
			line(7, 'a', 'status', { status: 'off' }),
			line(8, 'a', 'heard', { final: true, text: 'Again' }),
			'not json',
		].join('\n')
		const sessions = readTraceSessions([{ file: 't.jsonl', text }])
		const ofA = sessions.filter(s => s.view === 'a')
		expect(ofA.map(s => s.heard.map(h => h.text))).toEqual([['Hello', 'Hello there'], ['Again']])
		expect(ofA[0].script).toMatchObject({ script: 'Hello there', wordList: 'Hello there', wrappedWords: 2, scriptHash: 'h1' })
		expect(ofA[0].matches.map(m => [m.heardIndex, m.cur, m.proposed, m.total])).toEqual([[1, 0, 1, 2]])
		expect(ofA[0].continued).toBe(false)
		expect(sessions.find(s => s.view === 'b')?.script).toBeNull()
	})

	test('a view that loads its script in one file and listens in the next is one stream', () => {
		const first = line(0, 'a', 'init', { contentChars: 5, incomingWords: 1 })
		const second = line(10, 'a', 'heard', { final: false, text: 'Hello' })
		const [session] = readTraceSessions([{ file: 'new.jsonl', text: second }, { file: 'old.jsonl', text: first }])
		expect(session.script).toMatchObject({ contentChars: 5, incomingWords: 1 })
		expect(session.file).toBe('new.jsonl')
	})

	test('a re-wrap while listening (an edit) starts a session that carries the place over', () => {
		const text = [
			line(0, 'a', 'init', {}),
			line(1, 'a', 'wrapped', { words: 3 }),
			line(2, 'a', 'heard', { final: false, text: 'one' }),
			line(3, 'a', 'wrapped', { words: 4 }),
			line(4, 'a', 'heard', { final: false, text: 'two' }),
		].join('\n')
		const sessions = readTraceSessions([{ file: 't', text }])
		expect(sessions.map(s => [s.continued, s.script?.wrappedWords])).toEqual([[false, 3], [true, 4]])
	})
})

describe('externalMoves', () => {
	const heard = [0, 100, 200, 300].map(t => ({ t, text: 'x y z', final: false }))
	const match = (t: number, heardIndex: number, cur: number, proposed: number) =>
		({ t, heardIndex, cur, curWord: '?', proposed, proposedWord: '?', global: false, total: 500 })

	test('a place the matcher never proposed is a move the reader made; the matcher\'s own range is not', () => {
		const moves = externalMoves(heard, [
			match(0, 0, 40, 42),   // the session starts where the page was: an anchor
			match(100, 1, 42, 45), // within the last decision's range
			match(200, 2, 300, 301), // a section jump the reader made
			match(300, 3, 120, 121), // back to a re-read the app committed: not a move
		], [{ t: 250, to: 120 }])
		expect(moves).toEqual([
			{ t: 0, to: 40, anchor: true },
			{ t: 200, to: 300, anchor: false },
		])
	})
})
