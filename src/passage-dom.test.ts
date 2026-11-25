import { describe, expect, test } from 'bun:test'
import { buildLineTable, lineY, positionAtY, SMOOTHING_WORDS, yAtPosition, type LineTable, type WordBox } from './passage-dom'

/** Word boxes for a script laid out `perLine[i]` words to a line, one line every `pitch` pixels. */
function layout(perLine: number[], pitch: number, glyph = pitch * 0.7): WordBox[] {
	const boxes: WordBox[] = []
	perLine.forEach((count, line) => {
		for (let i = 0; i < count; i++) boxes.push({ top: line * pitch, bottom: line * pitch + glyph })
	})
	return boxes
}

const repeat = (count: number, value: number): number[] => Array.from({ length: count }, () => value)

/** The main view's y for each pixel of floating eyeline from `from` to `to`, 1 px a frame. */
function glide(floating: LineTable, main: LineTable, from: number, to: number): number[] {
	const ys: number[] = []
	for (let y = from; y <= to; y++) ys.push(yAtPosition(main, positionAtY(floating, y)))
	return ys
}

function largestStep(ys: number[]): number {
	let largest = 0
	for (let i = 1; i < ys.length; i++) largest = Math.max(largest, Math.abs(ys[i] - ys[i - 1]))
	return largest
}

/** The fractional word really at `y`, by straight per-line interpolation (the inverse of lineY). */
function wordReallyAt(table: LineTable, y: number): number {
	let low = table.firstWord[0]
	let high = table.firstWord[table.firstWord.length - 1]
	for (let step = 0; step < 60; step++) {
		const middle = (low + high) / 2
		if (lineY(table, middle) < y) low = middle
		else high = middle
	}
	return low
}

describe('ISC-142: line table', () => {
	test('groups words into lines and ends with a sentinel', () => {
		const table = buildLineTable(layout([3, 4, 2], 68))
		expect(table.firstWord).toEqual([0, 3, 7, 9])
		expect(table.top).toEqual([0, 68, 136, 136 + 68 * 0.7])
	})

	test('a superscript or a larger word stays on its line', () => {
		const boxes: WordBox[] = [
			{ top: 0, bottom: 40 },
			{ top: -6, bottom: 20 }, // superscript
			{ top: -10, bottom: 48 }, // bigger font on the same line
			{ top: 68, bottom: 108 },
		]
		expect(buildLineTable(boxes).firstWord).toEqual([0, 3, 4])
	})

	test('lines whose glyph boxes overlap (tight line height) still split', () => {
		expect(buildLineTable(layout([2, 2], 40, 46)).firstWord).toEqual([0, 2, 4])
	})

	test('a table cell that starts higher never makes y run backwards', () => {
		const boxes: WordBox[] = [
			{ top: 0, bottom: 40 },
			{ top: 68, bottom: 108 }, // first cell wrapped
			{ top: 0, bottom: 40 }, // next cell, back at the row top
			{ top: 136, bottom: 176 },
		]
		const table = buildLineTable(boxes)
		expect(table.firstWord).toEqual([0, 1, 3, 4])
		for (let i = 1; i < table.top.length; i++) expect(table.top[i]).toBeGreaterThan(table.top[i - 1])
	})

	test('hidden words have no line, and an all-hidden or empty script has no table', () => {
		const boxes: WordBox[] = [{ top: 0, bottom: 0 }, { top: 0, bottom: 40 }, { top: 68, bottom: 108 }]
		expect(buildLineTable(boxes).firstWord).toEqual([1, 2, 3])
		expect(buildLineTable([{ top: 0, bottom: 0 }])).toEqual({ firstWord: [], top: [], area: [] })
		const empty = buildLineTable([])
		expect(positionAtY(empty, 100)).toBe(0)
		expect(yAtPosition(empty, 5)).toBe(0)
		expect(lineY(empty, 5)).toBe(0)
	})

	test('lineY runs straight between line starts and is exact at each', () => {
		const table = buildLineTable(layout([4, 6, 3, 5], 68))
		expect(lineY(table, 0)).toBe(0)
		expect(lineY(table, 2)).toBe(34)
		expect(lineY(table, 4)).toBe(68)
		expect(lineY(table, 7)).toBe(102)
		expect(lineY(table, -3)).toBe(0)
		expect(lineY(table, Number.NaN)).toBe(0)
		expect(lineY(table, 99)).toBe(table.top[table.top.length - 1])
	})
})

describe('ISC-142: smoothed fractional position', () => {
	const table = buildLineTable(layout([4, 6, 3, 5, 7, 2, 6, 5], 68))
	const words = table.firstWord[table.firstWord.length - 1]

	test('on evenly wrapped text the smoothing changes nothing away from the ends', () => {
		const even = buildLineTable(layout(repeat(20, 5), 68))
		// The last line ends at its glyph bottom, not a full pitch on, so stop a window short of it.
		for (let p = SMOOTHING_WORDS; p <= 95 - SMOOTHING_WORDS; p += 0.5) {
			expect(yAtPosition(even, p)).toBeCloseTo((68 / 5) * p, 9)
		}
	})

	test('is strictly increasing over the script and each function inverts the other', () => {
		let previous = Number.NEGATIVE_INFINITY
		for (let p = 0; p <= words; p += 0.125) {
			const y = yAtPosition(table, p)
			expect(y).toBeGreaterThan(previous)
			previous = y
			expect(positionAtY(table, y)).toBeCloseTo(p, 6)
		}
	})

	test('clamps outside the script and survives NaN', () => {
		expect(positionAtY(table, -500)).toBe(0)
		expect(positionAtY(table, Number.NaN)).toBe(0)
		expect(positionAtY(table, 1e6)).toBe(words)
		expect(yAtPosition(table, -10)).toBe(yAtPosition(table, 0))
		expect(yAtPosition(table, Number.NaN)).toBe(yAtPosition(table, 0))
		expect(yAtPosition(table, words + 10)).toBe(yAtPosition(table, words))
	})

	test('stays within half a line of the exact line position', () => {
		for (let p = 0; p <= words; p += 0.25) {
			expect(Math.abs(yAtPosition(table, p) - lineY(table, p))).toBeLessThan(68 / 2)
		}
	})
})

describe('ISC-142: two views that wrap differently', () => {
	// Same 60 words; the floating view wraps 6 to a line at 50 px, the main view 4 to 7 at 68 px.
	const floating = buildLineTable(layout(repeat(10, 6), 50))
	const main = buildLineTable(layout([5, 7, 4, 6, 7, 5, 6, 4, 7, 5, 4], 68))

	test('one pixel a frame in the floating view glides in the main view, never backwards', () => {
		const ys = glide(floating, main, 0, 500)
		for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1])
		// The average is 68 * 11 / (50 * 10) = 1.5 px a pixel; a whole-line jump would be 68.
		expect(largestStep(ys)).toBeLessThan(2.5)
	})

	test('the word at the floating eyeline sits at the main eyeline, within half a main line', () => {
		for (let y = 0; y <= 500; y++) {
			const mainY = yAtPosition(main, positionAtY(floating, y))
			expect(Math.abs(mainY - lineY(main, wordReallyAt(floating, y)))).toBeLessThan(68 / 2)
		}
	})

	test('a word left alone on a main line (the 6 px step measured live) stays under 4 px a frame', () => {
		// Main: one word wrapped onto a line of its own mid-paragraph; floating: full lines.
		const lone = buildLineTable(layout([6, 6, 1, 5, 6, 6, 6, 6, 6, 6, 6], 68))
		const ys = glide(floating, lone, 0, 500)
		// Without smoothing that line runs 68 px for one word: 68 * 6 / 50 = 8.2 px a frame.
		expect(largestStep(ys)).toBeLessThan(4)
		let unsmoothed = 0
		for (let y = 1; y <= 500; y++) {
			unsmoothed = Math.max(unsmoothed, lineY(lone, wordReallyAt(floating, y)) - lineY(lone, wordReallyAt(floating, y - 1)))
		}
		expect(unsmoothed).toBeGreaterThan(8)
	})
})
