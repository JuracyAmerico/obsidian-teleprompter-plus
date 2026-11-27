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

describe('the trace records the page a wide re-sync searched around', () => {
	test('a session that starts on a scrolled-to section traces that page, so a replay starts there', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		const events: { event: string; data: Record<string, unknown> }[] = []
		harness.service.onDiagnostic = (event, data) => events.push({ event, data })
		const page = harness.at('Brazil')
		harness.internals.estimateWordIndexFromScroll = () => page
		harness.internals.needsGlobalSearch = true
		harness.hear('Most of my customers were state and federal health agencies', true)
		const matches = events.filter(e => e.event === 'match').map(e => e.data)
		expect(matches[0]).toMatchObject({ global: true, page })
	})

	test('an ordinary forward match carries no page', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		const events: { event: string; data: Record<string, unknown> }[] = []
		harness.service.onDiagnostic = (event, data) => events.push({ event, data })
		harness.internals.needsGlobalSearch = false
		harness.hear('Thanks for having me today', true)
		const match = events.find(e => e.event === 'match')?.data
		expect(match).toBeDefined()
		expect(match && 'page' in match).toBe(false)
	})
})

describe('the first find of a session commits at once', () => {
	const sentence = 'Most of my customers were state and federal health agencies'

	test('a reader who starts forty words into the page is placed by the first confident find', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		harness.internals.needsGlobalSearch = true // the microphone just came on: nothing placed yet
		harness.hear(sentence)
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('agencies'))
	})

	test('once the reader was placed, a far re-sync still waits for a second find to agree', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		harness.service.seekToWord(2) // placed: the reader chose this word
		harness.internals.needsGlobalSearch = true // three partials without progress armed a re-sync
		harness.hear(sentence)
		expect(harness.service.getCurrentWordIndex()).toBe(2)
		harness.advance(500)
		harness.hear(`${sentence} and`)
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('and', harness.at('agencies')))
	})

	test('stopping the microphone forgets the placement, so the next session is placed at once again', () => {
		harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT)
		harness.service.seekToWord(2)
		harness.service.stop()
		harness.hear(sentence)
		expect(harness.service.getCurrentWordIndex()).toBe(harness.at('agencies'))
	})
})
