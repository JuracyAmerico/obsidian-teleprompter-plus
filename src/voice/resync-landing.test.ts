import { afterEach, describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { INTERVIEW_SCRIPT } from './fixtures/interview-script'
import { createHarness, type Harness } from './fixtures/service-harness'

// The voice modules import Obsidian runtime values; the tests need none of them.
void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')

/**
 * A re-sync finds the reader by what they just said, so it must put the place on the LAST word they
 * said. Landing on the first one leaves the highlight a whole utterance behind the voice, and the
 * forward-only matcher then has to crawl back up to it.
 */
let harness: Harness
afterEach(() => harness?.restore())

describe('re-sync lands at the last heard word', () => {
	test('R (forceResync) commits the last word of the utterance, not its first', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		harness.internals.currentWordIndex = 3
		harness.service.forceResync()
		harness.hear('I spent seven years as a Solutions Engineer at Tableau in Brazil', true)
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('Brazil'))
	})

	test('stall recovery commits the last heard word once the far match is confirmed', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		harness.internals.currentWordIndex = 2
		const sentence = 'Most of my customers were state and federal health agencies and most of them had more data than they could read'.split(' ')
		// The reader has run ~40 words past the place, beyond the local look-ahead. Partials grow
		// word by word; after three without forward progress the service re-syncs.
		for (let n = 6; n <= sentence.length; n++) {
			harness.advance(700)
			harness.hear(sentence.slice(0, n).join(' '))
		}
		harness.advance(700)
		harness.hear(sentence.join(' '), true)
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('read'))
	})

	test('stall recovery takes the nearer of two nearby copies of what was heard', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		// "...the problem they actually have. That is where the real work starts, and that is where I have done..."
		harness.internals.currentWordIndex = harness.at('have', harness.at('actually'))
		harness.internals.needsGlobalSearch = true // three partials without progress armed a re-sync
		harness.hear('That is where', true)
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('where', harness.at('actually')))
	})

	test('the first words of a session land on the last one heard', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		harness.internals.needsGlobalSearch = true
		harness.hear('Thanks for having me today I want to tell you', true)
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('you'))
	})
})
