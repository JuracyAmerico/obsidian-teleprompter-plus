import { afterEach, describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { INTERVIEW_SCRIPT } from './fixtures/interview-script'
import { createHarness, type Harness } from './fixtures/service-harness'
import type { VoiceReadingMove } from './types'

void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')

/**
 * Takes are timed against the reader's place (takes.ts), so the service reports that place on every
 * commit. onWordMatch is not enough: it fires only when the scroll target moves to a new line, and
 * the harness has no word spans, so it never fires here at all, while every commit is still a place.
 */
let harness: Harness
afterEach(() => harness?.restore())

function recordMoves(target: Harness): VoiceReadingMove[] {
	const moves: VoiceReadingMove[] = []
	target.service.onReadingMove = move => moves.push(move)
	return moves
}

describe('the reader\'s place is reported on every commit', () => {
	test('reading on, word by word: each committed word is reported with the script length', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		const moves = recordMoves(harness)
		const scrolls: number[] = []
		harness.service.onWordMatch = index => scrolls.push(index)
		const words = 'Thanks for having me today I want to tell you'.split(' ')
		for (let n = 3; n <= words.length; n++) {
			harness.advance(700)
			harness.hear(words.slice(0, n).join(' '))
		}
		expect(moves.length).toBeGreaterThan(1)
		expect(moves.at(-1)?.wordIndex).toBe(harness.service.getCurrentWordIndex())
		expect(moves.at(-1)?.wordIndex).toBe(harness.at('you'))
		// Forward only while reading on, and every move carries the length and (here) no span.
		for (let i = 1; i < moves.length; i++) expect(moves[i].wordIndex).toBeGreaterThan(moves[i - 1].wordIndex)
		expect(moves.every(move => move.totalWords === harness.words.length && move.span === null)).toBe(true)
		expect(scrolls).toEqual([])
	})

	test('a re-sync reports where it lands', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		const moves = recordMoves(harness)
		harness.internals.currentWordIndex = 3
		harness.service.forceResync()
		harness.hear('I spent seven years as a Solutions Engineer at Tableau in Brazil', true)
		expect(moves.map(move => move.wordIndex)).toEqual([harness.at('Brazil')])
	})
})
