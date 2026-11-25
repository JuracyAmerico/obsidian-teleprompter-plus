import { describe, expect, test } from 'bun:test'
import { followScrollTop, mayFollow, progressLine, visibleActiveId, MANUAL_PAUSE_MS } from './nav-follow'

const headers = [
	{ id: 'h0' }, // # Title
	{ id: 'h1', parentId: 'h0' }, // ## Warm-up
	{ id: 'h2', parentId: 'h1' }, // ### TH
	{ id: 'h3', parentId: 'h1' }, // ### Final L
	{ id: 'h4', parentId: 'h0' }, // ## Opening
	{ id: 'h5', parentId: 'h0' }, // ## Cloud
]

describe('ISC-134 visibleActiveId', () => {
	test('the current section itself when nothing is collapsed', () => {
		expect(visibleActiveId(headers, 5, new Set())).toBe('h5')
		expect(visibleActiveId(headers, 3, new Set())).toBe('h3')
	})
	test('a section hidden in a collapsed parent highlights that parent', () => {
		expect(visibleActiveId(headers, 3, new Set(['h1']))).toBe('h1')
	})
	test('the outermost collapsed ancestor wins', () => {
		expect(visibleActiveId(headers, 3, new Set(['h0', 'h1']))).toBe('h0')
	})
	test('a collapsed current section is still itself', () => {
		expect(visibleActiveId(headers, 1, new Set(['h1']))).toBe('h1')
	})
	test('out of range gives null', () => {
		expect(visibleActiveId(headers, 9, new Set())).toBeNull()
		expect(visibleActiveId([], 0, new Set())).toBeNull()
	})
})

describe('ISC-134 followScrollTop', () => {
	const base = { itemHeight: 30, viewHeight: 300, contentHeight: 1200, scrollTop: 0 }
	test('puts the item a third from the top', () => {
		// centre of item at 615, a third of 300 is 100: scrollTop 515
		expect(followScrollTop({ ...base, itemTop: 600 })).toBe(515)
	})
	test('never scrolls above the top', () => {
		expect(followScrollTop({ ...base, itemTop: 20, scrollTop: 200 })).toBe(0)
	})
	test('never scrolls past the end', () => {
		expect(followScrollTop({ ...base, itemTop: 1180 })).toBe(900)
	})
	test('no move when already there, so the list does not twitch', () => {
		expect(followScrollTop({ ...base, itemTop: 600, scrollTop: 513 })).toBeNull()
	})
	test('a list that fits needs no scroll', () => {
		expect(followScrollTop({ itemTop: 100, itemHeight: 30, viewHeight: 300, contentHeight: 250, scrollTop: 0 })).toBeNull()
	})
})

describe('ISC-134 manual pause', () => {
	test('holds for five seconds after a manual scroll, then follows', () => {
		expect(MANUAL_PAUSE_MS).toBe(5000)
		expect(mayFollow(10_000, 6_000)).toBe(false)
		expect(mayFollow(11_000, 6_000)).toBe(true)
		expect(mayFollow(10_000, 0)).toBe(true)
	})
})

describe('ISC-135 progressLine', () => {
	test('all three parts', () => {
		expect(progressLine(67, 3.2, 1230)).toBe('67% · ~3 min · 1,230 words')
	})
	test('under a minute', () => {
		expect(progressLine(98, 0.4, 1230)).toBe('98% · < 1 min · 1,230 words')
	})
	test('time hidden and no words', () => {
		expect(progressLine(0, null, 0)).toBe('0%')
	})
})
