import { afterEach, describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { INTERVIEW_SCRIPT } from './fixtures/interview-script'
import { createHarness, type Harness } from './fixtures/service-harness'

// The voice modules import Obsidian runtime values; the tests need none of them.
void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')

/**
 * Partials that arrived inside the throttle window used to be thrown away. When the reader then
 * stopped, the words they said last were never matched, and the place sat behind them for the whole
 * pause. Now a partial with a new word is matched at once, and one that only revises words already
 * matched is held and matched when the window ends.
 */
let harness: Harness
afterEach(() => harness?.restore())

describe('partials inside the throttle window', () => {
	test('the newest held partial is processed when the window ends', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT, { updateFrequencyMs: 500 })
		harness.hear('Thanks for having me')
		harness.advance(100)
		harness.hear('Thanks for having me to') // the recognizer's first guess at the new word
		const guessed = harness.service.getCurrentWordIndex()
		expect(guessed).not.toBe(harness.at('today'))
		harness.advance(100)
		harness.hear('Thanks for having me today') // its revision: same words, nothing new to say yet
		harness.advance(100)
		// Still inside the window that began with the last matched partial: the revision is held
		expect(harness.service.getCurrentWordIndex()).toBe(guessed)

		harness.advance(300) // that window ends 500 ms after the partial it began with
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('today'))
	})

	test('a partial with a new word is matched at once, even inside the window', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT, { updateFrequencyMs: 600 })
		harness.hear('Thanks for having')
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('having'))
		harness.advance(150)
		harness.hear('Thanks for having me')
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('me'))
		harness.advance(150)
		harness.hear('Thanks for having me today')
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('today'))
	})

	test('a final supersedes the held partial, so nothing is matched twice or late', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT, { updateFrequencyMs: 500 })
		harness.hear('Thanks for having')
		harness.advance(100)
		harness.hear('Thanks for halving') // a revision: held
		harness.hear('Thanks for having me today', true) // the final is matched now
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('today'))
		harness.internals.currentWordIndex = 0 // if the stale held partial ran later, it would move the place
		harness.advance(1000)
		expect(harness.service.getCurrentWordIndex()).toBe(0)
	})

	test('stop() drops a held partial', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT, { updateFrequencyMs: 500 })
		harness.hear('Thanks for having')
		harness.advance(100)
		harness.internals.currentWordIndex = 0
		harness.hear('Thanks for having') // a re-send: held
		harness.service.stop()
		harness.advance(1000)
		expect(harness.service.getCurrentWordIndex()).toBe(0)
	})
})
