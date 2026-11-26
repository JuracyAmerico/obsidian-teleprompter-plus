import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
	REACHED_TOLERANCE_PX,
	currentSection,
	findSection,
	holdAfterJump,
	sameSection,
	scrollTopForHeading,
	sectionAtReadingLine,
	sectionRef,
	type SectionHeading,
} from './sections'

// A STAR answer bank: every answer repeats the same four titles.
const star: SectionHeading[] = [
	{ id: 'header-0', text: 'Answers', line: 0 },
	{ id: 'header-1', text: 'Tell me about a conflict', line: 2 },
	{ id: 'header-2', text: 'Situation', line: 4 },
	{ id: 'header-3', text: 'Action', line: 8 },
	{ id: 'header-4', text: 'Tell me about a failure', line: 12 },
	{ id: 'header-5', text: 'Situation', line: 14 },
	{ id: 'header-6', text: 'Action', line: 18 },
]

/** The same note as another view renders it: other render ordinals, same lines. */
const otherView = star.map((h, i) => ({ ...h, id: `header-${i + 40}` }))

describe('section identity across views', () => {
	test('a repeated title resolves to its own heading, not the first one', () => {
		const ref = sectionRef(star, 5)
		expect(ref).toEqual({ line: 14, text: 'Situation', occurrence: 1 })
		expect(findSection(otherView, ref)).toBe(5)
		expect(findSection(otherView, sectionRef(star, 6))).toBe(6)
		expect(findSection(otherView, sectionRef(star, 2))).toBe(2)
	})

	test('every heading round-trips to itself', () => {
		star.forEach((_, i) => expect(findSection(otherView, sectionRef(star, i))).toBe(i))
	})

	test('a note edited above the heading: lines moved, the title occurrence still finds it', () => {
		const shifted = star.map(h => ({ ...h, line: h.line + 3 }))
		expect(findSection(shifted, sectionRef(star, 5))).toBe(5)
		expect(findSection(shifted, sectionRef(star, 3))).toBe(3)
	})

	test('an unlocated heading (-1) falls back to title and occurrence', () => {
		const unmapped = star.map(h => ({ ...h, line: -1 }))
		expect(findSection(unmapped, sectionRef(star, 6))).toBe(6)
		expect(findSection(star, { line: -1, text: 'Action', occurrence: 1 })).toBe(6)
	})

	test('the line only counts when it still holds the same title', () => {
		// Line 14 became another heading; the second "Situation" is still found by occurrence.
		const renamed = star.map(h => (h.line === 14 ? { ...h, text: 'Context' } : h))
		expect(findSection(renamed, { line: 14, text: 'Situation', occurrence: 1 })).toBe(-1)
		expect(findSection(renamed, { line: 14, text: 'Situation', occurrence: 0 })).toBe(2)
	})

	test('a bare line, a bare title, nothing', () => {
		expect(findSection(star, { line: 18 })).toBe(6)
		expect(findSection(star, { text: 'Action' })).toBe(3)
		expect(findSection(star, { text: 'Result' })).toBe(-1)
		expect(findSection(star, {})).toBe(-1)
		expect(findSection(star, null)).toBe(-1)
		expect(findSection(star, undefined)).toBe(-1)
		expect(findSection([], sectionRef(star, 2))).toBe(-1)
	})

	test('sectionRef out of range is null', () => {
		expect(sectionRef(star, 7)).toBeNull()
		expect(sectionRef(star, -1)).toBeNull()
		expect(sectionRef([], 0)).toBeNull()
	})

	test('sameSection tells two Situations apart', () => {
		expect(sameSection(sectionRef(star, 2), sectionRef(star, 5))).toBe(false)
		expect(sameSection(sectionRef(star, 5), sectionRef(otherView, 5))).toBe(true)
		expect(sameSection(null, null)).toBe(true)
		expect(sameSection(null, sectionRef(star, 0))).toBe(false)
	})
})

describe('the current section is measured at the eyeline', () => {
	// Heading tops in content pixels.
	const tops = [0, 400, 900, 1500]

	test('the last heading at or above the reading line', () => {
		expect(sectionAtReadingLine(tops, 0)).toBe(0)
		expect(sectionAtReadingLine(tops, 390)).toBe(0)
		expect(sectionAtReadingLine(tops, 400)).toBe(1)
		expect(sectionAtReadingLine(tops, 1200)).toBe(2)
		expect(sectionAtReadingLine(tops, 5000)).toBe(3)
	})

	test('the eyeline, not the top third: a heading in the top half is not yet being read at 50%', () => {
		// 600 px view scrolled to 0, eyeline at 50%: the reading line is 300. A heading at 250 is
		// above it and current; the old top-third rule (200) still showed the section before.
		const view = 600
		expect(sectionAtReadingLine([0, 250], 0 + view * 0.5)).toBe(1)
		expect(sectionAtReadingLine([0, 250], 0 + view / 3)).toBe(0)
	})

	test('a heading a pixel under the line after rounding still counts', () => {
		expect(sectionAtReadingLine(tops, 400 - REACHED_TOLERANCE_PX)).toBe(1)
		expect(sectionAtReadingLine(tops, 400 - REACHED_TOLERANCE_PX - 1)).toBe(0)
	})

	test('above every heading is -1; an unmeasured heading is skipped', () => {
		expect(sectionAtReadingLine([300, 700], 100)).toBe(-1)
		expect(sectionAtReadingLine([], 100)).toBe(-1)
		expect(sectionAtReadingLine([0, Number.NaN, 900], 950)).toBe(2)
		expect(sectionAtReadingLine([0, Number.NaN, 900], 500)).toBe(0)
	})
})

describe('a jump lands the heading on the eyeline', () => {
	test('heading top minus the eyeline offset', () => {
		expect(scrollTopForHeading(1500, 300, 4000)).toBe(1200)
	})

	test('clamped to the top and to the end of the script', () => {
		expect(scrollTopForHeading(100, 300, 4000)).toBe(0)
		expect(scrollTopForHeading(3900, 300, 3000)).toBe(3000)
		expect(scrollTopForHeading(500, 300, -10)).toBe(0)
	})

	test('a landed jump reads its own heading as current at the eyeline', () => {
		const tops = [0, 400, 900, 1500]
		const offset = 300
		for (let i = 0; i < tops.length; i++) {
			const scrollTop = scrollTopForHeading(tops[i], offset, 10_000)
			// Headings the top clamp keeps below the line are the first section's case only.
			const measured = sectionAtReadingLine(tops, scrollTop + offset)
			expect(Math.max(measured, 0)).toBe(i)
		}
	})
})

describe('a jump the end of the script cuts short holds its section', () => {
	test('no hold when the jump reached the eyeline', () => {
		expect(holdAfterJump(3, 3, 1200)).toBeNull()
	})

	test('the jumped-to section stays current while the reader has not moved', () => {
		const hold = holdAfterJump(3, 2, 3000)
		expect(currentSection(2, hold, 3000)).toEqual({ index: 3, hold })
	})

	test('scrolling back up drops the hold', () => {
		const hold = holdAfterJump(3, 2, 3000)
		expect(currentSection(2, hold, 2900)).toEqual({ index: 2, hold: null })
		// Rounding is not a move.
		expect(currentSection(2, hold, 3000 - REACHED_TOLERANCE_PX).index).toBe(3)
	})

	test('reaching another section drops the hold', () => {
		const hold = holdAfterJump(3, 2, 3000)
		expect(currentSection(1, hold, 3000)).toEqual({ index: 1, hold: null })
	})

	test('without a hold the measurement is the answer', () => {
		expect(currentSection(2, null, 0)).toEqual({ index: 2, hold: null })
		expect(currentSection(-1, null, 0)).toEqual({ index: -1, hold: null })
	})
})

describe('TeleprompterApp wiring', () => {
	const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
	const body = (from: string, to: string): string => {
		const start = app.indexOf(from)
		expect(start).toBeGreaterThan(-1)
		return app.slice(start, app.indexOf(to, start))
	}

	test('no section is matched by its title anywhere in the app', () => {
		expect(/h\.text === /.test(app)).toBe(false)
		expect(app.includes('currentVisibleHeader')).toBe(false)
	})

	test('the current section is measured at the eyeline, and the floating view reports a reference', () => {
		const update = body('function updateCurrentVisibleHeader(', 'function contentTopOf(')
		expect(update.includes('sectionAtReadingLine(headingTops(headerList), scrollTop + readingOffset())')).toBe(true)
		expect(update.includes('plugin.floatingSession.reportSection(ref)')).toBe(true)
		expect(update.includes('clientHeight / 3')).toBe(false)
	})

	test('a jump lands its heading on the eyeline', () => {
		const jump = body('function jumpToHeader(', 'async function startTTSFromSection(')
		expect(jump.includes('scrollTopForHeading(')).toBe(true)
		expect(jump.includes('readingOffset(),')).toBe(true)
		expect(jump.includes('offsetTop - 50')).toBe(false)
	})

	test('the main view follows the floating section by reference', () => {
		expect(body('function followFloatingSection(', 'function reportFloatingPosition(').includes('findSection(list, section)')).toBe(true)
	})
})
