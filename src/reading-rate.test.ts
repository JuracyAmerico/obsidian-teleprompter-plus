import { describe, expect, test } from 'bun:test'
import { buildLineTable } from './passage-dom'
import {
	densityOfLines,
	formatWordsPerMinute,
	speedToWordsPerMinute,
	wordsInDistance,
	wordsPerMinuteToSpeed,
	wordsPerPixel,
} from './reading-rate'

describe('words per pixel', () => {
	test('words over height; nothing to measure is null, never NaN or Infinity', () => {
		expect(wordsPerPixel(300, 1500)).toBe(0.2)
		expect(wordsPerPixel(0, 1500)).toBeNull()
		expect(wordsPerPixel(300, 0)).toBeNull()
		expect(wordsPerPixel(Number.NaN, 10)).toBeNull()
		expect(wordsPerPixel(10, Number.POSITIVE_INFINITY)).toBeNull()
	})

	test('density of a rendered line table: first line top to last line bottom', () => {
		// Ten lines of five words, 40 px apart: 50 words over 400 px.
		const boxes = Array.from({ length: 50 }, (_, i) => {
			const line = Math.floor(i / 5)
			return { top: line * 40, bottom: line * 40 + 30 }
		})
		expect(densityOfLines(buildLineTable(boxes))).toBeCloseTo(50 / 390, 10)
		expect(densityOfLines(buildLineTable([]))).toBeNull()
	})
})

describe('speed and words per minute', () => {
	test('speed 1 is 10 px/s; at 0.2 words per pixel that is 120 words a minute', () => {
		expect(speedToWordsPerMinute(1, 0.2)).toBeCloseTo(120, 10)
		expect(speedToWordsPerMinute(2.5, 0.2)).toBeCloseTo(300, 10)
	})

	test('the two conversions undo each other', () => {
		for (const speed of [0.5, 1, 2.5, 7.25]) {
			const wpm = speedToWordsPerMinute(speed, 0.137)
			expect(wordsPerMinuteToSpeed(wpm ?? 0, 0.137)).toBeCloseTo(speed, 10)
		}
	})

	test('unknown density gives null, so the toolbar shows no number rather than a wrong one', () => {
		expect(speedToWordsPerMinute(2, null)).toBeNull()
		expect(wordsPerMinuteToSpeed(150, 0)).toBeNull()
		expect(speedToWordsPerMinute(Number.NaN, 0.2)).toBeNull()
	})

	test('formatting rounds to whole words and is empty when unknown', () => {
		expect(formatWordsPerMinute(147.6)).toBe('148 wpm')
		expect(formatWordsPerMinute(null)).toBe('')
	})

	test('words in a distance', () => {
		expect(wordsInDistance(650, 0.2)).toBe(130)
		expect(wordsInDistance(650, null)).toBeNull()
		expect(wordsInDistance(-1, 0.2)).toBeNull()
	})
})
