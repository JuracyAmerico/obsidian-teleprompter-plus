import { afterEach, describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { createHarness, type Harness } from './fixtures/service-harness'
import { findNextPosition } from './speech-matcher'
import type { TextElement } from './types'
import { tokenizeWords } from './word-tokenizer'

void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')

/**
 * Readers pass over headings: a section number, a title, the interviewer's question they rehearse the
 * answer to. Measured on the 2026-10-30 and 2026-11-27 rehearsals, that is where most of the place's lag
 * of 6 to 20 words came from: it waited behind every heading for a whole tail of new words.
 */
const SCRIPT = 'and straight from the feedback in this room. ## 2 Who is watching Canada ## First the visual you asked for, who is watching Canada'
const HEADING = ['2', 'Who', 'is', 'watching', 'Canada']

/** The script's words, the five after the first "room" flagged as a heading the way the app flags them. */
function withHeading(flag = true): TextElement[] {
	const words = tokenizeWords(SCRIPT)
	const room = words.findIndex(w => w.value === 'room')
	return words.map((w, i) => (flag && i > room && i <= room + HEADING.length ? { ...w, heading: true } : w))
}

const index = (words: TextElement[], value: string): number => words.findIndex(w => w.value === value)

describe('the matcher lets a reader pass over a heading', () => {
	test('the first word after a heading finds the reader there', () => {
		const words = withHeading()
		expect(findNextPosition('the feedback in this room first', words, index(words, 'room'))).toBe(index(words, 'First'))
	})

	test('without the heading flags the same words wait behind the heading', () => {
		const words = withHeading(false)
		expect(findNextPosition('the feedback in this room first', words, index(words, 'room'))).toBe(index(words, 'room'))
	})

	test('a heading never lets the place run ahead of the voice', () => {
		const words = withHeading()
		const room = index(words, 'room')
		expect(findNextPosition('straight from the feedback in this room', words, room - 2)).toBe(room)
	})

	test('a reader who reads the heading aloud is followed through it', () => {
		const words = withHeading()
		const canada = words.findIndex((w, i) => i > index(words, 'room') && w.value === 'Canada')
		expect(findNextPosition('in this room two who is watching canada', words, index(words, 'room'))).toBe(canada)
	})
})

let harness: Harness
afterEach(() => harness?.restore())

describe('the service counts a heading passed over as one step', () => {
	test('the first word of the next section commits at once, without waiting for confirmation', () => {
		harness = createHarness(VoiceTrackingService, SCRIPT)
		harness.internals.wordTokens = withHeading()
		harness.internals.currentWordIndex = harness.at('room')
		harness.hear('the feedback in this room first')
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('First'))
	})

	test('the same distance through words the reader has to say still needs a second partial to agree', () => {
		harness = createHarness(VoiceTrackingService, SCRIPT)
		harness.internals.wordTokens = withHeading(false)
		harness.internals.currentWordIndex = harness.at('room')
		harness.hear('this room two who is watching canada first')
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('room'))
		harness.advance(600)
		harness.hear('this room two who is watching canada first the')
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('the', harness.at('First')))
	})
})

describe('distance to a place past a heading counts the words the reader says', () => {
	// The 2026-11-27 rehearsal: an answer ends, the next question is a heading, the answer begins with "I".
	const words = tokenizeWords("My permit is in process. I don't need sponsorship. Location where are you hybrid ok. I'm based in Ontario.")
		.map((w, i, all) => {
			const location = all.findIndex(x => x.value === 'Location')
			return i >= location && i < location + 6 ? { ...w, heading: true } : w
		})

	test('one new word after the heading moves the place there, not a short word left over as noise', () => {
		const sponsorship = index(words, 'sponsorship')
		const answer = words.findIndex((w, i) => i > sponsorship && w.value === 'I')
		expect(findNextPosition("is in process I don't need sponsorship I", words, sponsorship)).toBe(answer)
	})
})
