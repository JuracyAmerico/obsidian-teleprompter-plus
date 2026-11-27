/**
 * Scroll playback, free of Svelte and the DOM so it can be tested with an injected clock and frame
 * callback: the countdown before playing, speed steps within the settings, the per-frame advance,
 * where the script ends, section steps, and the word counts behind the time estimate.
 *
 * TeleprompterApp.svelte owns the state and the side effects (clock, broadcasts, notices); every
 * decision about what playback does next is made here.
 */

// ===== Speed =====

export interface SpeedSettings {
	minScrollSpeed?: number
	maxScrollSpeed?: number
	speedIncrement?: number
}

export interface SpeedLimits {
	min: number
	max: number
	step: number
}

/** The settings tab defaults. A missing, zero, negative or non-numeric value falls back to these. */
export const DEFAULT_SPEED_LIMITS: Readonly<SpeedLimits> = { min: 0.5, max: 10, step: 0.5 }

function positiveOr(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * The one speed range. The validator clamps min to 0.1–10 and max to 1–100 separately, so a saved
 * min can exceed max; then the two are swapped rather than letting every step fail.
 */
export function speedLimits(settings: SpeedSettings | undefined): SpeedLimits {
	const a = positiveOr(settings?.minScrollSpeed, DEFAULT_SPEED_LIMITS.min)
	const b = positiveOr(settings?.maxScrollSpeed, DEFAULT_SPEED_LIMITS.max)
	return {
		min: Math.min(a, b),
		max: Math.max(a, b),
		step: positiveOr(settings?.speedIncrement, DEFAULT_SPEED_LIMITS.step),
	}
}

/** Two decimals: 0.1 + 0.2 must show as 0.3x, not 0.30000000000000004x. */
function tidy(value: number): number {
	return Math.round(value * 100) / 100
}

/** Any requested speed, held inside the range. A non-number becomes the slowest speed. */
export function clampSpeed(speed: number, limits: SpeedLimits): number {
	if (!Number.isFinite(speed)) return limits.min
	return tidy(Math.min(limits.max, Math.max(limits.min, speed)))
}

/** One step faster (+1) or slower (-1): the hotkeys, the toolbar buttons and the remote all use it. */
export function stepSpeed(speed: number, direction: 1 | -1, limits: SpeedLimits): number {
	const from = Number.isFinite(speed) ? speed : limits.min
	return clampSpeed(from + direction * limits.step, limits)
}

// ===== Countdown =====

/** A window's timers. Pass the view's own window: a pop-out's timers live in its own realm. */
export interface CountdownTimers {
	setInterval(handler: () => void, ms: number): number
	clearInterval(id: number): void
	setTimeout(handler: () => void, ms: number): number
	clearTimeout(id: number): void
}

export interface CountdownHandlers {
	/** The number to show: called with the start value at once, then once a second down to 0. */
	onTick(remaining: number): void
	/** The countdown ran out and was not cancelled: start playing now. */
	onDone(): void
}

/** How long the 0 stays on screen before playback starts. */
export const COUNTDOWN_ZERO_HOLD_MS = 500

/**
 * One countdown per view. Starting again replaces the running one, and cancel() stops both the
 * per-second interval and the hold after 0, so nothing starts playback once it is cancelled.
 */
export class Countdown {
	private timers: CountdownTimers | null = null
	private interval: number | null = null
	private hold: number | null = null

	constructor(private readonly timersFor: () => CountdownTimers) {}

	get active(): boolean {
		return this.interval !== null || this.hold !== null
	}

	start(seconds: number, handlers: CountdownHandlers): void {
		this.cancel()
		let remaining = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
		if (remaining === 0) {
			handlers.onDone()
			return
		}
		const timers = this.timersFor()
		this.timers = timers
		handlers.onTick(remaining)
		this.interval = timers.setInterval(() => {
			remaining--
			handlers.onTick(remaining)
			if (remaining > 0) return
			this.clearInterval()
			this.hold = timers.setTimeout(() => {
				this.hold = null
				this.timers = null
				handlers.onDone()
			}, COUNTDOWN_ZERO_HOLD_MS)
		}, 1000)
	}

	/** Stop without starting playback. Returns whether a countdown was running. */
	cancel(): boolean {
		const wasActive = this.active
		this.clearInterval()
		if (this.hold !== null) {
			this.timers?.clearTimeout(this.hold)
			this.hold = null
		}
		this.timers = null
		return wasActive
	}

	private clearInterval(): void {
		if (this.interval === null) return
		this.timers?.clearInterval(this.interval)
		this.interval = null
	}
}

/** The countdown runs once per pass from the top: at the start, enabled, and not used since the last reset. */
export function shouldCountDown(input: { countdownSeconds: number; atStart: boolean; alreadyUsed: boolean }): boolean {
	return input.countdownSeconds > 0 && input.atStart && !input.alreadyUsed
}

// ===== Frame advance and the end of the script =====

/** The scrolling element, as far as playback needs it. */
export interface ScrollSurface {
	scrollTop: number
	readonly scrollHeight: number
	readonly clientHeight: number
}

/** Speed 1 moves 10 pixels a second: the rate the old loop had, (speed / 2) * (ms / 50). */
export const PIXELS_PER_SECOND_AT_SPEED_1 = 10

/** A longer gap between frames is a stall (window hidden, machine busy), not reading time. */
export const MAX_FRAME_GAP_MS = 250

/** The browser rounds scrollTop to device pixels; a read-back further off than this was moved by someone else. */
const RESYNC_THRESHOLD_PX = 1

/** Within one pixel of the bottom counts as the end, so a rounded scrollTop cannot leave play stuck. */
const END_TOLERANCE_PX = 1

export function maxScrollOf(surface: ScrollSurface): number {
	return surface.scrollHeight - surface.clientHeight
}

/**
 * Nothing left to scroll. A surface with no height is hidden (a background tab), not finished, so a
 * hidden view never ends a rehearsal it cannot show.
 */
export function isAtScriptEnd(surface: ScrollSurface): boolean {
	if (surface.clientHeight <= 0) return false
	const max = maxScrollOf(surface)
	return max <= 0 || surface.scrollTop >= max - END_TOLERANCE_PX
}

/** Share of the script scrolled past, 0 to 1; 0 when nothing scrolls (never NaN). */
export function scrollFraction(scrollTop: number, maxScroll: number): number {
	if (!(maxScroll > 0) || !Number.isFinite(scrollTop)) return 0
	return Math.min(1, Math.max(0, scrollTop / maxScroll))
}

export interface FrameResult {
	/** Where the script is now (the float position, before the browser rounds it). */
	position: number
	/** The bottom was reached on this frame: stop scrolling and freeze the clock. */
	finished: boolean
}

/**
 * Advances the script by elapsed time on every frame. The position is kept as a float, so slow
 * speeds move smoothly instead of waiting for a whole pixel; a scroll by anyone else (wheel, page
 * turn, a jump) is adopted on the next frame instead of being undone.
 */
export class AutoScroller {
	private position: number | null = null
	private readBack: number | null = null
	private lastFrame: number | null = null

	/** Call when playback starts: forget the last frame so the first one moves nothing. */
	start(): void {
		this.position = null
		this.readBack = null
		this.lastFrame = null
	}

	step(now: number, surface: ScrollSurface, speed: number): FrameResult {
		const actual = surface.scrollTop
		if (surface.clientHeight <= 0) {
			// Hidden: no layout to move. Keep time moving so showing it again does not jump.
			this.lastFrame = now
			this.readBack = actual
			return { position: actual, finished: false }
		}

		if (this.position === null || this.readBack === null || Math.abs(actual - this.readBack) > RESYNC_THRESHOLD_PX) {
			this.position = actual
		}

		const gap = this.lastFrame === null ? 0 : Math.min(MAX_FRAME_GAP_MS, Math.max(0, now - this.lastFrame))
		this.lastFrame = now

		const max = maxScrollOf(surface)
		const rate = Number.isFinite(speed) && speed > 0 ? speed * PIXELS_PER_SECOND_AT_SPEED_1 : 0
		const next = Math.min(Math.max(0, max), this.position + (rate * gap) / 1000)
		if (next !== this.position) {
			this.position = next
			surface.scrollTop = next
		}
		this.readBack = surface.scrollTop

		return { position: this.position, finished: max <= 0 || this.position >= max }
	}
}

// ===== Sections =====

/**
 * The section after (+1) or before (-1) the current one, or null at either end. Next on the last
 * section used to wrap to the first, so a double pedal press at the end sent the reader to the top,
 * paused and reset the clock.
 */
export function stepSection(current: number, count: number, direction: 1 | -1): number | null {
	if (count <= 0) return null
	const from = Math.min(count - 1, Math.max(0, Number.isFinite(current) ? Math.trunc(current) : 0))
	const next = from + direction
	return next < 0 || next >= count ? null : next
}

// ===== Word counts for the time estimate =====

/** Spoken words in a markdown script: code, images and markdown symbols do not count; a link counts its text. */
export function countWords(markdown: string): number {
	const clean = markdown
		.replace(/```[\s\S]*?```/g, '') // code blocks
		.replace(/`[^`]+`/g, '') // inline code
		.replace(/!\[.*?\]\(.*?\)/g, '') // images
		.replace(/\[(.*?)\]\(.*?\)/g, '$1') // links: keep the text
		.replace(/[#*_~`]/g, '') // markdown symbols
		.trim()
	if (!clean) return 0
	return clean.split(/\s+/).filter(word => word.length > 0).length
}

/** Words still ahead, from the share of the script scrolled past. */
export function wordsRemaining(totalWords: number, fraction: number): number {
	if (!(totalWords > 0)) return 0
	const share = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
	return Math.max(0, totalWords - Math.floor(totalWords * share))
}

/**
 * What a start-countdown press does (the Stream Deck key, the phone's button, the command): while a
 * countdown runs, the same press cancels it, as Space and the Play button ("Cancel countdown")
 * already do. It used to cancel and start again, so the countdown could never be stopped from the
 * key that started it.
 */
export function countdownPress(counting: boolean): 'cancel' | 'start' {
	return counting ? 'cancel' : 'start'
}
