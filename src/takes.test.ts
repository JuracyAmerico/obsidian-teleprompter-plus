import { describe, expect, test } from 'bun:test'
import { DEFAULT_SPEED_LIMITS } from './playback'
import {
	SCRIPT_TAKE_TITLE,
	TakeTracker,
	formatTakeLine,
	formatTakeTime,
	isSectionStopMode,
	locateSection,
	loggableTakes,
	planFit,
	READING_STEP_VIEW_SHARE,
	readingFrame,
	scoreTake,
	scriptEndCard,
	sectionIndexAt,
	shouldStopAtSectionEnd,
	speedForPlan,
	takeCard,
	voiceReachedScriptEnd,
	type TakeFrame,
	type TakeSection,
} from './takes'

/**
 * A script with a line of text above the first heading and three sections, each 1000 px tall.
 * The view is 800 px with the eyeline at 400 px; a section jump puts the heading 50 px below the
 * top of the view, as jumpToHeader does.
 */
const sections: TakeSection[] = [
	{ title: 'Intro', top: 100, targetSeconds: null },
	{ title: 'Why us', top: 1100, targetSeconds: 90 },
	{ title: 'Closing', top: 2100, targetSeconds: 60 },
]
const EYELINE = 400

/** The frame at a scroll position and a clock reading. */
function at(scrollTop: number, seconds: number, list: TakeSection[] = sections): TakeFrame {
	return { sections: list, viewTop: scrollTop, readingLine: scrollTop + EYELINE, elapsedMs: seconds * 1000 }
}

/** Scroll position after a jump to a section, as jumpToHeader places it. */
const jumpTo = (index: number) => sections[index].top - 50

describe('where the reader is', () => {
	test('sectionIndexAt: the last heading at or above the line; -1 before the first', () => {
		expect(sectionIndexAt(sections, 50)).toBe(-1)
		expect(sectionIndexAt(sections, 100)).toBe(0)
		expect(sectionIndexAt(sections, 1500)).toBe(1)
		expect(sectionIndexAt(sections, 99_999)).toBe(2)
		expect(sectionIndexAt([], 500)).toBe(-1)
	})

	test('after a section jump the jumped-to section starts at its top, though the eyeline is below its heading', () => {
		expect(locateSection(sections, at(jumpTo(1), 0))).toEqual({ index: 1, atStart: true })
	})

	test('at the very top the first section starts at its top', () => {
		expect(locateSection(sections, at(0, 0))).toEqual({ index: 0, atStart: true })
	})

	test('with the heading scrolled off the top, the reader is inside the section, not at its start', () => {
		expect(locateSection(sections, at(1300, 0))).toEqual({ index: 1, atStart: false })
	})

	test('a short section whose next heading is also above the eyeline: the topmost visible heading is the start', () => {
		const short: TakeSection[] = [
			{ title: 'A', top: 100, targetSeconds: null },
			{ title: 'B', top: 300, targetSeconds: null },
			{ title: 'C', top: 2000, targetSeconds: null },
		]
		expect(locateSection(short, at(50, 0, short))).toEqual({ index: 0, atStart: true })
	})
})

describe('when a section end stops playback', () => {
	test('targeted (default) stops only where the section has a target', () => {
		expect(shouldStopAtSectionEnd('targeted', 90)).toBe(true)
		expect(shouldStopAtSectionEnd('targeted', null)).toBe(false)
	})

	test('always stops, never never stops', () => {
		expect(shouldStopAtSectionEnd('always', null)).toBe(true)
		expect(shouldStopAtSectionEnd('never', 90)).toBe(false)
	})

	test('isSectionStopMode accepts the three modes only', () => {
		expect(['targeted', 'always', 'never'].every(isSectionStopMode)).toBe(true)
		expect(isSectionStopMode('sometimes')).toBe(false)
		expect(isSectionStopMode(undefined)).toBe(false)
	})
})

describe('TakeTracker: a take of one section', () => {
	test('jump to a section, play: the take ends when the next heading reaches the eyeline', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(jumpTo(1), 0))
		// Next heading (2100) still below the eyeline (scrollTop + 400).
		expect(tracker.step(at(1600, 50), 'targeted')).toBeNull()
		expect(tracker.step(at(1699, 101), 'targeted')).toBeNull()
		const end = tracker.step(at(1700, 102), 'targeted')
		expect(end).toEqual({
			result: { kind: 'section', title: 'Why us', durationSeconds: 102, targetSeconds: 90, complete: true },
			stop: true,
		})
	})

	test('a section with no target ends with a take but does not stop in the default mode', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		const end = tracker.step(at(700, 40), 'targeted')
		expect(end?.result).toMatchObject({ title: 'Intro', durationSeconds: 40, complete: true })
		expect(end?.stop).toBe(false)
	})

	test('stopping at a section end and playing again times the next section from its heading', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(jumpTo(1), 0))
		expect(tracker.step(at(1700, 100), 'targeted')?.stop).toBe(true)
		// Paused for a while: the rehearsal clock does not count, so it still reads 100 s.
		tracker.begin(at(1700, 100))
		expect(tracker.currentSection).toBe(2)
		const end = tracker.finish(at(2200, 160), 300)
		expect(end.section).toEqual({ kind: 'section', title: 'Closing', durationSeconds: 60, targetSeconds: 60, complete: true })
	})

	test('a pause inside a section keeps the take: the clock does not count paused time', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(jumpTo(1), 0))
		tracker.step(at(1300, 30), 'targeted')
		tracker.begin(at(1300, 30)) // resumed exactly where it paused
		expect(tracker.step(at(1700, 95), 'targeted')?.result).toMatchObject({ durationSeconds: 95, complete: true })
	})

	test('resumesAt says whether a play from here carries on the open take', () => {
		const tracker = new TakeTracker()
		expect(tracker.resumesAt(0)).toBe(false)
		tracker.begin(at(jumpTo(1), 0))
		tracker.step(at(1300, 30), 'targeted')
		expect(tracker.resumesAt(1301)).toBe(true)
		expect(tracker.resumesAt(1400)).toBe(false)
	})

	test('moved while paused (a hand scroll): the open take is dropped and the new one is partial', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(jumpTo(1), 0))
		tracker.step(at(1300, 30), 'targeted')
		tracker.begin(at(1500, 30))
		expect(tracker.step(at(1700, 50), 'targeted')?.result).toMatchObject({ durationSeconds: 20, complete: false })
	})

	test('playing from inside a section gives a partial take, which is shown but not logged', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(1300, 0))
		const end = tracker.step(at(1700, 45), 'targeted')
		expect(end?.result?.complete).toBe(false)
		expect(end?.stop).toBe(true)
		expect(loggableTakes([end?.result ?? null])).toEqual([])
	})

	test('text before the first heading is not a section: crossing into the first heading reports no take', () => {
		const tracker = new TakeTracker()
		const withPreamble: TakeSection[] = [{ title: 'Only', top: 900, targetSeconds: 30 }]
		tracker.begin(at(0, 0, withPreamble))
		expect(tracker.currentSection).toBe(-1)
		expect(tracker.step(at(500, 20, withPreamble), 'always')).toEqual({ result: null, stop: false })
		expect(tracker.currentSection).toBe(0)
	})

	test('a frame that skips over a whole section reports only the first; the skipped one gets no take', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		const end = tracker.step(at(1800, 10), 'never') // wheel-scrolled past Intro and Why us at once
		expect(end?.result?.title).toBe('Intro')
		expect(tracker.currentSection).toBe(2)
		// Landed 100 px into Closing: not read from its top either.
		expect(tracker.finish(at(2300, 20), null).section?.complete).toBe(false)
	})

	test('a heading crossed live (a frame or two past the eyeline) starts a whole take', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		tracker.step(at(705, 40), 'never') // Why us heading 5 px past the eyeline
		expect(tracker.sectionElapsedSeconds(40_000)).toBe(0)
		expect(tracker.step(at(1701, 130), 'never')?.result).toMatchObject({ title: 'Why us', durationSeconds: 90, complete: true })
	})

	test('a single frame that lands far past the next heading starts a partial take', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		expect(tracker.step(at(1000, 10), 'never')?.result?.title).toBe('Intro') // 300 px into Why us
		expect(tracker.step(at(1700, 60), 'never')?.result).toMatchObject({ title: 'Why us', complete: false })
	})

	test('a section so short that the next heading starts above the eyeline ends when it reaches the top', () => {
		const short: TakeSection[] = [
			{ title: 'A', top: 100, targetSeconds: 10 },
			{ title: 'B', top: 300, targetSeconds: null },
			{ title: 'C', top: 3000, targetSeconds: null },
		]
		const tracker = new TakeTracker()
		tracker.begin(at(50, 0, short))
		expect(tracker.step(at(100, 5, short), 'targeted')).toBeNull()
		expect(tracker.step(at(300, 12, short), 'targeted')).toEqual({
			result: { kind: 'section', title: 'A', durationSeconds: 12, targetSeconds: 10, complete: true },
			stop: true,
		})
	})

	test('discard drops everything open', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		tracker.discard()
		expect(tracker.isActive).toBe(false)
		expect(tracker.step(at(700, 10), 'always')).toBeNull()
		expect(tracker.finish(at(2300, 20), 60)).toEqual({ section: null, script: null })
	})
})

describe('TakeTracker: a take of the whole script', () => {
	test('played from the very top to the end: the whole script is a take against the script target', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		tracker.step(at(700, 40), 'never')
		tracker.step(at(1700, 130), 'never')
		const end = tracker.finish(at(2300, 200), 180)
		expect(end.script).toEqual({ kind: 'script', title: SCRIPT_TAKE_TITLE, durationSeconds: 200, targetSeconds: 180, complete: true })
		expect(end.section).toMatchObject({ title: 'Closing', durationSeconds: 70 })
		expect(scriptEndCard(end)).toBe(end.script)
	})

	test('stops at targeted sections on the way do not break the whole-script take', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		tracker.step(at(700, 40), 'targeted')
		expect(tracker.step(at(1700, 130), 'targeted')?.stop).toBe(true)
		tracker.begin(at(1700, 130))
		expect(tracker.finish(at(2300, 190), 180).script?.durationSeconds).toBe(190)
	})

	test('a run that did not start at the top has no whole-script take; the card shows the last section', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(jumpTo(2), 0))
		const end = tracker.finish(at(2300, 58), 180)
		expect(end.script).toBeNull()
		expect(scriptEndCard(end)).toEqual({ kind: 'section', title: 'Closing', durationSeconds: 58, targetSeconds: 60, complete: true })
	})

	test('no script target: the whole-script take still has its time, with no target', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0))
		expect(tracker.finish(at(2300, 200), null).script?.targetSeconds).toBeNull()
	})

	test('a script with no headings is still a whole-script take', () => {
		const tracker = new TakeTracker()
		tracker.begin(at(0, 0, []))
		expect(tracker.finish(at(900, 75, []), 60)).toEqual({
			section: null,
			script: { kind: 'script', title: SCRIPT_TAKE_TITLE, durationSeconds: 75, targetSeconds: 60, complete: true },
		})
	})
})

/**
 * Voice tracking and read-aloud report a place, not a frame: the top of the word just heard, or of
 * the sentence being read. In these tests the page follows that place the way each one scrolls:
 * voice keeps the word 160 px below the top of the 800 px view, read-aloud puts the sentence on the
 * eyeline (400 px). Headings are 80 px tall, so the first line of a section is 80 px under it.
 */
const VIEW_HEIGHT = 800
const VOICE_ANCHOR = 160

/** Voice committed a word at content y `place`, the clock reading `seconds`. */
function heard(place: number, seconds: number, viewTop = Math.max(0, place - VOICE_ANCHOR)): TakeFrame {
	return readingFrame({ sections, readingLine: place, viewTop, viewHeight: VIEW_HEIGHT, elapsedMs: seconds * 1000 })
}

/** Read-aloud started the sentence whose block starts at content y `place`. */
function spoken(place: number, seconds: number): TakeFrame {
	return readingFrame({ sections, readingLine: place, viewTop: Math.max(0, place - EYELINE), viewHeight: VIEW_HEIGHT, elapsedMs: seconds * 1000 })
}

describe('a reported place is a frame with a reading step', () => {
	test('the reading line is the place; the view top is the page the reader sees', () => {
		expect(heard(1260, 12, 1020)).toEqual({ sections, readingLine: 1260, viewTop: 1020, elapsedMs: 12_000, liveCrossingPx: 400 })
	})

	test('a heading half a view past the place still counts as read into; never less than a scroll frame allows', () => {
		expect(READING_STEP_VIEW_SHARE).toBe(0.5)
		expect(readingFrame({ sections, readingLine: 0, viewTop: 0, viewHeight: 50, elapsedMs: 0 }).liveCrossingPx).toBe(40)
	})

	test('voice has reached the end of the script on its last word or the one before', () => {
		expect(voiceReachedScriptEnd(97, 100)).toBe(false)
		expect(voiceReachedScriptEnd(98, 100)).toBe(true)
		expect(voiceReachedScriptEnd(99, 100)).toBe(true)
		expect(voiceReachedScriptEnd(0, 0)).toBe(false)
	})
})

describe('TakeTracker.follow: voice tracking moves the place a few words at a time', () => {
	test('read from the top: each section is a whole take, though no heading is spoken, and the script is one too', () => {
		const tracker = new TakeTracker()
		// The first words heard are on Intro's first line, with the page still at the top.
		expect(tracker.follow(heard(180, 2, 0), 'targeted')).toBeNull()
		expect(tracker.isActive).toBe(true)
		// Irregular steps: a line, the same line again, two lines in one catch-up, a pause in speech.
		for (const [place, seconds] of [[240, 5], [240, 6], [380, 11], [700, 25], [1020, 38]]) {
			expect(tracker.follow(heard(place, seconds), 'targeted')).toBeNull()
		}
		// He never says "Why us": the next place is its first line, 80 px under the heading and a
		// line further, 130 px past the heading. A scroll frame that far past would be a jump.
		const intro = tracker.follow(heard(1230, 41), 'targeted')
		expect(intro).toEqual({ result: { kind: 'section', title: 'Intro', durationSeconds: 39, targetSeconds: null, complete: true }, stop: false })
		for (const [place, seconds] of [[1300, 45], [1480, 60], [1800, 90], [2040, 128]]) {
			expect(tracker.follow(heard(place, seconds), 'targeted')).toBeNull()
		}
		const whyUs = tracker.follow(heard(2180, 133), 'targeted')
		expect(whyUs).toEqual({ result: { kind: 'section', title: 'Why us', durationSeconds: 92, targetSeconds: 90, complete: true }, stop: true })
		tracker.follow(heard(2400, 170), 'targeted')
		const end = tracker.finish(heard(2600, 191), 200)
		expect(end.section).toEqual({ kind: 'section', title: 'Closing', durationSeconds: 58, targetSeconds: 60, complete: true })
		expect(end.script).toEqual({ kind: 'script', title: SCRIPT_TAKE_TITLE, durationSeconds: 189, targetSeconds: 200, complete: true })
		expect(loggableTakes([intro?.result ?? null, whyUs?.result ?? null, end.section, end.script])).toHaveLength(4)
	})

	test('after a section jump the first words heard open a whole take of that section', () => {
		const tracker = new TakeTracker()
		// The jump left the heading on the eyeline; he starts two lines in.
		tracker.follow(heard(1240, 0, 700), 'targeted')
		expect(tracker.currentSection).toBe(1)
		expect(tracker.follow(heard(2200, 88), 'targeted')?.result).toMatchObject({ title: 'Why us', durationSeconds: 88, complete: true })
	})

	test('starting to speak in the middle of a section, its heading off the screen, is a partial take', () => {
		const tracker = new TakeTracker()
		tracker.follow(heard(1600, 0, 1440), 'targeted')
		expect(tracker.follow(heard(2200, 50), 'targeted')?.result).toMatchObject({ title: 'Why us', complete: false })
	})

	test('a re-sync jump back inside the section ends nothing; the time spent going back is in the take', () => {
		const tracker = new TakeTracker()
		tracker.follow(heard(1240, 0, 700), 'targeted')
		tracker.follow(heard(1700, 40), 'targeted')
		expect(tracker.follow(heard(1450, 42), 'targeted')).toBeNull()
		expect(tracker.follow(heard(1700, 55), 'targeted')).toBeNull()
		expect(tracker.follow(heard(2190, 100), 'targeted')?.result).toMatchObject({ title: 'Why us', durationSeconds: 100, complete: true })
	})

	test('back over the heading just crossed and forward again is not a second take', () => {
		const tracker = new TakeTracker()
		tracker.follow(heard(1240, 0, 700), 'targeted')
		expect(tracker.follow(heard(2180, 91), 'targeted')?.result?.title).toBe('Why us')
		// The matcher had run a line ahead; the re-sync puts him back on Why us's last line.
		expect(tracker.follow(heard(2040, 92), 'targeted')).toBeNull()
		expect(tracker.follow(heard(2180, 94), 'targeted')).toBeNull()
		expect(tracker.currentSection).toBe(2)
		// Closing was timed from the first crossing.
		expect(tracker.finish(heard(2600, 150), null).section).toMatchObject({ title: 'Closing', durationSeconds: 59, complete: true })
	})

	test('a forward jump of more than half the view (a hand scroll, then reading there) lands in a partial take', () => {
		const tracker = new TakeTracker()
		tracker.follow(heard(1240, 0, 700), 'targeted')
		tracker.follow(heard(1500, 30), 'targeted')
		expect(tracker.follow(heard(2550, 35), 'targeted')?.result?.title).toBe('Why us') // 450 px into Closing
		expect(tracker.finish(heard(2600, 60), null).section).toMatchObject({ title: 'Closing', complete: false })
	})

	test('the clock stopped on the card: the wait before his next words is not in the next take', async () => {
		const { SpeechClock } = await import('./timing/speech-timer')
		let now = 0
		const clock = new SpeechClock(() => now)
		const place = (top: number): TakeFrame => readingFrame({ sections, readingLine: top, viewTop: Math.max(0, top - VOICE_ANCHOR), viewHeight: VIEW_HEIGHT, elapsedMs: clock.elapsedMs })
		const tracker = new TakeTracker()
		clock.start()
		tracker.follow(readingFrame({ sections, readingLine: 1240, viewTop: 700, viewHeight: VIEW_HEIGHT, elapsedMs: clock.elapsedMs }), 'targeted')
		now = 90_000
		expect(tracker.follow(place(2180), 'targeted')?.stop).toBe(true)
		clock.pause() // the section end stops the clock on the card; the microphone stays on
		now = 110_000 // twenty seconds reading the card
		clock.resume() // his next words move the place again
		now = 112_000
		tracker.follow(place(2240), 'targeted')
		now = 150_000
		expect(tracker.finish(place(2600), null).section).toMatchObject({ title: 'Closing', durationSeconds: 40 })
	})
})

describe('TakeTracker.follow: read-aloud moves the place a sentence at a time', () => {
	test('the heading is read as a sentence: the section ends on it, and the next take is whole', () => {
		const tracker = new TakeTracker()
		tracker.follow(spoken(100, 0), 'targeted') // sentence 0, the Intro heading, page at the top
		// Long sentences move the place hundreds of pixels; a block of two sentences reports the same place twice.
		for (const [place, seconds] of [[180, 2], [180, 6], [520, 14], [900, 30]]) {
			expect(tracker.follow(spoken(place, seconds), 'targeted')).toBeNull()
		}
		expect(tracker.follow(spoken(1100, 40), 'targeted')?.result).toMatchObject({ title: 'Intro', durationSeconds: 40, complete: true })
		for (const [place, seconds] of [[1180, 42], [1500, 60], [1880, 84]]) {
			expect(tracker.follow(spoken(place, seconds), 'targeted')).toBeNull()
		}
		const whyUs = tracker.follow(spoken(2100, 95), 'targeted')
		expect(whyUs).toEqual({ result: { kind: 'section', title: 'Why us', durationSeconds: 55, targetSeconds: 90, complete: true }, stop: true })
		// Paused before the Closing heading is spoken; Play reads it, and the same place is no new end.
		expect(tracker.follow(spoken(2100, 95), 'targeted')).toBeNull()
		tracker.follow(spoken(2180, 97), 'targeted')
		const end = tracker.finish(spoken(2400, 150), 180)
		expect(end.section).toMatchObject({ title: 'Closing', durationSeconds: 55, complete: true })
		expect(end.script).toMatchObject({ durationSeconds: 150, targetSeconds: 180, complete: true })
	})

	test('a sentence read again (repeat, loop, previous sentence) ends nothing', () => {
		const tracker = new TakeTracker()
		tracker.follow(spoken(1100, 0), 'always')
		tracker.follow(spoken(1500, 20), 'always')
		expect(tracker.follow(spoken(1180, 25), 'always')).toBeNull()
		expect(tracker.follow(spoken(1500, 30), 'always')).toBeNull()
		expect(tracker.follow(spoken(2100, 70), 'always')).toEqual({
			result: { kind: 'section', title: 'Why us', durationSeconds: 70, targetSeconds: 90, complete: true },
			stop: true,
		})
	})
})

describe('formatting a take', () => {
	test('times are m:ss, and h:mm:ss from an hour', () => {
		expect(formatTakeTime(102)).toBe('1:42')
		expect(formatTakeTime(8)).toBe('0:08')
		expect(formatTakeTime(3723)).toBe('1:02:03')
		expect(formatTakeTime(Number.NaN)).toBe('-:--')
	})

	test('the card line: over, under, on target, no target, partial', () => {
		const take = { title: 'Why us', targetSeconds: 90, complete: true }
		expect(formatTakeLine({ ...take, durationSeconds: 102 })).toBe('Why us · 1:42 · target 1:30 · +0:12')
		expect(formatTakeLine({ ...take, durationSeconds: 75 })).toBe('Why us · 1:15 · target 1:30 · -0:15')
		expect(formatTakeLine({ ...take, durationSeconds: 91 })).toBe('Why us · 1:31 · target 1:30 · on target')
		expect(formatTakeLine({ ...take, targetSeconds: null, durationSeconds: 91 })).toBe('Why us · 1:31')
		expect(formatTakeLine({ ...take, durationSeconds: 40, complete: false })).toBe('Why us · 0:40 · target 1:30 · -0:50 · partial, not logged')
	})

	test('on target is two seconds either side, or 2% of a long target', () => {
		expect(scoreTake(92, 90).verdict).toBe('on-target')
		expect(scoreTake(93, 90).verdict).toBe('over')
		expect(scoreTake(87, 90).verdict).toBe('under')
		expect(scoreTake(612, 600).verdict).toBe('on-target')
		expect(scoreTake(90, null)).toEqual({ verdict: 'no-target', deltaSeconds: null })
	})

	test('takeCard carries the verdict and the exact line every surface shows', () => {
		expect(takeCard({ kind: 'section', title: 'Why us', durationSeconds: 102, targetSeconds: 90, complete: true })).toEqual({
			kind: 'section',
			title: 'Why us',
			durationSeconds: 102,
			targetSeconds: 90,
			deltaSeconds: 12,
			verdict: 'over',
			complete: true,
			text: 'Why us · 1:42 · target 1:30 · +0:12',
		})
	})
})

describe('fit to target', () => {
	const fit = (frame: TakeFrame, extra: Partial<Parameters<typeof planFit>[0]> = {}) =>
		planFit({ ...frame, maxScrollTop: 2300, scriptTargetSeconds: 180, openSection: -1, openSectionElapsedSeconds: null, ...extra })

	test('at a section with a target: its remaining distance over its whole target', () => {
		// Jumped to Why us: the next heading (2100) is 1050 px below the eyeline (1050 + 400 = 1450 → 650 px).
		expect(fit(at(jumpTo(1), 0))).toEqual({ ok: true, scope: 'section', title: 'Why us', distancePx: 650, secondsLeft: 90, pixelsPerSecond: 650 / 90 })
	})

	test('mid-take: only the time left on the section target counts', () => {
		const plan = fit(at(1300, 30), { openSection: 1, openSectionElapsedSeconds: 30 })
		expect(plan).toMatchObject({ ok: true, scope: 'section', distancePx: 400, secondsLeft: 60 })
	})

	test('the last section runs to the end of the script', () => {
		expect(fit(at(jumpTo(2), 0))).toMatchObject({ ok: true, scope: 'section', title: 'Closing', distancePx: 250, secondsLeft: 60 })
	})

	test('a section with no target falls back to the rest of the script against the script target', () => {
		expect(fit(at(0, 20))).toMatchObject({ ok: true, scope: 'script', title: SCRIPT_TAKE_TITLE, distancePx: 2300, secondsLeft: 160 })
	})

	test('no target anywhere, already over, or at the end: says why instead of guessing', () => {
		expect(fit(at(0, 0), { scriptTargetSeconds: null })).toEqual({ ok: false, reason: 'no-target' })
		expect(fit(at(1300, 95), { openSection: 1, openSectionElapsedSeconds: 95 })).toEqual({ ok: false, reason: 'over-target' })
		expect(fit(at(2300, 10), { sections: [] })).toEqual({ ok: false, reason: 'at-end' })
	})

	test('the speed comes back inside the settings range and says when it was held', () => {
		expect(speedForPlan(25, DEFAULT_SPEED_LIMITS)).toEqual({ speed: 2.5, wanted: 2.5, clamped: null })
		expect(speedForPlan(1, DEFAULT_SPEED_LIMITS)).toEqual({ speed: 0.5, wanted: 0.1, clamped: 'min' })
		expect(speedForPlan(500, DEFAULT_SPEED_LIMITS)).toEqual({ speed: 10, wanted: 50, clamped: 'max' })
	})
})

describe('with the real scroller and clock', () => {
	test('playing a section at a fitted speed ends it on its target, and the take says so', async () => {
		const { AutoScroller } = await import('./playback')
		const { SpeechClock } = await import('./timing/speech-timer')
		let now = 0
		const clock = new SpeechClock(() => now)
		const surface = { scrollTop: jumpTo(1), scrollHeight: 3100, clientHeight: 800 }
		const frameOf = (): TakeFrame => ({ sections, viewTop: surface.scrollTop, readingLine: surface.scrollTop + EYELINE, elapsedMs: clock.elapsedMs })

		const plan = planFit({ ...frameOf(), maxScrollTop: 2300, scriptTargetSeconds: null, openSection: -1, openSectionElapsedSeconds: null })
		expect(plan.ok).toBe(true)
		const speed = plan.ok ? speedForPlan(plan.pixelsPerSecond, DEFAULT_SPEED_LIMITS).speed : 0

		const scroller = new AutoScroller()
		const tracker = new TakeTracker()
		clock.start()
		scroller.start()
		tracker.begin(frameOf())
		let ended = null
		for (let frame = 0; frame < 20_000 && !ended; frame++) {
			now += 16
			scroller.step(now, surface, speed)
			ended = tracker.step(frameOf(), 'targeted')
		}
		// Speed is held to two decimals, so the fit lands within a second of the 90 s target.
		expect(ended?.stop).toBe(true)
		expect(ended?.result?.title).toBe('Why us')
		expect(Math.abs((ended?.result?.durationSeconds ?? 0) - 90)).toBeLessThanOrEqual(1)
		expect(takeCard(ended?.result ?? { kind: 'section', title: '', durationSeconds: 0, targetSeconds: null, complete: false }).verdict).toBe('on-target')
	})
})

import { locateSection as locateForJump } from './takes'
describe('a section jump lands its heading on the eyeline (merge with sections.ts)', () => {
	test('a heading 1 px below the reading line is still the start of that section', () => {
		const sections = [
			{ title: 'Opening', top: 0, targetSeconds: null },
			{ title: 'Why us', top: 1001, targetSeconds: 90 },
			{ title: 'Close', top: 2000, targetSeconds: null },
		]
		const loc = locateForJump(sections, { viewTop: 600, readingLine: 1000 } as never)
		expect(loc).toEqual({ index: 1, atStart: true })
	})
})
