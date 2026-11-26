/**
 * Which section is which, and which one the reader is in. Pure, so the rules are testable without
 * the Svelte component.
 *
 * A heading's title is not its identity: a STAR answer repeats "Situation", "Task", "Action" and
 * "Result" under every question, and matching by title always found the first one. Jumps,
 * read-aloud from a section, the main window following the floating one and the phone highlight
 * all landed on the wrong answer. A heading's line in the note is unique, so that is the identity;
 * the title and its occurrence count are the fallback for a heading whose line is unknown or has
 * moved because the note changed under one of the views.
 */

/** A heading as a view knows it. */
export interface SectionHeading {
	/** The view's own render ordinal (`header-3`). Never compared across views. */
	id: string
	text: string
	/** 0-based line of the heading in the note's body; -1 when it could not be located. */
	line: number
}

/** What travels between views, and to remotes, to name one section. */
export interface SectionRef {
	line: number
	text: string
	/** How many headings with the same title come before this one: 0 for the first. */
	occurrence: number
}

/** The reference for the heading at `index`, or null when there is none. */
export function sectionRef(headings: readonly SectionHeading[], index: number): SectionRef | null {
	const heading = headings[index]
	if (!heading) return null
	let occurrence = 0
	for (let i = 0; i < index; i++) if (headings[i].text === heading.text) occurrence++
	return { line: heading.line, text: heading.text, occurrence }
}

/**
 * The index of the heading a reference names, or -1. The line wins when it still holds the same
 * title; otherwise the title's n-th occurrence, so a note edited above the heading still finds
 * it. A reference without a title (a bare line) matches on the line alone.
 */
export function findSection(headings: readonly SectionHeading[], ref: Partial<SectionRef> | null | undefined): number {
	if (!ref) return -1
	const { line, text } = ref
	const hasLine = typeof line === 'number' && line >= 0
	const hasText = typeof text === 'string'

	if (hasLine) {
		const byLine = headings.findIndex(h => h.line === line && (!hasText || h.text === text))
		if (byLine >= 0) return byLine
	}
	if (!hasText) return -1

	const wanted = typeof ref.occurrence === 'number' && ref.occurrence >= 0 ? ref.occurrence : 0
	let seen = 0
	for (let i = 0; i < headings.length; i++) {
		if (headings[i].text !== text) continue
		if (seen === wanted) return i
		seen++
	}
	return -1
}

/** True when two references name the same section. */
export function sameSection(a: SectionRef | null, b: SectionRef | null): boolean {
	if (a === null || b === null) return a === b
	return a.line === b.line && a.text === b.text && a.occurrence === b.occurrence
}

/**
 * Rounding: scrollTop is a whole pixel, so a heading placed exactly on the eyeline can measure a
 * fraction below it. Within this, the heading counts as reached.
 */
export const REACHED_TOLERANCE_PX = 2

/**
 * The section the reader is in: the last heading at or above the reading line. `tops` are the
 * headings' tops in the scrolled content's coordinates, in document order; NaN for a heading
 * that is not on screen to measure, which is skipped. -1 when the reading line is above every
 * heading.
 */
export function sectionAtReadingLine(tops: readonly number[], readingY: number, tolerance = REACHED_TOLERANCE_PX): number {
	let current = -1
	for (let i = 0; i < tops.length; i++) {
		const top = tops[i]
		if (Number.isNaN(top)) continue
		if (top <= readingY + tolerance) current = i
		else break
	}
	return current
}

/** Where to scroll so a heading's top sits on the eyeline, kept inside the scrollable range. */
export function scrollTopForHeading(headingTop: number, readingOffset: number, maxScroll: number): number {
	return Math.min(Math.max(0, maxScroll), Math.max(0, headingTop - readingOffset))
}

/**
 * A jump near the end of the script cannot bring its heading down to the eyeline: the script
 * stops scrolling first, and the reading line still sits in an earlier section. The hold keeps
 * the jumped-to section current until the reader moves: scrolls back up, or reaches another
 * section.
 */
export interface JumpHold {
	/** The section jumped to. */
	index: number
	/** The section the reading line measured right after the jump. */
	landed: number
	/** Where the jump left the script. */
	scrollTop: number
}

/** The hold for a jump, or null when the jump reached the eyeline and needs none. */
export function holdAfterJump(index: number, landed: number, scrollTop: number): JumpHold | null {
	return landed === index ? null : { index, landed, scrollTop }
}

/**
 * The current section given what the reading line measures and a possible hold. The hold lasts
 * while the reading line stays in the section it landed in and the script has not moved up.
 */
export function currentSection(measured: number, hold: JumpHold | null, scrollTop: number): { index: number; hold: JumpHold | null } {
	if (hold && measured === hold.landed && scrollTop >= hold.scrollTop - REACHED_TOLERANCE_PX) {
		return { index: hold.index, hold }
	}
	return { index: measured, hold: null }
}
