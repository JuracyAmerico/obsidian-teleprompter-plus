import { describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'

// The voice modules import Obsidian runtime values; the tests need none of them.
void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')
const { applyPresetLive, presetToTuning } = await import('./preset-apply')
const { VOICE_TRACKING_PRESETS } = await import('../settings')

type Calls = { stop: number; start: number; initialize: number; dispose: number }

function fakeRecognizer(calls: Calls) {
	return {
		onResult: () => {},
		onStatus: () => {},
		onError: () => {},
		onProgress: () => {},
		updateGrammar: () => {},
		getIsInitialized: () => true,
		getIsListening: () => true,
		stop: () => { calls.stop++ },
		start: async () => { calls.start++ },
		initialize: async () => { calls.initialize++ },
		dispose: () => { calls.dispose++ },
	}
}

type Internals = { currentWordIndex: number; wordTokens: unknown[]; config: Record<string, unknown> }

function liveService() {
	const calls: Calls = { stop: 0, start: 0, initialize: 0, dispose: 0 }
	const service = new VoiceTrackingService(
		{ engine: 'vosk', language: 'en-US', confidenceThreshold: 0.25, windowSize: 4 },
		fakeRecognizer(calls) as never,
	)
	const internals = service as unknown as Internals
	internals.currentWordIndex = 137
	internals.wordTokens = Array.from({ length: 842 }, (_, i) => ({ type: 'TOKEN', value: `w${i}` }))
	return { service, internals, calls }
}

describe('applying a pace preset to a live service', () => {
	test('no restart: recognizer is neither stopped nor started', () => {
		const { service, calls } = liveService()
		applyPresetLive(service, 'rehearsal')
		expect(calls.stop).toBe(0)
		expect(calls.start).toBe(0)
		expect(calls.dispose).toBe(0)
	})

	test('keeps position: currentWordIndex is unchanged', () => {
		const { service, internals } = liveService()
		applyPresetLive(service, 'responsive')
		expect(internals.currentWordIndex).toBe(137)
	})

	test('keeps words: tokenized word count is unchanged', () => {
		const { service, internals } = liveService()
		applyPresetLive(service, 'conservative')
		expect(internals.wordTokens.length).toBe(842)
	})

	test('the preset tuning lands in the service config', () => {
		const { service, internals } = liveService()
		applyPresetLive(service, 'rehearsal')
		const expected = presetToTuning(VOICE_TRACKING_PRESETS.rehearsal)
		for (const [key, value] of Object.entries(expected)) {
			expect(internals.config[key]).toBe(value)
		}
	})
})
