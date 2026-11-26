/**
 * Accuracy of a replayed session against its ground truth.
 *
 * An UPDATE is a recognizer result whose text differs from the result before it and that has a ground
 * truth (see ground-truth.ts). At each update the error is truth minus the matcher's place right after
 * the result was handed over: positive means the place trails the voice, negative means it runs ahead.
 *
 * - lag p50 / p95: percentiles of that signed error, in words.
 * - off > 5: share of updates where the place is more than 5 words from the truth, either way.
 * - jumps > 10: moves of the place of more than 10 words in one step, the matcher's own moves only
 *   (a section jump the reader made is not counted); `badJumps` are those that landed more than 5 words
 *   from the truth at the next update.
 * - stalled s/min: between consecutive updates under 3 s apart (the reader is speaking), time during
 *   which the truth advanced, the place did not move, and the place ended more than 3 words behind;
 *   per minute of such speaking time.
 * - recovery: for each re-sync the matcher armed on its own, seconds of speech (gaps between updates
 *   over 3 s are silence and do not count) until the first update within 5 words of the truth.
 *   Re-syncs never recovered before the session ended are counted apart.
 */

export interface SessionMetrics {
	updates: number
	lagP50: number
	lagP95: number
	meanAbsError: number
	offOver5: number
	jumpsOver10: number
	badJumps: number
	speakingSeconds: number
	stalledSeconds: number
	stalledPerMinute: number
	resyncs: number
	recoverySeconds: number[]
	unrecoveredResyncs: number
}

export interface UpdateSample {
	t: number
	truth: number
	position: number
}

export function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0
	const sorted = [...values].sort((a, b) => a - b)
	const rank = (p / 100) * (sorted.length - 1)
	const low = Math.floor(rank)
	const high = Math.ceil(rank)
	return sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
}

const SPEAKING_GAP_MS = 3000
const OFF_WORDS = 5
const JUMP_WORDS = 10
const STALL_BEHIND = 3

/** Updates of a session: results that changed the heard text and have a truth. */
export function updateSamples(
	heardTexts: string[],
	times: number[],
	truth: (number | null)[],
	positionAfter: number[],
): UpdateSample[] {
	const samples: UpdateSample[] = []
	for (let i = 0; i < heardTexts.length; i++) {
		const t = truth[i]
		if (t === null || (i > 0 && heardTexts[i] === heardTexts[i - 1])) continue
		samples.push({ t: times[i], truth: t, position: positionAfter[i] })
	}
	return samples
}

export function sessionMetrics(
	samples: UpdateSample[],
	moves: { t: number; from: number; to: number }[],
	resyncs: number[],
): SessionMetrics {
	const errors = samples.map(s => s.truth - s.position)
	let speakingMs = 0
	let stalledMs = 0
	for (let i = 1; i < samples.length; i++) {
		const gap = samples[i].t - samples[i - 1].t
		if (gap > SPEAKING_GAP_MS) continue
		speakingMs += gap
		const truthMoved = samples[i].truth > samples[i - 1].truth
		const placeHeld = samples[i].position === samples[i - 1].position
		if (truthMoved && placeHeld && errors[i] > STALL_BEHIND) stalledMs += gap
	}

	const errorAt = (t: number): number | null => {
		const next = samples.find(s => s.t >= t)
		return next ? Math.abs(next.truth - next.position) : null
	}
	const jumps = moves.filter(move => Math.abs(move.to - move.from) > JUMP_WORDS)
	const badJumps = jumps.filter(move => (errorAt(move.t) ?? 0) > OFF_WORDS).length

	// Recovery runs on speaking time: a reader who stops talking is not waiting for the matcher.
	const recoverySeconds: number[] = []
	let unrecovered = 0
	for (const armedAt of resyncs) {
		let waited = 0
		let last = armedAt
		let recovered = false
		for (const sample of samples) {
			if (sample.t < armedAt) continue
			const gap = sample.t - last
			if (gap <= SPEAKING_GAP_MS) waited += gap
			last = sample.t
			if (Math.abs(sample.truth - sample.position) <= OFF_WORDS) {
				recovered = true
				break
			}
		}
		if (recovered) recoverySeconds.push(waited / 1000)
		else unrecovered++
	}

	const speakingSeconds = speakingMs / 1000
	return {
		updates: samples.length,
		lagP50: percentile(errors, 50),
		lagP95: percentile(errors, 95),
		meanAbsError: errors.length ? errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length : 0,
		offOver5: errors.length ? errors.filter(e => Math.abs(e) > OFF_WORDS).length / errors.length : 0,
		jumpsOver10: jumps.length,
		badJumps,
		speakingSeconds,
		stalledSeconds: stalledMs / 1000,
		stalledPerMinute: speakingSeconds > 0 ? stalledMs / 1000 / (speakingSeconds / 60) : 0,
		resyncs: resyncs.length,
		recoverySeconds,
		unrecoveredResyncs: unrecovered,
	}
}

/** Pool sessions: percentiles over every update of every session, sums for the rest. */
export function overallMetrics(sessions: { samples: UpdateSample[]; metrics: SessionMetrics }[]): SessionMetrics {
	const errors = sessions.flatMap(s => s.samples.map(sample => sample.truth - sample.position))
	const sum = (pick: (m: SessionMetrics) => number): number => sessions.reduce((total, s) => total + pick(s.metrics), 0)
	const speakingSeconds = sum(m => m.speakingSeconds)
	const stalledSeconds = sum(m => m.stalledSeconds)
	return {
		updates: errors.length,
		lagP50: percentile(errors, 50),
		lagP95: percentile(errors, 95),
		meanAbsError: errors.length ? errors.reduce((total, e) => total + Math.abs(e), 0) / errors.length : 0,
		offOver5: errors.length ? errors.filter(e => Math.abs(e) > OFF_WORDS).length / errors.length : 0,
		jumpsOver10: sum(m => m.jumpsOver10),
		badJumps: sum(m => m.badJumps),
		speakingSeconds,
		stalledSeconds,
		stalledPerMinute: speakingSeconds > 0 ? stalledSeconds / (speakingSeconds / 60) : 0,
		resyncs: sum(m => m.resyncs),
		recoverySeconds: sessions.flatMap(s => s.metrics.recoverySeconds),
		unrecoveredResyncs: sum(m => m.unrecoveredResyncs),
	}
}
