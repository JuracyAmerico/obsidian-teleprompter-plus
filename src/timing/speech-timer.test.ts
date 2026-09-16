import { describe, expect, test } from 'bun:test'
import { SpeechClock, computePaceState, formatClock, parseTargetTime, resolveTarget, warningThreshold } from './speech-timer'

describe('parseTargetTime', () => {
	test('clock forms', () => {
		expect(parseTargetTime('2:00')).toBe(120)
		expect(parseTargetTime('0:45')).toBe(45)
		expect(parseTargetTime('1:30:00')).toBe(5400)
		expect(parseTargetTime('90:00')).toBe(5400)
	})

	test('unit forms, from seconds to hours', () => {
		expect(parseTargetTime('90s')).toBe(90)
		expect(parseTargetTime('2m')).toBe(120)
		expect(parseTargetTime('45min')).toBe(2700)
		expect(parseTargetTime('1h')).toBe(3600)
		expect(parseTargetTime('1h30')).toBe(5400)
		expect(parseTargetTime('1h30m')).toBe(5400)
	})

	test('a bare number means minutes, the way a human writes it', () => {
		expect(parseTargetTime(2)).toBe(120)
		expect(parseTargetTime(60)).toBe(3600)
		expect(parseTargetTime('10')).toBe(600)
	})

	test('junk and non-positive values are null, never a throw', () => {
		for (const bad of ['', '   ', 'abc', 'soon', '-5', 0, -2, '0:00', '1:2:3:4', null, undefined, {}, NaN]) {
			expect(parseTargetTime(bad)).toBeNull()
		}
	})

	test('out-of-range clock fields are a typo, not a reinterpretation', () => {
		expect(parseTargetTime('2:75')).toBeNull()
		expect(parseTargetTime('1:60:00')).toBeNull()
		expect(parseTargetTime('1:30:99')).toBeNull()
	})

	test('a YAML number and the same value quoted mean the same thing', () => {
		expect(parseTargetTime(120)).toBe(parseTargetTime('120'))
		expect(parseTargetTime('120')).toBe(7200)
	})

	test('stays linear on hostile input', () => {
		const start = performance.now()
		expect(parseTargetTime('9'.repeat(100_000))).not.toBeUndefined()
		expect(parseTargetTime('1:'.repeat(50_000))).toBeNull()
		expect(parseTargetTime(`${'1'.repeat(50_000)}h`)).not.toBeUndefined()
		expect(performance.now() - start).toBeLessThan(1000)
	})
})

describe('formatClock', () => {
	test('minutes and seconds under an hour', () => {
		expect(formatClock(0)).toBe('00:00')
		expect(formatClock(5)).toBe('00:05')
		expect(formatClock(120)).toBe('02:00')
		expect(formatClock(3599)).toBe('59:59')
	})

	test('grows an hours field instead of running past 60 minutes', () => {
		expect(formatClock(3600)).toBe('1:00:00')
		expect(formatClock(4500)).toBe('1:15:00')
	})

	test('signs overtime only when asked', () => {
		expect(formatClock(-15, { signed: true })).toBe('-00:15')
		expect(formatClock(-15)).toBe('00:15')
	})

	test('truncates toward zero', () => {
		expect(formatClock(0.9)).toBe('00:00')
		expect(formatClock(59.9)).toBe('00:59')
	})

	test('a bad number shows blanks, never NaN on a presentation screen', () => {
		expect(formatClock(NaN)).toBe('--:--')
		expect(formatClock(Infinity)).toBe('--:--')
	})
})

describe('warningThreshold', () => {
	test('scales with the target but never drops below 30 seconds', () => {
		expect(warningThreshold(120)).toBe(30)
		expect(warningThreshold(3600)).toBe(180)
	})
})

describe('computePaceState', () => {
	const target = 120

	test('remaining time and the overtime boundary', () => {
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 119, progress: 0.99 }).remainingSeconds).toBe(1)
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 120, progress: 1 }).overtime).toBe(false)
		const over = computePaceState({ targetSeconds: target, elapsedSeconds: 121, progress: 1 })
		expect(over.overtime).toBe(true)
		expect(over.remainingSeconds).toBe(-1)
		expect(over.status).toBe('over')
	})

	test('ahead, on track and behind invert around the tolerance band', () => {
		// Halfway through the script at the halfway mark is on track.
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 60, progress: 0.5 }).status).toBe('on-track')
		// Same position reached 20s early is ahead; 20s late is behind (tolerance is 9.6s here).
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 40, progress: 0.5 }).status).toBe('ahead')
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 80, progress: 0.5 }).status).toBe('behind')
		// Just inside the band stays on track.
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 69, progress: 0.5 }).status).toBe('on-track')
	})

	test('drift is signed: positive means late', () => {
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 80, progress: 0.5 }).driftSeconds).toBe(20)
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 40, progress: 0.5 }).driftSeconds).toBe(-20)
	})

	test('progress at the edges, including out-of-range input', () => {
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 0, progress: 0 }).status).toBe('on-track')
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 30, progress: 1 }).status).toBe('ahead')
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 30, progress: 5 }).driftSeconds).toBe(-90)
	})

	test('says unknown instead of guessing when position is untrustworthy', () => {
		// After a section jump or a resync the matcher index can move backwards.
		const jumped = computePaceState({ targetSeconds: target, elapsedSeconds: 80, progress: 0.2, progressValid: false })
		expect(jumped.status).toBe('unknown')
		expect(jumped.driftSeconds).toBeNull()
		// The clock itself keeps working.
		expect(jumped.remainingSeconds).toBe(40)
		// A NaN progress is the same situation.
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 30, progress: NaN }).status).toBe('unknown')
	})

	test('no usable target means no verdict and no NaN', () => {
		for (const bad of [null, 0, -60, NaN]) {
			const state = computePaceState({ targetSeconds: bad, elapsedSeconds: 42, progress: 0.5 })
			expect(state.status).toBe('unknown')
			expect(state.driftSeconds).toBeNull()
			expect(Number.isFinite(state.remainingSeconds)).toBe(true)
		}
	})

	test('hysteresis: a small wobble does not flip a verdict that is already showing', () => {
		// Drift of 7s sits between the release band (4.8s) and the enter band (9.6s).
		const wobble = { targetSeconds: target, elapsedSeconds: 67, progress: 0.5 }
		expect(computePaceState({ ...wobble, previousStatus: 'behind' }).status).toBe('behind')
		expect(computePaceState({ ...wobble, previousStatus: 'on-track' }).status).toBe('on-track')
		// Once drift falls inside the release band the verdict does clear.
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 63, progress: 0.5, previousStatus: 'behind' }).status).toBe('on-track')
	})

	test('warning band opens near the end and closes once overtime', () => {
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 60, progress: 0.5 }).warning).toBe(false)
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 95, progress: 0.8 }).warning).toBe(true)
		expect(computePaceState({ targetSeconds: target, elapsedSeconds: 130, progress: 1 }).warning).toBe(false)
	})

	test('an hour-long target uses the same rules', () => {
		const hour = 3600
		expect(computePaceState({ targetSeconds: hour, elapsedSeconds: 1800, progress: 0.5 }).status).toBe('on-track')
		expect(computePaceState({ targetSeconds: hour, elapsedSeconds: 3450, progress: 0.95 }).warning).toBe(true)
		expect(computePaceState({ targetSeconds: hour, elapsedSeconds: 3400, progress: 0.95 }).warning).toBe(false)
	})
})

describe('resolveTarget', () => {
	test('override beats the note, the note beats the default', () => {
		expect(resolveTarget(300, '2:00', 600)).toEqual({ targetSeconds: 300, source: 'override' })
		expect(resolveTarget(null, '2:00', 600)).toEqual({ targetSeconds: 120, source: 'frontmatter' })
		expect(resolveTarget(null, null, 600)).toEqual({ targetSeconds: 600, source: 'default' })
	})

	test('a typo in one note falls through to the default instead of killing the clock', () => {
		expect(resolveTarget(null, 'daqui a pouco', 600)).toEqual({ targetSeconds: 600, source: 'default' })
		expect(resolveTarget(null, '2:75', 600)).toEqual({ targetSeconds: 600, source: 'default' })
	})

	test('nothing configured anywhere means no target, not a zero', () => {
		expect(resolveTarget(null, null, null)).toEqual({ targetSeconds: null, source: 'none' })
		expect(resolveTarget(0, '', 0)).toEqual({ targetSeconds: null, source: 'none' })
	})
})

describe('SpeechClock', () => {
	function fakeNow() {
		let t = 1_000_000
		return { now: () => t, advance: (ms: number) => { t += ms } }
	}

	test('accumulates across pause and resume', () => {
		const clock = fakeNow()
		const c = new SpeechClock(clock.now)
		c.start()
		clock.advance(10_000)
		c.pause()
		clock.advance(60_000) // silence while paused must not count
		c.resume()
		clock.advance(5_000)
		expect(c.elapsedSeconds).toBe(15)
	})

	test('pausing twice does not double-count', () => {
		const clock = fakeNow()
		const c = new SpeechClock(clock.now)
		c.start()
		clock.advance(4_000)
		c.pause()
		c.pause()
		expect(c.elapsedSeconds).toBe(4)
	})

	test('resume on a running clock is a no-op', () => {
		const clock = fakeNow()
		const c = new SpeechClock(clock.now)
		c.start()
		clock.advance(3_000)
		c.resume()
		clock.advance(2_000)
		expect(c.elapsedSeconds).toBe(5)
	})

	test('start discards previous time, reset clears everything', () => {
		const clock = fakeNow()
		const c = new SpeechClock(clock.now)
		c.start()
		clock.advance(30_000)
		c.start()
		clock.advance(1_000)
		expect(c.elapsedSeconds).toBe(1)
		c.reset()
		expect(c.elapsedSeconds).toBe(0)
		expect(c.isRunning).toBe(false)
	})

	test('a stage clock counts silence — elapsed grows with no activity at all', () => {
		const clock = fakeNow()
		const c = new SpeechClock(clock.now)
		c.start()
		clock.advance(120_000)
		expect(c.elapsedSeconds).toBe(120)
	})

	test('a snapshot rehydrates to the same elapsed time — this is what keeps the pop-out window in step', () => {
		const clock = fakeNow()
		const main = new SpeechClock(clock.now)
		main.start()
		clock.advance(42_000)

		const popout = SpeechClock.fromSnapshot(main.snapshot(), clock.now)
		expect(popout.elapsedMs).toBe(main.elapsedMs)
		expect(popout.isRunning).toBe(true)

		// Both keep ticking from the shared anchor, so they never drift apart.
		clock.advance(9_000)
		expect(popout.elapsedSeconds).toBe(main.elapsedSeconds)
	})

	test('a paused snapshot stays paused after rehydration', () => {
		const clock = fakeNow()
		const main = new SpeechClock(clock.now)
		main.start()
		clock.advance(10_000)
		main.pause()

		const popout = SpeechClock.fromSnapshot(main.snapshot(), clock.now)
		expect(popout.isRunning).toBe(false)
		clock.advance(30_000)
		expect(popout.elapsedSeconds).toBe(10)
		expect(popout.elapsedSeconds).toBe(main.elapsedSeconds)
	})
})
