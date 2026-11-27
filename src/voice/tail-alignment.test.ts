import { describe, expect, test } from 'bun:test'
import { findNextPosition } from './speech-matcher'
import { tokenizeWords } from './word-tokenizer'
import { INTERVIEW_SCRIPT } from './fixtures/interview-script'

/**
 * Local matching must find the reader by the LAST words heard, wherever in the look-ahead they are.
 * The old matcher compared those words with a prefix that always began at the current place, so every
 * word between the place and the voice counted as an edit and a reader a few words ahead was lost.
 */
const script = tokenizeWords(INTERVIEW_SCRIPT)
const at = (word: string, from = 0) => script.findIndex((t, i) => i >= from && t.value === word)

/** What a recognizer hands over: the utterance so far, from a few words behind the place up to the voice. */
function heardUpTo(end: number, lowercase = false): string {
	const text = script.slice(Math.max(0, end - 11), end + 1).map(t => t.value).join(' ')
	return lowercase ? text.toLowerCase() : text
}

/** Every sampled place in the script where the matcher did not land on the word just heard. */
function missesWhenAhead(ahead: number, lowercase = false): string[] {
	const misses: string[] = []
	for (let place = 12; place + ahead < script.length; place += 5) {
		const truth = place + ahead
		const found = findNextPosition(heardUpTo(truth, lowercase), script, place)
		if (found !== truth) misses.push(`at ${place} "${script[place].value}": wanted ${truth} "${script[truth].value}", got ${found} "${script[found]?.value}"`)
	}
	return misses
}

describe('tail-aligned local matching on a real-sized script', () => {
	test('the script is real-sized', () => {
		expect(script.length).toBeGreaterThan(350)
	})

	test('reader 2 words ahead is found everywhere in the script', () => {
		expect(missesWhenAhead(2)).toEqual([])
	})

	test('reader 5 words ahead is found everywhere in the script', () => {
		expect(missesWhenAhead(5)).toEqual([])
	})

	test('reader 8 words ahead is found everywhere in the script', () => {
		expect(missesWhenAhead(8)).toEqual([])
	})

	test('case never counts: a lowercase recognizer (Vosk) is found 8 words ahead', () => {
		expect(missesWhenAhead(8, true)).toEqual([])
	})

	test('a repeated phrase prefers the nearer occurrence', () => {
		const words = tokenizeWords('we will grow the team this year and then we will grow the team again next year with new people')
		expect(findNextPosition('so we will grow the team', words, 0)).toBe(4)
		// On the real script: "that is where" occurs twice in one sentence; the reader is on the first
		const first = at('where', at('presales'))
		const place = first - 4
		expect(findNextPosition('the problem they actually have that is where', script, place)).toBe(first)
	})

	test('a repeated phrase: once past the first copy, the second one is found', () => {
		const words = tokenizeWords('we will grow the team this year and then we will grow the team again next year with new people')
		expect(findNextPosition('this year and then we will grow the team', words, 8)).toBe(13)
	})

	test('a repeated phrase heard right after the first copy holds until one more word tells them apart', () => {
		const words = tokenizeWords('we will grow the team this year and then we will grow the team again next year with new people')
		// Five identical words: re-heard copy one, or copy two? Holding is the safe answer...
		expect(findNextPosition('this year and then we will grow the team', words, 5)).toBe(5)
		// ...and the next word settles it
		expect(findNextPosition('this year and then we will grow the team again', words, 5)).toBe(14)
	})

	test('accent substitutions are tolerated: "tablo", "brasil", "costumers"', () => {
		const brazil = at('Brazil')
		expect(findNextPosition('I spent seven years as a solutions engineer at tablo in brasil', script, brazil - 8)).toBe(brazil)
		const were = at('were')
		expect(findNextPosition('in brasil most of my costumers were', script, were - 5)).toBe(were)
	})

	test('speech that is not in the script does not move the place', () => {
		const place = at('discovery')
		expect(findNextPosition('sorry let me grab some water real quick', script, place)).toBe(place)
	})

	test('a stale partial for words already read does not move the place', () => {
		const place = at('discovery')
		expect(findNextPosition('that changed how I run discovery', script, place)).toBe(place)
	})
})

describe('a long forward move needs support from what was heard', () => {
	// The 2026-11-27 rehearsal: re-reading an answer from twenty words back, the reader says "Yes I'm".
	const words = tokenizeWords(
		"Yes I'm authorized to work full-time in Canada for any employer. My post-graduation work permit is in " +
		"process. I don't need sponsorship. Location where are you hybrid ok. I'm based in Ontario.",
	)
	const place = words.findIndex((w, i) => w.value === 'I' && words[i + 1]?.value === 'don')

	test('two short words that match a copy twelve words ahead do not move the place', () => {
		expect(findNextPosition("yes I'm am", words, place)).toBe(place)
		expect(findNextPosition("on the scope I'm", words, place)).toBe(place)
	})

	test('the same distance read aloud is followed', () => {
		const based = words.findIndex(w => w.value === 'based')
		expect(findNextPosition("sponsorship location where are you hybrid ok I'm based", words, place)).toBe(based)
	})
})
