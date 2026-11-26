import { describe, expect, test } from 'bun:test'
import { tokenizeWords } from './word-tokenizer'
import { findNextPosition } from './speech-matcher'
import { normalizeForSpeech } from '../parser/speech-normalizer'

/**
 * Speech recognizers hand back digits ("$759", "30%", "12,380") while a teleprompter script
 * spells numbers out, because that is how a script meant to be read aloud is written. Without
 * normalisation the two never match and tracking stalls on a number-dense passage while the
 * microphone happily keeps listening.
 *
 * Real case, 2026-09-16: script line "Yes. Seven hundred and fifty-nine dollars per farm.",
 * Apple returned "He's the answer yes $759 per farm", and the prompter froze at 49%.
 */
const SCRIPT = `Here is the answer.
Yes. Seven hundred and fifty-nine dollars per farm.
That is a CAC ceiling, the most the company can spend to acquire one customer.`

const reference = tokenizeWords(SCRIPT)
const startIndex = 0

function track(heard: string): number {
	return findNextPosition(heard, reference, startIndex)
}

describe('number-dense speech against a spelled-out script', () => {
	test('raw recognizer output with digits does not reach the spoken number', () => {
		const raw = "He's the answer yes $759 per farm"
		// Baseline: this is the failure being fixed — the digits leave the matcher behind
		// the point the speaker has actually reached ("dollars per farm" is index 11+).
		expect(track(raw)).toBeLessThan(10)
	})

	test('reading the passage aloud: digits hold the place behind the number, normalised speech keeps up through it', () => {
		// Partial transcripts as a recognizer emits them while the line is being read.
		const partials = [
			'here is the answer',
			'here is the answer yes',
			'the answer yes $759',
			'yes $759 per farm',
			'$759 per farm that is',
			'per farm that is a CAC ceiling',
			'that is a CAC ceiling the most',
			'a CAC ceiling the most the company can spend',
			'the company can spend to acquire one customer',
		]
		const follow = (normalise: boolean, count = partials.length) => partials.slice(0, count).reduce(
			(index, partial) => findNextPosition(normalise ? normalizeForSpeech(partial) : partial, reference, index),
			0,
		)

		const total = reference.length
		const dollars = reference.findIndex(t => t.value === 'dollars')
		// While "$759" is being said (partial 3), raw digits leave the place on "Yes", before the number...
		expect(follow(false, 3)).toBeLessThan(dollars - 3)
		// ...and normalised speech is already on the spoken number.
		expect(follow(true, 3)).toBe(dollars)
		// The tail-aligned matcher picks raw speech up again after the number; normalised follows to the end.
		expect(follow(true)).toBeGreaterThan(total - 3)
	})

	test('percentages and thousands separators normalise into script form', () => {
		expect(normalizeForSpeech('we saw 30% adoption')).toBe('we saw thirty percent adoption')
		expect(normalizeForSpeech('12,380 farms')).toBe('twelve thousand three hundred eighty farms')
		expect(normalizeForSpeech('the total is 6.6 billion')).toBe('the total is six point six billion')
	})

	test('plain speech with no numbers is passed through untouched', () => {
		const plain = 'that is a CAC ceiling the most the company can spend'
		expect(normalizeForSpeech(plain)).toBe(plain)
	})

	test('timestamps and codes are left alone — they are not spoken numbers', () => {
		expect(normalizeForSpeech('at 2:24 today')).toBe('at 2:24 today')
		expect(normalizeForSpeech('table 32-10-0231')).toBe('table 32-10-0231')
	})
})
