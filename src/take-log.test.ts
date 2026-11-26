import { describe, expect, test } from 'bun:test'
import {
	RECENT_TAKES,
	appendTake,
	bestTakes,
	formatTakeDate,
	isBestTake,
	isDuplicateTake,
	parseTakeLog,
	recentTakes,
	renameTakeNote,
	serializeTakeLog,
	type TakeLogEntry,
} from './take-log'

const NOTE = 'Interviews/Acme.md'

function take(overrides: Partial<TakeLogEntry> = {}): TakeLogEntry {
	return {
		notePath: NOTE,
		kind: 'section',
		section: 'Why us',
		durationSeconds: 100,
		targetSeconds: 90,
		date: '2026-11-26T14:00:00.000Z',
		...overrides,
	}
}

/** A take `minutes` after 14:00. */
const atMinute = (minutes: number, overrides: Partial<TakeLogEntry> = {}) =>
	take({ date: new Date(Date.parse('2026-11-26T14:00:00.000Z') + minutes * 60_000).toISOString(), ...overrides })

describe('parseTakeLog', () => {
	test('round-trips what serializeTakeLog wrote', () => {
		const takes = [take(), atMinute(1, { kind: 'script', section: 'Whole script', targetSeconds: null })]
		expect(parseTakeLog(serializeTakeLog(takes))).toEqual(takes)
	})

	test('missing, empty, broken or foreign text is an empty log, never a throw', () => {
		for (const raw of [null, undefined, '', '{', 'null', '[]', '{"takes": 3}', '"text"']) {
			expect(parseTakeLog(raw)).toEqual([])
		}
	})

	test('keeps every readable entry and drops the broken ones', () => {
		const raw = JSON.stringify({
			version: 1,
			takes: [
				take(),
				{ ...take(), durationSeconds: -1 },
				{ ...take(), targetSeconds: 0 },
				{ ...take(), date: 'yesterday' },
				{ ...take(), kind: 'lap' },
				{ ...take(), notePath: '' },
				null,
				atMinute(2),
			],
		})
		expect(parseTakeLog(raw)).toEqual([take(), atMinute(2)])
	})

	test('drops fields it does not know', () => {
		const raw = JSON.stringify({ takes: [{ ...take(), extra: 'x' }] })
		expect(parseTakeLog(raw)[0]).toEqual(take())
	})
})

describe('appendTake', () => {
	test('appends and never mutates the log it was given', () => {
		const log = [take()]
		const next = appendTake(log, atMinute(1))
		expect(next).toEqual([take(), atMinute(1)])
		expect(log).toEqual([take()])
	})

	test('keeps the newest entries past the limit', () => {
		let log: TakeLogEntry[] = []
		for (let i = 0; i < 5; i++) log = appendTake(log, atMinute(i, { durationSeconds: i }), 3)
		expect(log.map(entry => entry.durationSeconds)).toEqual([2, 3, 4])
	})

	test('the same take from a second window is recorded once', () => {
		const first = take()
		const echo = take({ durationSeconds: 101, date: '2026-11-26T14:00:03.000Z' })
		expect(isDuplicateTake([first], echo)).toBe(true)
		expect(appendTake([first], echo)).toEqual([first])
	})

	test('a real second take of the same section is not a duplicate', () => {
		expect(isDuplicateTake([take()], atMinute(2))).toBe(false)
		expect(isDuplicateTake([take()], take({ durationSeconds: 140 }))).toBe(false)
		expect(isDuplicateTake([take()], take({ notePath: 'Other.md' }))).toBe(false)
	})

	test('an invalid entry is not appended', () => {
		expect(appendTake([take()], take({ durationSeconds: Number.NaN }))).toEqual([take()])
	})
})

describe('recentTakes', () => {
	test('the last 20 takes of the note, newest first, other notes left out', () => {
		let log: TakeLogEntry[] = []
		for (let i = 0; i < 30; i++) log = appendTake(log, atMinute(i, { durationSeconds: i }))
		log = appendTake(log, atMinute(40, { notePath: 'Other.md' }))
		const recent = recentTakes(log, NOTE)
		expect(recent.length).toBe(RECENT_TAKES)
		expect(recent[0].durationSeconds).toBe(29)
		expect(recent[19].durationSeconds).toBe(10)
		expect(recent.every(entry => entry.notePath === NOTE)).toBe(true)
	})

	test('orders by date, not by position in the file', () => {
		const log = [atMinute(5, { durationSeconds: 5 }), atMinute(1, { durationSeconds: 1 }), atMinute(9, { durationSeconds: 9 })]
		expect(recentTakes(log, NOTE).map(entry => entry.durationSeconds)).toEqual([9, 5, 1])
	})

	test('a note with no takes has an empty list', () => {
		expect(recentTakes([take()], 'Nothing.md')).toEqual([])
	})
})

describe('bestTakes', () => {
	test('the best take of each section is the one closest to its target, over or under', () => {
		const log = [
			atMinute(0, { durationSeconds: 110 }),
			atMinute(1, { durationSeconds: 86 }),
			atMinute(2, { durationSeconds: 97 }),
			atMinute(3, { section: 'Closing', durationSeconds: 70, targetSeconds: 60 }),
		]
		const best = bestTakes(log, NOTE)
		expect(best.get('section\u0000Why us')).toBe(log[1])
		expect(best.get('section\u0000Closing')).toBe(log[3])
		expect(isBestTake(best, log[1])).toBe(true)
		expect(isBestTake(best, log[0])).toBe(false)
	})

	test('a tie goes to the newer take', () => {
		const log = [atMinute(0, { durationSeconds: 95 }), atMinute(1, { durationSeconds: 85 })]
		expect(bestTakes(log, NOTE).get('section\u0000Why us')).toBe(log[1])
	})

	test('a section never timed against a target has no best', () => {
		expect(bestTakes([take({ targetSeconds: null })], NOTE).size).toBe(0)
	})

	test('the whole script and a section that happens to share its name are kept apart', () => {
		const log = [take({ section: 'Whole script' }), take({ kind: 'script', section: 'Whole script', date: '2026-11-26T15:00:00.000Z' })]
		expect(bestTakes(log, NOTE).size).toBe(2)
	})

	test('the best is chosen over the whole history, even when it is older than the 20 shown', () => {
		let log: TakeLogEntry[] = [atMinute(0, { durationSeconds: 90 })]
		for (let i = 1; i <= 25; i++) log = appendTake(log, atMinute(i, { durationSeconds: 120 }))
		const best = bestTakes(log, NOTE)
		expect(recentTakes(log, NOTE).some(entry => isBestTake(best, entry))).toBe(false)
		expect(isBestTake(best, log[0])).toBe(true)
	})
})

describe('renameTakeNote', () => {
	test('takes follow a renamed note', () => {
		expect(renameTakeNote([take(), take({ notePath: 'Other.md' })], NOTE, 'Interviews/Acme 2.md')).toEqual([
			take({ notePath: 'Interviews/Acme 2.md' }),
			take({ notePath: 'Other.md' }),
		])
	})

	test('takes follow a renamed folder, and a sibling folder with a longer name is left alone', () => {
		const log = [take(), take({ notePath: 'Interviews Old/X.md' })]
		expect(renameTakeNote(log, 'Interviews', 'Jobs/Interviews')?.map(entry => entry.notePath)).toEqual([
			'Jobs/Interviews/Acme.md',
			'Interviews Old/X.md',
		])
	})

	test('nothing to rename returns null, so the file is not rewritten', () => {
		expect(renameTakeNote([take()], 'Other.md', 'New.md')).toBeNull()
		expect(renameTakeNote([take()], NOTE, NOTE)).toBeNull()
	})
})

describe('formatTakeDate', () => {
	test('a readable date, and an empty string for a bad one', () => {
		expect(formatTakeDate('2026-11-26T14:05:00.000Z', 'en-US')).toMatch(/Nov 26/)
		expect(formatTakeDate('not a date')).toBe('')
	})
})
