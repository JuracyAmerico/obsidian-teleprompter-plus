/**
 * Rehearsal clock: target duration, elapsed stage time, and pace against the script.
 *
 * Pure module — no DOM, no Svelte, no Obsidian. The clock takes its `now()` so tests are
 * deterministic and so a paused rehearsal can never drift.
 *
 * Durations are free-form: a 90-second interview answer and a one-hour lecture use the same
 * code path, so nothing here assumes "a few minutes" (formatting grows an hours field, and
 * the warning threshold is proportional to the target rather than a fixed number of seconds).
 */

/**
 * Pace of the speaker against the script, comparing time spent to ground covered.
 * `unknown` is a real answer: right after a section jump or a resync, position is not
 * trustworthy, and saying nothing beats flashing a wrong verdict mid-sentence.
 */
export type PaceStatus = 'ahead' | 'on-track' | 'behind' | 'over' | 'unknown'

export interface PaceState {
	/** Seconds left before the target. Negative once the target is passed. */
	remainingSeconds: number
	/** True once elapsed has passed the target. */
	overtime: boolean
	status: PaceStatus
	/**
	 * Elapsed minus the time this much of the script "should" have taken.
	 * Positive = running late; negative = running early. Null when position is unknown.
	 */
	driftSeconds: number | null
	/** True while inside the end-of-target warning band (see warningThreshold). */
	warning: boolean
}

export interface PaceInput {
	targetSeconds: number | null
	elapsedSeconds: number
	/** Fraction of the script already spoken, 0..1. */
	progress: number
	/** False while position is untrustworthy (jump, resync, no voice tracking). */
	progressValid?: boolean
	/** Last status shown, so a one-second wobble cannot make the badge strobe. */
	previousStatus?: PaceStatus
}

/** Syncable clock anchor — see SpeechClock.snapshot(). */
export interface ClockSnapshot {
	accumulatedMs: number
	/** Wall-clock ms when the current run segment began; null when paused. */
	anchorEpochMs: number | null
}

const HOUR = 3600
const MINUTE = 60

/** Drift beyond this fraction of the target enters an ahead/behind verdict. */
const DRIFT_ENTER = 0.08
/** A verdict already showing holds until drift falls back inside this narrower band. */
const DRIFT_RELEASE = 0.04

/**
 * Seconds left at which the display should start warning.
 * Proportional so it scales: 30s for a 2-minute answer, 3 minutes for a 1-hour talk.
 */
export function warningThreshold(targetSeconds: number): number {
	return Math.max(30, targetSeconds * 0.05)
}

function clampProgress(progress: number): number {
	if (!Number.isFinite(progress)) return 0
	return Math.min(1, Math.max(0, progress))
}

/**
 * Parse a target duration into seconds.
 *
 * Accepted: "2:00" (mm:ss), "1:30:00" (h:mm:ss), "90s", "2m", "1h", "1h30", "1h30m", and a
 * bare number (minutes — `target-time: 45` reads as 45 minutes, which is how a human writes it).
 * Anything else, including zero and negatives, is null rather than a throw: the value comes
 * from a note's frontmatter and must never break loading a script.
 */
export function parseTargetTime(input: unknown): number | null {
	if (typeof input === 'number') {
		return Number.isFinite(input) && input > 0 ? Math.round(input * MINUTE) : null
	}
	if (typeof input !== 'string') return null

	const raw = input.trim().toLowerCase()
	if (!raw) return null

	// h:mm:ss or mm:ss. Trailing fields are real clock fields, so "2:75" is a typo, not 3:15 —
	// silently reinterpreting it would put a wrong target on screen with no way to notice.
	if (raw.includes(':')) {
		const parts = raw.split(':')
		if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d{1,3}$/.test(p))) return null
		const nums = parts.map(Number)
		if (nums.slice(1).some(n => n > 59)) return null
		const seconds = parts.length === 3
			? nums[0] * HOUR + nums[1] * MINUTE + nums[2]
			: nums[0] * MINUTE + nums[1]
		return seconds > 0 ? seconds : null
	}

	// 1h30m / 1h30 / 90m / 45s / 2min
	const unitMatch = raw.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/)
	if (unitMatch && (unitMatch[1] || unitMatch[2] || unitMatch[3])) {
		const seconds = Number(unitMatch[1] ?? 0) * HOUR + Number(unitMatch[2] ?? 0) * MINUTE + Number(unitMatch[3] ?? 0)
		return seconds > 0 ? seconds : null
	}

	// "1h30" — hours with a bare minutes remainder
	const hourRemainder = raw.match(/^(\d+)\s*h\s*(\d+)$/)
	if (hourRemainder) {
		const seconds = Number(hourRemainder[1]) * HOUR + Number(hourRemainder[2]) * MINUTE
		return seconds > 0 ? seconds : null
	}

	// Bare number as a string behaves like the numeric form: minutes.
	if (/^\d+(\.\d+)?$/.test(raw)) {
		const minutes = Number(raw)
		return minutes > 0 ? Math.round(minutes * MINUTE) : null
	}

	return null
}

export type TargetSource = 'override' | 'frontmatter' | 'default' | 'none'

export interface ResolvedTarget {
	targetSeconds: number | null
	source: TargetSource
}

/**
 * Pick the target that applies right now: a toolbar override beats the note's frontmatter,
 * which beats the global default. An unparseable frontmatter value falls THROUGH to the
 * default rather than turning the target off — a typo in one note should not silently
 * disable the clock.
 */
export function resolveTarget(
	overrideSeconds: number | null | undefined,
	frontmatterValue: string | number | null | undefined,
	defaultSeconds: number | null | undefined,
): ResolvedTarget {
	if (overrideSeconds !== null && overrideSeconds !== undefined && overrideSeconds > 0) {
		return { targetSeconds: Math.round(overrideSeconds), source: 'override' }
	}
	const fromNote = parseTargetTime(frontmatterValue ?? null)
	if (fromNote !== null) return { targetSeconds: fromNote, source: 'frontmatter' }

	if (defaultSeconds !== null && defaultSeconds !== undefined && defaultSeconds > 0) {
		return { targetSeconds: Math.round(defaultSeconds), source: 'default' }
	}
	return { targetSeconds: null, source: 'none' }
}

/**
 * Clock text. Under an hour it is MM:SS; at or past an hour it grows an hours field, so a
 * 75-minute talk reads 1:15:00 instead of 75:00.
 */
export function formatClock(seconds: number, opts: { signed?: boolean } = {}): string {
	// A bad number must show as blanks, never as "NaN:NaN" on a screen he is presenting from.
	if (!Number.isFinite(seconds)) return '--:--'
	const negative = seconds < 0
	const total = Math.floor(Math.abs(seconds))
	const hours = Math.floor(total / HOUR)
	const mins = Math.floor((total % HOUR) / MINUTE)
	const secs = total % MINUTE

	const body = hours > 0
		? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
		: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

	return negative && opts.signed ? `-${body}` : body
}

/**
 * Compare time spent against ground covered.
 *
 * `expected` is how far into the target this much of the script should have been reached;
 * drift is the gap. Both scale with the target, so the same thresholds work for a 90-second
 * answer and an hour-long lecture.
 */
export function computePaceState({
	targetSeconds,
	elapsedSeconds,
	progress,
	progressValid = true,
	previousStatus,
}: PaceInput): PaceState {
	// No usable target: the clock still counts up, but there is nothing to be ahead or behind of.
	if (targetSeconds === null || !Number.isFinite(targetSeconds) || targetSeconds <= 0) {
		return { remainingSeconds: 0, overtime: false, status: 'unknown', driftSeconds: null, warning: false }
	}

	const remainingSeconds = targetSeconds - elapsedSeconds
	const overtime = remainingSeconds < 0
	const warning = !overtime && remainingSeconds <= warningThreshold(targetSeconds)

	if (overtime) {
		return { remainingSeconds, overtime, status: 'over', driftSeconds: null, warning }
	}
	if (!progressValid || !Number.isFinite(progress)) {
		return { remainingSeconds, overtime, status: 'unknown', driftSeconds: null, warning }
	}

	const expected = targetSeconds * clampProgress(progress)
	const driftSeconds = elapsedSeconds - expected

	// Two bands: a verdict needs DRIFT_ENTER to appear but only DRIFT_RELEASE to persist, so a
	// one-second wobble around the boundary cannot flip the badge back and forth every tick.
	const enter = targetSeconds * DRIFT_ENTER
	const release = targetSeconds * DRIFT_RELEASE
	let status: PaceStatus
	if (previousStatus === 'behind' && driftSeconds > release) status = 'behind'
	else if (previousStatus === 'ahead' && driftSeconds < -release) status = 'ahead'
	else if (driftSeconds > enter) status = 'behind'
	else if (driftSeconds < -enter) status = 'ahead'
	else status = 'on-track'

	return { remainingSeconds, overtime, status, driftSeconds, warning }
}

/**
 * Wall-clock stopwatch for one rehearsal.
 *
 * Stage time: silence counts, because that is the time the audience and the examiner measure.
 * It is a session of its own rather than a value derived from playback flags — switching the
 * voice pace preset mid-rehearsal stops and restarts voice tracking, and a derived clock would
 * reset itself for no reason.
 */
export class SpeechClock {
	private accumulatedMs = 0
	private startedAt: number | null = null

	constructor(private readonly now: () => number = Date.now) {}

	/** Begin a fresh rehearsal, discarding any previous time. */
	start(): void {
		this.accumulatedMs = 0
		this.startedAt = this.now()
	}

	/** Resume without discarding time. No-op when already running. */
	resume(): void {
		if (this.startedAt === null) this.startedAt = this.now()
	}

	/** Freeze the clock, keeping the time so far. Calling it twice must not double-count. */
	pause(): void {
		if (this.startedAt === null) return
		this.accumulatedMs += this.now() - this.startedAt
		this.startedAt = null
	}

	reset(): void {
		this.accumulatedMs = 0
		this.startedAt = null
	}

	get isRunning(): boolean {
		return this.startedAt !== null
	}

	get elapsedMs(): number {
		const live = this.startedAt === null ? 0 : this.now() - this.startedAt
		return this.accumulatedMs + live
	}

	get elapsedSeconds(): number {
		return Math.floor(this.elapsedMs / 1000)
	}

	/**
	 * The anchor, for syncing to another window: banked time plus the wall-clock instant the
	 * current segment started. Windows share `Date.now()`, so each one ticks locally from the
	 * same anchor — no per-second broadcast, and therefore no drift between the two clocks.
	 */
	snapshot(): ClockSnapshot {
		return { accumulatedMs: this.accumulatedMs, anchorEpochMs: this.startedAt }
	}

	/** Adopt another window's anchor verbatim. */
	restore(snapshot: ClockSnapshot): void {
		this.accumulatedMs = Math.max(0, snapshot.accumulatedMs)
		this.startedAt = snapshot.anchorEpochMs ?? null
	}

	static fromSnapshot(snapshot: ClockSnapshot, now: () => number = Date.now): SpeechClock {
		const clock = new SpeechClock(now)
		clock.restore(snapshot)
		return clock
	}
}
