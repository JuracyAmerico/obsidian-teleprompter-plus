import { afterEach, describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { INTERVIEW_SCRIPT } from './fixtures/interview-script'
import { createHarness, type Harness } from './fixtures/service-harness'
import { NON_NATIVE_READER, measureGap, simulateReader, type GapReport, type ReaderOptions } from './fixtures/reader-sim'

// The voice modules import Obsidian runtime values; the tests need none of them.
void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')
const { presetToTuning } = await import('./preset-apply')
const { VOICE_TRACKING_PRESETS } = await import('../settings')

/**
 * How far the place trails a Brazilian reader of English (2.4 words a second, a pause at each full
 * stop, every seventh word heard with an accent) through the whole interview script, per pace preset.
 * "Conservative" says it is the one for non-native speakers, so it must not trail more than "Balanced".
 *
 * Measured before this change, on the same reader: Conservative lost the reader for good (mean 79
 * words behind, ending at word 190 of 394); Balanced trailed 48 words on average.
 */
let harness: Harness
afterEach(() => harness?.restore())

const PRESETS = ['conservative', 'balanced', 'responsive', 'rehearsal'] as const
type Preset = (typeof PRESETS)[number]

/** The same reader, who also paraphrases every fourth word and says something off-script after every second sentence. */
const PARAPHRASING_READER: ReaderOptions = { ...NON_NATIVE_READER, paraphraseEvery: 4, asideEverySentences: 2 }

function gapFor(preset: Preset, reader: ReaderOptions = NON_NATIVE_READER, override: { updateFrequencyMs?: number } = {}): GapReport & { preset: Preset } {
	harness = createHarness(VoiceTrackingService, INTERVIEW_SCRIPT, { ...presetToTuning(VOICE_TRACKING_PRESETS[preset]), ...override })
	const timeline = simulateReader(INTERVIEW_SCRIPT, reader)
	const report = measureGap(timeline, harness.hear, harness.advance, () => harness.service.getCurrentWordIndex())
	harness.restore()
	return { preset, ...report }
}

describe('gap behind a non-native reader, per preset', () => {
	test('Conservative ("for non-native speakers") trails no more than Balanced', () => {
		const balanced = gapFor('balanced')
		const conservative = gapFor('conservative')
		expect(conservative.meanGap).toBeLessThanOrEqual(balanced.meanGap)
		expect(conservative.maxGap).toBeLessThanOrEqual(balanced.maxGap)
	})

	test('Conservative\'s slower update rate (600 ms against 500) does not widen the gap', () => {
		const at500 = gapFor('conservative', NON_NATIVE_READER, { updateFrequencyMs: VOICE_TRACKING_PRESETS.balanced.updateFrequencyMs })
		const at600 = gapFor('conservative')
		expect(VOICE_TRACKING_PRESETS.conservative.updateFrequencyMs).toBeGreaterThan(VOICE_TRACKING_PRESETS.balanced.updateFrequencyMs)
		expect(at600.meanGap).toBeLessThanOrEqual(at500.meanGap)
		expect(at600.maxGap).toBeLessThanOrEqual(at500.maxGap)
	})

	test('every preset follows the reader to the last word', () => {
		const missed = PRESETS.map(p => gapFor(p)).filter(r => r.finalIndex !== r.lastWord)
		expect(missed).toEqual([])
	})

	test('every preset trails by about the recognizer latency: 1.5 words on average, never more than 6, never ahead', () => {
		const off = PRESETS.map(p => gapFor(p)).filter(r => r.meanGap > 1.5 || r.maxGap > 6 || r.maxAhead > 0)
		expect(off).toEqual([])
	})

	test('a reader who paraphrases and talks off-script is followed to the end and never overtaken', () => {
		// This reader paraphrases the script's last word, so the end is the word before it
		const off = PRESETS.map(p => gapFor(p, PARAPHRASING_READER))
			.filter(r => r.finalIndex < r.lastWord - 1 || r.meanGap > 1.5 || r.maxGap > 8 || r.maxAhead > 0)
		expect(off).toEqual([])
	})
})
