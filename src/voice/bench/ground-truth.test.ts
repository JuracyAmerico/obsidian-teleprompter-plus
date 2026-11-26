import { describe, expect, test } from 'bun:test'
import { BENCH_SAMPLE_EXPECTED, BENCH_SAMPLE_HEARD, BENCH_SAMPLE_SCRIPT } from '../fixtures/bench-sample'
import { groundTruth, lastWordInFinal, placeUnit, splitUtterances } from './ground-truth'
import { renderedScriptWords } from './script-words'
import type { HeardEvent } from './trace'

const heard = (...texts: (string | [string, boolean])[]): HeardEvent[] =>
	texts.map((item, i) => {
		const [text, final] = typeof item === 'string' ? [item, false] : item
		return { t: i * 200, text, final }
	})

describe('splitUtterances', () => {
	test('a growing result stays one utterance; a final, or a fresh short start, opens the next', () => {
		const utterances = splitUtterances(heard(
			'I spent', 'I spent seven', 'In spent seven years', ['I spent seven years as', true],
			'Moving', 'Moving my family',
			'So', 'So have a great',
		))
		expect(utterances.map(u => u.events)).toEqual([[0, 1, 2, 3], [4, 5], [6, 7]])
		expect(utterances[0].final).toEqual(['i', 'spent', 'seven', 'years', 'as'])
	})
})

describe('placeUnit', () => {
	test('finds a misheard passage where it is in the script, and its repeat elsewhere as a second choice', () => {
		const script = 'the team was ready and the team was tired and then the team went home'.split(' ')
		const [best, second] = placeUnit(['then', 'the', 'teen', 'went'], script)
		expect(best.start).toBe(10)
		expect(best.map).toEqual([10, 11, 12, 13])
		expect(second.score).toBeLessThan(best.score)
	})
})

describe('lastWordInFinal', () => {
	const final = 'with a broken spreadsheet that a nurse'.split(' ')

	test('a stutter keeps the word just said, not the next copy of it', () => {
		expect(lastWordInFinal('with a broken a broken'.split(' '), final)).toBe(2)
	})

	test('a word the recognizer later revised maps to its revision', () => {
		expect(lastWordInFinal('at pablo'.split(' '), 'at tableau working'.split(' '))).toBe(1)
		expect(lastWordInFinal('rarely by'.split(' '), 'rarely buy the'.split(' '))).toBe(1)
	})
})

describe('ground truth on a real rehearsal', () => {
	const words = renderedScriptWords(BENCH_SAMPLE_SCRIPT)
	const events = BENCH_SAMPLE_HEARD.map(([t, text, final]) => ({ t, text, final: final === true }))
	const truth = groundTruth(events, words)

	test('the hand-checked sample names real script words', () => {
		expect(BENCH_SAMPLE_EXPECTED.length).toBeGreaterThanOrEqual(30)
		const wrong = BENCH_SAMPLE_EXPECTED.filter(e => words[e.index] !== e.word)
		expect(wrong).toEqual([])
	})

	test('the aligner agrees with every hand-checked position, the restart from line two included', () => {
		const disagreements = BENCH_SAMPLE_EXPECTED
			.map(e => ({ ...e, aligned: truth.positions[e.heard] }))
			.filter(e => e.aligned !== e.index)
		expect(disagreements).toEqual([])
	})

	test('every result of the reading gets a truth; nothing is off-script', () => {
		expect(truth.positions.every(p => p !== null)).toBe(true)
		expect(truth.offScriptUnits).toBe(0)
	})

	test('an aside the reader says off the script gets no truth, and the reading after it does', () => {
		const withAside = [
			...events.slice(0, 30),
			{ t: 9000, text: 'sorry let me grab some water real quick okay', final: true },
			...events.slice(30).map(e => ({ ...e, t: e.t + 4000 })),
		]
		const asideTruth = groundTruth(withAside, words)
		expect(asideTruth.positions[30]).toBeNull()
		expect(asideTruth.positions[31]).toBe(truth.positions[30])
	})
})
