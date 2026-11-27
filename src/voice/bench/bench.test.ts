import { describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../../test-support/obsidian-stub'
import { BENCH_SAMPLE_HEARD, BENCH_SAMPLE_SCRIPT } from '../fixtures/bench-sample'
import { renderedScript } from './script-words'
import type { TraceSession } from './trace'

void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('../voice-tracking-service')
const { presetToTuning } = await import('../preset-apply')
const { VOICE_TRACKING_PRESETS } = await import('../../settings')
const { scoreSession } = await import('./bench')

/**
 * The current matcher on the committed real rehearsal (fixtures/bench-sample.ts), with the Rehearsal
 * preset Américo uses, measured on 0.12.13: 182 updates, lag p50 0 and p95 1 word, 12 updates more
 * than 5 words off (all of them the restart from line two, where the place stays ahead on "polite" for
 * about three seconds), no stall, both re-syncs recovered (2.6 s and 1.0 s of speech).
 *
 * A matcher change that makes the place trail the voice more fails on lag p95; one that leaves it
 * wrong more often, ahead or behind, fails on the off-by-more-than-5 count. A change that improves
 * either should lower these numbers here.
 */
const BASELINE = { updates: 182, lagP95: 1, offOver5Updates: 12 }

function benchSample() {
	const heard = BENCH_SAMPLE_HEARD.map(([t, text, final]) => ({ t, text, final: final === true }))
	const session: TraceSession = {
		id: 'bench-sample',
		file: 'bench-sample.ts',
		view: 'sample',
		start: 0,
		end: heard[heard.length - 1].t,
		script: null,
		continued: false,
		heard,
		matches: [],
		rereads: [],
	}
	const { words, headings } = renderedScript(BENCH_SAMPLE_SCRIPT)
	const resolution = {
		ok: true as const,
		words,
		headings,
		origin: 'trace word list' as const,
		language: 'en-US',
		check: { compared: 0, agreement: 1, tracedCount: words.length },
	}
	return scoreSession(VoiceTrackingService, session, resolution, presetToTuning(VOICE_TRACKING_PRESETS.rehearsal))
}

describe('voice benchmark on the committed real rehearsal', () => {
	const report = benchSample()

	test('scores every update of the reading (the ground truth, not the matcher, sets this count)', () => {
		expect(report.truthCoverage).toBe(1)
		expect(report.metrics.updates).toBe(BASELINE.updates)
	})

	test('lag p95 is no worse than measured on 0.12.13', () => {
		expect(report.metrics.lagP95).toBeLessThanOrEqual(BASELINE.lagP95)
	})

	test('no more updates are over 5 words off than measured on 0.12.13', () => {
		const off = Math.round(report.metrics.offOver5 * report.metrics.updates)
		expect(off).toBeLessThanOrEqual(BASELINE.offOver5Updates)
	})

	test('a replay is deterministic: the same reading scores the same twice', () => {
		expect(benchSample().metrics).toEqual(report.metrics)
	})
})
