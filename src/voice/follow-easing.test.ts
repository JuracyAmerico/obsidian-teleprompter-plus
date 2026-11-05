import { describe, expect, test } from 'bun:test'
import { followShare, REFERENCE_FRAME_MS } from './follow-easing'

function framesToReach(share: number, hz: number, factor: number): number {
	let remaining = 1
	let frames = 0
	while (remaining > 1 - share && frames < 10000) {
		remaining *= 1 - followShare(factor, 1000 / hz)
		frames++
	}
	return frames
}

describe('ISC-130 voice follow glide is the same length at any refresh rate', () => {
	test('a 60 Hz frame moves exactly the configured share', () => {
		expect(followShare(0.16, REFERENCE_FRAME_MS)).toBeCloseTo(0.16, 10)
	})

	test('reaching 95% of the way takes the same time at 60 Hz and 120 Hz', () => {
		const ms60 = framesToReach(0.95, 60, 0.16) * (1000 / 60)
		const ms120 = framesToReach(0.95, 120, 0.16) * (1000 / 120)
		expect(Math.abs(ms60 - ms120)).toBeLessThan(1000 / 60)
	})

	test('a long stalled frame cannot leap the whole way, and bad input stays in range', () => {
		expect(followShare(0.16, 5000)).toBeLessThan(0.6)
		expect(followShare(2, 16)).toBeLessThanOrEqual(1)
		expect(followShare(-1, 16)).toBe(0)
	})
})
