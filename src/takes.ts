/**
 * Takes: how long one read of a section, or of the whole script, took against its target.
 *
 * Pure, like ./playback: geometry comes in as numbers (content y of each heading, the reading line,
 * the top of the view) and time as the rehearsal clock's elapsed milliseconds, so every rule here
 * is tested without a DOM. TeleprompterApp.svelte measures the page, calls the tracker on every
 * scroll frame, and does the side effects (pause, card, broadcast, log).
 *
 * The model is laps. Each section read whole while playing is a take of that section: it starts
 * where the section's heading is (the play start, or the moment its heading reaches the reading
 * line) and ends when the next heading reaches the reading line. A run that started at the very
 * top and reached the end of the script is also a take of the whole script. Pauses inside a take
 * cost nothing, because the rehearsal clock does not count while paused.
 */

import { PIXELS_PER_SECOND_AT_SPEED_1, clampSpeed, type SpeedLimits } from './playback'

// ===== Sections and where the reader is =====

export interface TakeSection {
	title: string
	/** Content y of the heading's top, in the scroll container's coordinates. */
	top: number
	targetSeconds: number | null
}

/** Where the reader is, in the same content coordinates as `TakeSection.top`. */
export interface ReadingGeometry {
	/** Content y of the eyeline: scrollTop plus the eyeline's offset from the top of the view. */
	readingLine: number
	/** Content y of the top of the view: scrollTop. */
	viewTop: number
}

/** A heading this far above the top of the view still counts as on screen (sub-pixel rounding). */
export const HEADING_VISIBLE_TOLERANCE_PX = 4

/** Index of the last section whose heading is at or above `line`; -1 before the first heading. */
export function sectionIndexAt(sections: readonly TakeSection[], line: number): number {
	let found = -1
	for (let i = 0; i < sections.length; i++) {
		if (sections[i].top <= line) found = i
		else break
	}
	return found
}

export interface SectionLocation {
	index: number
	/** The section's heading is still on screen above the reading line: reading starts at its top. */
	atStart: boolean
}

/**
 * The section being read. When a heading is on screen above the reading line, the topmost such
 * heading is the one being started: a section jump puts its heading near the top of the view,
 * above the eyeline, and a short section can leave the next heading above the eyeline too.
 * Otherwise the reader is inside the section whose heading is above the reading line.
 */
export function locateSection(sections: readonly TakeSection[], geometry: ReadingGeometry): SectionLocation {
	for (let i = 0; i < sections.length; i++) {
		const top = sections[i].top
		// A section jump now lands the heading ON the eyeline (sections.ts); rounding can leave it a pixel
		// below, which must still count as the start of that section.
		if (top > geometry.readingLine + HEADING_VISIBLE_TOLERANCE_PX) break
		if (top >= geometry.viewTop - HEADING_VISIBLE_TOLERANCE_PX) return { index: i, atStart: true }
	}
	return { index: sectionIndexAt(sections, geometry.readingLine), atStart: false }
}

// ===== When a section ends =====

/**
 * `targeted` (the default): stop at the end of a section that has a target, keep going through the
 * rest. `always`: stop at every section end. `never`: scroll through to the end of the script.
 */
export type SectionStopMode = 'targeted' | 'always' | 'never'

export const SECTION_STOP_MODES: readonly SectionStopMode[] = ['targeted', 'always', 'never']

export function isSectionStopMode(value: unknown): value is SectionStopMode {
	return typeof value === 'string' && (SECTION_STOP_MODES as readonly string[]).includes(value)
}

export function shouldStopAtSectionEnd(mode: SectionStopMode, targetSeconds: number | null): boolean {
	if (mode === 'always') return true
	if (mode === 'never') return false
	return targetSeconds !== null && targetSeconds > 0
}

/**
 * Which line the next heading has to reach to end the section. The eyeline, normally. A section so
 * short that the next heading is already at or above the eyeline when it starts would end at once,
 * so it ends when that heading reaches the top of the view instead.
 */
type EndLine = 'eyeline' | 'top'

function endLineFor(sections: readonly TakeSection[], index: number, geometry: ReadingGeometry): EndLine {
	const next = sections[index + 1]
	return next && next.top <= geometry.readingLine ? 'top' : 'eyeline'
}

// ===== Results =====

export type TakeKind = 'section' | 'script'

export interface TakeResult {
	kind: TakeKind
	/** The section's title, or SCRIPT_TAKE_TITLE for a take of the whole script. */
	title: string
	durationSeconds: number
	targetSeconds: number | null
	/** False when reading started inside the section: shown, never logged. */
	complete: boolean
}

export const SCRIPT_TAKE_TITLE = 'Whole script'

/** A section boundary passed while playing. */
export interface SectionEnd {
	/** The lap of the section that just ended; null for the text before the first heading. */
	result: TakeResult | null
	/** Playback should pause here (the stop mode and the section's target decide). */
	stop: boolean
}

export interface ScriptEnd {
	/** The last section's lap, when it had a heading. */
	section: TakeResult | null
	/** The whole script, when the run started at the very top. */
	script: TakeResult | null
}

function secondsBetween(fromMs: number, toMs: number): number {
	return Math.max(0, Math.round((toMs - fromMs) / 1000))
}

// ===== The tracker =====

export interface TakeFrame extends ReadingGeometry {
	sections: readonly TakeSection[]
	/** The rehearsal clock, in ms. It does not count while paused, so neither does a take. */
	elapsedMs: number
}

/**
 * A heading found at most this far past its line on a frame was crossed while reading. The fastest
 * speed (10, 100 px/s) over the longest frame gap (250 ms) moves 25 px.
 */
const LIVE_CROSSING_PX = 40

/** Moved further than this while paused, the reader is somewhere else: the open take is dropped. */
const RESUME_TOLERANCE_PX = 2

/**
 * Follows one rehearsal through its section boundaries. `begin` on every play start, `step` on
 * every scroll frame, `finish` at the end of the script, `discard` whenever the position jumps
 * (section jump, seek, reset, a different note).
 */
export class TakeTracker {
	private active = false
	private section = -1
	private sectionStartMs = 0
	private sectionComplete = false
	private endLine: EndLine = 'eyeline'
	private scriptStartMs: number | null = null
	private lastViewTop: number | null = null

	get isActive(): boolean {
		return this.active
	}

	/** The section the open take is timing, or -1. */
	get currentSection(): number {
		return this.active ? this.section : -1
	}

	/** Whether playing from `viewTop` would carry on the open take rather than start a new one. */
	resumesAt(viewTop: number): boolean {
		return this.active && this.lastViewTop !== null && Math.abs(viewTop - this.lastViewTop) <= RESUME_TOLERANCE_PX
	}

	/** Seconds already spent in the open section take, or null when none is open. */
	sectionElapsedSeconds(elapsedMs: number): number | null {
		return this.active && this.section >= 0 ? secondsBetween(this.sectionStartMs, elapsedMs) : null
	}

	/**
	 * Playback starts. Resuming where the last frame left off keeps the open take (a pause inside a
	 * section costs nothing); anywhere else starts fresh from the section being read.
	 */
	begin(frame: TakeFrame): void {
		const resumed = this.resumesAt(frame.viewTop)
		this.lastViewTop = frame.viewTop
		if (resumed) return

		const location = locateSection(frame.sections, frame)
		this.active = true
		this.section = location.index
		this.sectionStartMs = frame.elapsedMs
		this.sectionComplete = location.atStart
		this.endLine = endLineFor(frame.sections, location.index, frame)
		// The whole script is timed only from its very top.
		this.scriptStartMs = frame.viewTop <= 1 ? frame.elapsedMs : null
	}

	/**
	 * One scroll frame. Returns the section that ended on this frame, if one did. A frame that
	 * skips over a whole section (a wheel scroll the scroller adopted) reports only the first one:
	 * the skipped section was not read, so it gets no take.
	 */
	step(frame: TakeFrame, mode: SectionStopMode): SectionEnd | null {
		if (!this.active) return null
		this.lastViewTop = frame.viewTop
		let ended: SectionEnd | null = null

		for (;;) {
			const next = frame.sections[this.section + 1]
			if (!next) break
			const line = this.endLine === 'eyeline' ? frame.readingLine : frame.viewTop
			if (next.top > line) break

			if (ended === null) {
				const current = frame.sections[this.section]
				ended = current
					? {
						result: {
							kind: 'section',
							title: current.title,
							durationSeconds: secondsBetween(this.sectionStartMs, frame.elapsedMs),
							targetSeconds: current.targetSeconds,
							complete: this.sectionComplete,
						},
						stop: shouldStopAtSectionEnd(mode, current.targetSeconds),
					}
					: { result: null, stop: false }
			}
			// A heading found well past the line was not crossed live: the frame jumped (a wheel scroll
			// the scroller adopted), so the section it lands in was not read from its top. A second
			// boundary on the same frame means the section between them was skipped: it is never
			// reported, because only the first boundary of a frame is.
			this.sectionComplete = line - next.top <= LIVE_CROSSING_PX
			this.section += 1
			this.sectionStartMs = frame.elapsedMs
			// Crossed at the eyeline, the next heading can only be above the eyeline already if the
			// frame jumped past a section, so the eyeline stays the rule and the loop reports the skip.
			// Crossed at the top (short sections), the geometry decides again.
			if (this.endLine === 'top') this.endLine = endLineFor(frame.sections, this.section, frame)
		}
		return ended
	}

	/** The script reached its end. Closes the run; the next play starts fresh. */
	finish(frame: TakeFrame, scriptTargetSeconds: number | null): ScriptEnd {
		if (!this.active) return { section: null, script: null }
		const current = frame.sections[this.section]
		const section: TakeResult | null = current
			? {
				kind: 'section',
				title: current.title,
				durationSeconds: secondsBetween(this.sectionStartMs, frame.elapsedMs),
				targetSeconds: current.targetSeconds,
				complete: this.sectionComplete,
			}
			: null
		const script: TakeResult | null = this.scriptStartMs === null
			? null
			: {
				kind: 'script',
				title: SCRIPT_TAKE_TITLE,
				durationSeconds: secondsBetween(this.scriptStartMs, frame.elapsedMs),
				targetSeconds: scriptTargetSeconds !== null && scriptTargetSeconds > 0 ? scriptTargetSeconds : null,
				complete: true,
			}
		this.discard()
		return { section, script }
	}

	/** The position jumped: nothing open is a take any more. */
	discard(): void {
		this.active = false
		this.section = -1
		this.sectionStartMs = 0
		this.sectionComplete = false
		this.endLine = 'eyeline'
		this.scriptStartMs = null
		this.lastViewTop = null
	}
}

/** What the card shows at the end of the script: the whole script when it was timed, else the last section. */
export function scriptEndCard(end: ScriptEnd): TakeResult | null {
	return end.script ?? end.section
}

/** The takes worth keeping: whole reads only. */
export function loggableTakes(results: readonly (TakeResult | null)[]): TakeResult[] {
	return results.filter((result): result is TakeResult => result !== null && result.complete)
}

// ===== Formatting =====

/** m:ss under an hour, h:mm:ss from an hour: 1:42, 0:08, 1:02:03. */
export function formatTakeTime(seconds: number): string {
	if (!Number.isFinite(seconds)) return '-:--'
	const total = Math.round(Math.abs(seconds))
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const secs = String(total % 60).padStart(2, '0')
	return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

/** Within this many seconds of the target is on target: two seconds, or 2% of a long target. */
export function onTargetToleranceSeconds(targetSeconds: number): number {
	return Math.max(2, targetSeconds * 0.02)
}

export type TakeVerdict = 'on-target' | 'over' | 'under' | 'no-target'

export interface TakeScore {
	verdict: TakeVerdict
	/** Duration minus target; null without a target. */
	deltaSeconds: number | null
}

export function scoreTake(durationSeconds: number, targetSeconds: number | null): TakeScore {
	if (targetSeconds === null || !(targetSeconds > 0)) return { verdict: 'no-target', deltaSeconds: null }
	const delta = durationSeconds - targetSeconds
	if (Math.abs(delta) <= onTargetToleranceSeconds(targetSeconds)) return { verdict: 'on-target', deltaSeconds: delta }
	return { verdict: delta > 0 ? 'over' : 'under', deltaSeconds: delta }
}

/** "Why us · 1:42 · target 1:30 · +0:12", "… · on target", or "… · partial, not logged". */
export function formatTakeLine(take: Pick<TakeResult, 'title' | 'durationSeconds' | 'targetSeconds' | 'complete'>): string {
	const parts = [take.title || 'Untitled section', formatTakeTime(take.durationSeconds)]
	const score = scoreTake(take.durationSeconds, take.targetSeconds)
	if (take.targetSeconds !== null && score.deltaSeconds !== null) {
		parts.push(`target ${formatTakeTime(take.targetSeconds)}`)
		parts.push(score.verdict === 'on-target' ? 'on target' : `${score.deltaSeconds > 0 ? '+' : '-'}${formatTakeTime(score.deltaSeconds)}`)
	}
	if (!take.complete) parts.push('partial, not logged')
	return parts.join(' · ')
}

/** What every surface (this view, the other window, the phone and Stream Deck) is told about the last take. */
export interface TakeCard {
	kind: TakeKind
	title: string
	durationSeconds: number
	targetSeconds: number | null
	deltaSeconds: number | null
	verdict: TakeVerdict
	complete: boolean
	/** The formatted line, so a remote shows exactly what the prompter shows. */
	text: string
}

export function takeCard(result: TakeResult): TakeCard {
	const score = scoreTake(result.durationSeconds, result.targetSeconds)
	return {
		kind: result.kind,
		title: result.title,
		durationSeconds: result.durationSeconds,
		targetSeconds: result.targetSeconds,
		deltaSeconds: score.deltaSeconds,
		verdict: score.verdict,
		complete: result.complete,
		text: formatTakeLine(result),
	}
}

// ===== Fit to target =====

export interface FitInput extends TakeFrame {
	/** scrollHeight - clientHeight: where the script ends, in scrollTop terms. */
	maxScrollTop: number
	/** The whole script's target (override, frontmatter or default). */
	scriptTargetSeconds: number | null
	/** The tracker's open section and the seconds already spent in it, when a take is open. */
	openSection: number
	openSectionElapsedSeconds: number | null
}

export type FitScope = 'section' | 'script'

export type FitPlan =
	| { ok: true; scope: FitScope; title: string; distancePx: number; secondsLeft: number; pixelsPerSecond: number }
	| { ok: false; reason: 'no-target' | 'over-target' | 'at-end' }

/**
 * The scroll rate that brings the end of what is being rehearsed to the reading line exactly when
 * its target runs out: the current section when it has a target (to the next heading, or to the
 * end of the script for the last one), otherwise the rest of the script against the script target.
 * Distance is in pixels because the take ends on pixels (a heading reaching the eyeline); the
 * words in that distance are what the reader says, so pixels per second is words per minute at
 * the script's density (see reading-rate.ts).
 */
export function planFit(input: FitInput): FitPlan {
	const location = locateSection(input.sections, input)
	const index = input.openSection >= 0 ? input.openSection : location.index
	const section = input.sections[index]
	const scriptEndDistance = Math.max(0, input.maxScrollTop - input.viewTop)

	if (section && section.targetSeconds !== null && section.targetSeconds > 0) {
		const spent = input.openSection === index ? input.openSectionElapsedSeconds ?? 0 : 0
		const next = input.sections[index + 1]
		let distancePx = scriptEndDistance
		if (next) {
			const toEyeline = next.top - input.readingLine
			distancePx = toEyeline > 0 ? toEyeline : Math.max(0, next.top - input.viewTop)
		}
		return finishPlan('section', section.title, distancePx, section.targetSeconds - spent)
	}

	if (input.scriptTargetSeconds === null || !(input.scriptTargetSeconds > 0)) return { ok: false, reason: 'no-target' }
	const spent = Math.max(0, input.elapsedMs / 1000)
	return finishPlan('script', SCRIPT_TAKE_TITLE, scriptEndDistance, input.scriptTargetSeconds - spent)
}

function finishPlan(scope: FitScope, title: string, distancePx: number, secondsLeft: number): FitPlan {
	if (!(secondsLeft > 0)) return { ok: false, reason: 'over-target' }
	if (!(distancePx > 0)) return { ok: false, reason: 'at-end' }
	return { ok: true, scope, title, distancePx, secondsLeft, pixelsPerSecond: distancePx / secondsLeft }
}

export interface FittedSpeed {
	speed: number
	/** The speed the plan asked for before the settings range held it. */
	wanted: number
	clamped: 'min' | 'max' | null
}

/** The playback speed for a planned rate, held inside the speed range. */
export function speedForPlan(pixelsPerSecond: number, limits: SpeedLimits): FittedSpeed {
	const wanted = pixelsPerSecond / PIXELS_PER_SECOND_AT_SPEED_1
	const speed = clampSpeed(wanted, limits)
	const clamped = wanted < limits.min ? 'min' : wanted > limits.max ? 'max' : null
	return { speed, wanted, clamped }
}
