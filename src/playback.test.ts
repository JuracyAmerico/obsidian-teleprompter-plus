import { describe, expect, test } from 'bun:test'
import {
	AutoScroller,
	COUNTDOWN_ZERO_HOLD_MS,
	Countdown,
	MAX_FRAME_GAP_MS,
	clampSpeed,
	countWords,
	isAtScriptEnd,
	scrollFraction,
	shouldCountDown,
	speedLimits,
	stepSection,
	stepSpeed,
	wordsRemaining,
	type CountdownTimers,
	type ScrollSurface,
} from './playback'

/** A manual clock standing in for a window's timers. */
class FakeTimers implements CountdownTimers {
	now = 0
	private nextId = 1
	private jobs = new Map<number, { at: number; every: number | null; run: () => void }>()

	setInterval(handler: () => void, ms: number): number {
		const id = this.nextId++
		this.jobs.set(id, { at: this.now + ms, every: ms, run: handler })
		return id
	}
	clearInterval(id: number): void {
		this.jobs.delete(id)
	}
	setTimeout(handler: () => void, ms: number): number {
		const id = this.nextId++
		this.jobs.set(id, { at: this.now + ms, every: null, run: handler })
		return id
	}
	clearTimeout(id: number): void {
		this.jobs.delete(id)
	}
	get pending(): number {
		return this.jobs.size
	}
	advance(ms: number): void {
		const end = this.now + ms
		for (;;) {
			let dueId: number | null = null
			let dueAt = Infinity
			for (const [id, job] of this.jobs) if (job.at <= end && job.at < dueAt) { dueId = id; dueAt = job.at }
			if (dueId === null) break
			const job = this.jobs.get(dueId)!
			this.now = job.at
			if (job.every === null) this.jobs.delete(dueId)
			else job.at += job.every
			job.run()
		}
		this.now = end
	}
}

function countdownRig() {
	const timers = new FakeTimers()
	const ticks: number[] = []
	let done = 0
	const countdown = new Countdown(() => timers)
	const handlers = { onTick: (n: number) => ticks.push(n), onDone: () => { done++ } }
	return { timers, ticks, countdown, handlers, done: () => done }
}

describe('countdown', () => {
	test('shows N down to 0, then starts playback half a second after the 0', () => {
		const { timers, ticks, countdown, handlers, done } = countdownRig()
		countdown.start(3, handlers)
		expect(ticks).toEqual([3])
		timers.advance(3000)
		expect(ticks).toEqual([3, 2, 1, 0])
		expect(done()).toBe(0)
		timers.advance(COUNTDOWN_ZERO_HOLD_MS - 1)
		expect(done()).toBe(0)
		timers.advance(1)
		expect(done()).toBe(1)
		expect(countdown.active).toBe(false)
		expect(timers.pending).toBe(0)
	})

	test('B1: a cancel mid-count never starts playback later', () => {
		const { timers, countdown, handlers, done } = countdownRig()
		countdown.start(3, handlers)
		timers.advance(1500)
		expect(countdown.cancel()).toBe(true)
		timers.advance(10_000)
		expect(done()).toBe(0)
		expect(timers.pending).toBe(0)
	})

	test('B1: a cancel while the 0 is showing (the old 0.5 s window) never starts playback', () => {
		const { timers, countdown, handlers, done } = countdownRig()
		countdown.start(1, handlers)
		timers.advance(1000 + COUNTDOWN_ZERO_HOLD_MS / 2)
		expect(countdown.active).toBe(true)
		expect(countdown.cancel()).toBe(true)
		timers.advance(10_000)
		expect(done()).toBe(0)
	})

	test('B1: two starts leave one countdown, which ends once', () => {
		const { timers, ticks, countdown, handlers, done } = countdownRig()
		countdown.start(3, handlers)
		timers.advance(1000)
		countdown.start(3, handlers)
		timers.advance(10_000)
		expect(done()).toBe(1)
		// the second start restarts the count from 3; the first interval never ticks again
		expect(ticks).toEqual([3, 2, 3, 2, 1, 0])
	})

	test('cancel with nothing running reports false and is harmless', () => {
		const { countdown } = countdownRig()
		expect(countdown.cancel()).toBe(false)
		expect(countdown.active).toBe(false)
	})

	test('zero, negative or junk seconds start playback at once with no timer left behind', () => {
		for (const seconds of [0, -2, Number.NaN]) {
			const { timers, countdown, handlers, done, ticks } = countdownRig()
			countdown.start(seconds, handlers)
			expect(done()).toBe(1)
			expect(ticks).toEqual([])
			expect(timers.pending).toBe(0)
		}
	})

	test('the countdown runs once per pass from the top', () => {
		expect(shouldCountDown({ countdownSeconds: 5, atStart: true, alreadyUsed: false })).toBe(true)
		expect(shouldCountDown({ countdownSeconds: 0, atStart: true, alreadyUsed: false })).toBe(false)
		expect(shouldCountDown({ countdownSeconds: 5, atStart: false, alreadyUsed: false })).toBe(false)
		expect(shouldCountDown({ countdownSeconds: 5, atStart: true, alreadyUsed: true })).toBe(false)
	})
})

describe('speed', () => {
	const defaults = speedLimits({})

	test('defaults are the settings tab defaults', () => {
		expect(defaults).toEqual({ min: 0.5, max: 10, step: 0.5 })
	})

	test('B2: speeding up stops at the settings maximum, in the settings step', () => {
		let speed = 2
		for (let i = 0; i < 100; i++) speed = stepSpeed(speed, 1, defaults)
		expect(speed).toBe(10)
		expect(stepSpeed(2, 1, defaults)).toBe(2.5)
		expect(stepSpeed(9.8, 1, defaults)).toBe(10)
	})

	test('B2: slowing down stops at the settings minimum', () => {
		let speed = 3
		for (let i = 0; i < 100; i++) speed = stepSpeed(speed, -1, defaults)
		expect(speed).toBe(0.5)
		expect(stepSpeed(0.7, -1, defaults)).toBe(0.5)
	})

	test('custom settings are honoured, and float steps stay tidy', () => {
		const limits = speedLimits({ minScrollSpeed: 0.1, maxScrollSpeed: 3, speedIncrement: 0.1 })
		expect(stepSpeed(0.2, 1, limits)).toBe(0.3)
		expect(stepSpeed(2.95, 1, limits)).toBe(3)
	})

	test('a saved min above max is swapped, not a range that rejects every speed', () => {
		expect(speedLimits({ minScrollSpeed: 8, maxScrollSpeed: 2 })).toEqual({ min: 2, max: 8, step: 0.5 })
	})

	test('zero, negative or missing settings fall back to the defaults', () => {
		expect(speedLimits({ minScrollSpeed: 0, maxScrollSpeed: -1, speedIncrement: Number.NaN })).toEqual(defaults)
		expect(speedLimits(undefined)).toEqual(defaults)
	})

	test('set-speed from the phone keeps 0.5x and caps 50 at the maximum (ISC-159)', () => {
		expect(clampSpeed(0.5, defaults)).toBe(0.5)
		expect(clampSpeed(50, defaults)).toBe(10)
		expect(clampSpeed(0.1, defaults)).toBe(0.5)
		expect(clampSpeed(Number.NaN, defaults)).toBe(0.5)
	})
})

/** A scrolling element: the browser clamps scrollTop to its range and, on a 1x screen, to whole pixels. */
class FakeSurface implements ScrollSurface {
	private top = 0
	constructor(public scrollHeight: number, public clientHeight: number, private readonly pixelStep = 1) {}
	get scrollTop(): number {
		return this.top
	}
	set scrollTop(value: number) {
		const max = Math.max(0, this.scrollHeight - this.clientHeight)
		this.top = Math.round(Math.min(max, Math.max(0, value)) / this.pixelStep) * this.pixelStep
	}
}

/** Runs frames every `frameMs` for `durationMs`, returning how far the surface moved per frame. */
function runFrames(scroller: AutoScroller, surface: FakeSurface, speed: number, frameMs: number, durationMs: number, startAt = 1000) {
	const moves: number[] = []
	let finishedAt: number | null = null
	for (let t = startAt; t <= startAt + durationMs; t += frameMs) {
		const before = surface.scrollTop
		const frame = scroller.step(t, surface, speed)
		moves.push(surface.scrollTop - before)
		if (frame.finished) { finishedAt = t; break }
	}
	return { moves, finishedAt }
}

describe('frame advance', () => {
	test('B3: at 60 Hz every frame moves, by elapsed time, never a doubled frame', () => {
		// The old loop gated on delta >= 16.67 while a 60 Hz frame is 16.667 ms, so many frames did
		// nothing and the next moved twice. Speed 6 is 60 px/s: one pixel per 60 Hz frame.
		const scroller = new AutoScroller()
		scroller.start()
		const surface = new FakeSurface(100_000, 500)
		const { moves } = runFrames(scroller, surface, 6, 1000 / 60, 2000)
		const afterFirst = moves.slice(1)
		expect(afterFirst.every(m => m === 1)).toBe(true)
		expect(surface.scrollTop).toBe(120)
	})

	test('B3: a slow speed keeps its fraction and lands where elapsed time says', () => {
		// 0.5x is 5 px/s: under a tenth of a pixel per frame. A float position means 10 s is 50 px.
		const scroller = new AutoScroller()
		scroller.start()
		const surface = new FakeSurface(100_000, 500)
		runFrames(scroller, surface, 0.5, 1000 / 60, 10_000)
		expect(surface.scrollTop).toBeGreaterThanOrEqual(49)
		expect(surface.scrollTop).toBeLessThanOrEqual(50)
	})

	test('rate is independent of frame rate (30, 60 and 120 Hz agree)', () => {
		const at = (hz: number) => {
			const scroller = new AutoScroller()
			scroller.start()
			const surface = new FakeSurface(100_000, 500, 0.5)
			runFrames(scroller, surface, 2, 1000 / hz, 5000)
			return surface.scrollTop
		}
		expect(Math.abs(at(30) - 100)).toBeLessThanOrEqual(1)
		expect(Math.abs(at(60) - 100)).toBeLessThanOrEqual(1)
		expect(Math.abs(at(120) - 100)).toBeLessThanOrEqual(1)
	})

	test('the first frame after start moves nothing, and a stall does not jump the script', () => {
		const scroller = new AutoScroller()
		scroller.start()
		const surface = new FakeSurface(100_000, 500)
		scroller.step(0, surface, 10)
		expect(surface.scrollTop).toBe(0)
		scroller.step(5000, surface, 10) // 5 s with no frames: a hidden window, not reading time
		expect(surface.scrollTop).toBe((10 * 10 * MAX_FRAME_GAP_MS) / 1000)
	})

	test('a scroll by the reader or a jump is kept, and playback carries on from there', () => {
		const scroller = new AutoScroller()
		scroller.start()
		const surface = new FakeSurface(100_000, 500)
		scroller.step(0, surface, 6)
		scroller.step(100, surface, 6)
		expect(surface.scrollTop).toBe(6)
		surface.scrollTop = 4000 // wheel, page turn, section jump
		const frame = scroller.step(100 + 1000 / 60, surface, 6)
		expect(frame.position).toBe(4001)
		expect(surface.scrollTop).toBe(4001)
	})

	test('a hidden surface neither moves nor finishes', () => {
		const scroller = new AutoScroller()
		scroller.start()
		const hidden = new FakeSurface(0, 0)
		expect(scroller.step(0, hidden, 10).finished).toBe(false)
		expect(scroller.step(100, hidden, 10).finished).toBe(false)
		expect(isAtScriptEnd(hidden)).toBe(false)
	})
})

describe('end of the script', () => {
	test('B4: playback reports finished on the frame it reaches the bottom, and not before', () => {
		const scroller = new AutoScroller()
		scroller.start()
		const surface = new FakeSurface(1500, 500) // 1000 px to scroll
		// speed 10 = 100 px/s: the bottom is 10 s away
		const { finishedAt } = runFrames(scroller, surface, 10, 1000 / 60, 20_000, 0)
		expect(finishedAt).not.toBeNull()
		expect(finishedAt!).toBeGreaterThanOrEqual(9_990)
		expect(finishedAt!).toBeLessThanOrEqual(10_020)
		expect(surface.scrollTop).toBe(1000)
		expect(isAtScriptEnd(surface)).toBe(true)
	})

	test('B4: starting at the bottom finishes on the first frame without moving', () => {
		const scroller = new AutoScroller()
		scroller.start()
		const surface = new FakeSurface(1500, 500)
		surface.scrollTop = 1000
		expect(scroller.step(0, surface, 2).finished).toBe(true)
	})

	test('a rounded scrollTop one pixel short of the bottom counts as the end', () => {
		const surface = new FakeSurface(1500, 500, 0.5)
		surface.scrollTop = 999.5
		expect(isAtScriptEnd(surface)).toBe(true)
		surface.scrollTop = 990
		expect(isAtScriptEnd(surface)).toBe(false)
	})

	test('a laid-out script with nothing to scroll is at its end', () => {
		expect(isAtScriptEnd(new FakeSurface(400, 500))).toBe(true)
	})

	test('scroll fraction is never NaN (0/0) or above 1', () => {
		expect(scrollFraction(0, 0)).toBe(0)
		expect(scrollFraction(10, -5)).toBe(0)
		expect(scrollFraction(500, 1000)).toBe(0.5)
		expect(scrollFraction(1200, 1000)).toBe(1)
		expect(scrollFraction(Number.NaN, 1000)).toBe(0)
	})
})

describe('sections', () => {
	test('next stops at the last section instead of wrapping to the first', () => {
		expect(stepSection(0, 4, 1)).toBe(1)
		expect(stepSection(2, 4, 1)).toBe(3)
		expect(stepSection(3, 4, 1)).toBeNull()
	})

	test('previous stops at the first section instead of wrapping to the last', () => {
		expect(stepSection(3, 4, -1)).toBe(2)
		expect(stepSection(0, 4, -1)).toBeNull()
	})

	test('a stale index from a longer note is held inside this one', () => {
		expect(stepSection(10, 4, -1)).toBe(2)
		expect(stepSection(10, 4, 1)).toBeNull()
		expect(stepSection(-3, 4, 1)).toBe(1)
	})

	test('no sections, no step', () => {
		expect(stepSection(0, 0, 1)).toBeNull()
		expect(stepSection(0, 0, -1)).toBeNull()
	})
})

describe('word count (B7)', () => {
	test('a link counts its text, not a literal "$1"', () => {
		expect(countWords('See [the full report](https://example.com/report) today')).toBe(5)
		expect(countWords('[one](a) [two words](b)')).toBe(3)
	})

	test('images, code and markdown symbols do not count', () => {
		expect(countWords('# Title\n\n![a cat](cat.png) **bold** text `code` here\n\n```\nlots of code here\n```')).toBe(4)
	})

	test('empty or symbol-only text is zero', () => {
		expect(countWords('')).toBe(0)
		expect(countWords('  # ** __  ')).toBe(0)
	})

	test('words remaining never goes NaN when nothing scrolls', () => {
		expect(wordsRemaining(100, scrollFraction(0, 0))).toBe(100)
		expect(wordsRemaining(100, Number.NaN)).toBe(100)
		expect(wordsRemaining(100, 0.25)).toBe(75)
		expect(wordsRemaining(100, 1)).toBe(0)
		expect(wordsRemaining(0, 0.5)).toBe(0)
	})
})
