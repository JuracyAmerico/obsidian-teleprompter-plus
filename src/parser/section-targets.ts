/**
 * Per-section rehearsal targets written on the heading itself: `## Why us {1:30}` or `## Why us {90s}`.
 *
 * Pure: no DOM, no Obsidian. The render pipeline strips the braces before marked sees the note
 * (`stripHeadingTargets`), and the take tracker reads the targets back (`parseSectionTargets`,
 * `assignSectionTargets`) by heading title, so nothing here depends on how headings are numbered.
 *
 * Only a time-shaped brace group at the very end of a heading is a target. `{#id}` and `{.class}`
 * are Pandoc attributes and are left alone; a bare number (`{2024}`) is not a target either, because
 * the frontmatter rule reads a bare number as minutes and a year in a title must never become a
 * 2024-minute target. A time-shaped group that does not parse (`{1:75}`) is still stripped, so the
 * braces never reach the screen, and it gives no target rather than a wrong one.
 *
 * No regex here scans an unbounded run more than once: a synced note is untrusted input, and a
 * heading of 100,000 spaces must not freeze the render (see section-targets.test.ts).
 */

import { parseTargetTime } from '../timing/speech-timer'

export interface HeadingTarget {
	/** The heading text without the target braces. */
	title: string
	/** Seconds, or null when the heading has no target or the target does not parse. */
	targetSeconds: number | null
}

export interface SectionTarget extends HeadingTarget {
	/** 0-based line of the heading in the markdown that was parsed. */
	line: number
}

/** The longest brace content considered: `1h 30m 15s` with room to spare. */
const MAX_TARGET_LENGTH = 24

/** m:ss or h:mm:ss. Anchored and bounded, applied to at most MAX_TARGET_LENGTH characters. */
const CLOCK_SHAPE = /^\d{1,3}(?::\d{1,3}){1,2}$/
/** 90s, 2m, 2min, 1h30m, 1m 30s: at least one unit, nothing else. */
const UNIT_SHAPE = /^(?:\d{1,4} ?(?:h|min|m|sec|s) ?){1,3}$/i

function isTimeShaped(inner: string): boolean {
	const value = inner.trim()
	return CLOCK_SHAPE.test(value) || UNIT_SHAPE.test(value)
}

function isBlank(char: string): boolean {
	return char === ' ' || char === '\t'
}

/** `## Title ##` → `Title`: the closing sequence is hashes preceded by a blank (or the whole text). */
function withoutClosingHashes(text: string): string {
	const trimmed = text.trimEnd()
	let end = trimmed.length
	while (end > 0 && trimmed[end - 1] === '#') end--
	if (end === trimmed.length) return trimmed
	if (end === 0) return ''
	return isBlank(trimmed[end - 1]) ? trimmed.slice(0, end).trimEnd() : trimmed
}

/** Split a heading's text into its title and its target. Text with no target comes back trimmed. */
export function parseHeadingTarget(text: string): HeadingTarget {
	const body = withoutClosingHashes(text)
	const plain: HeadingTarget = { title: body.trim(), targetSeconds: null }
	if (!body.endsWith('}')) return plain
	const open = body.lastIndexOf('{')
	if (open === -1) return plain
	const inner = body.slice(open + 1, -1)
	if (inner.length > MAX_TARGET_LENGTH || inner.includes('}') || !isTimeShaped(inner)) return plain
	return { title: body.slice(0, open).trim(), targetSeconds: parseTargetTime(inner.trim()) }
}

/** An ATX heading: up to three spaces, 1-6 hashes, then a blank or the end of the line. */
function atxHeading(line: string): { prefix: string; text: string } | null {
	let i = 0
	while (i < 3 && line[i] === ' ') i++
	let hashes = 0
	while (line[i + hashes] === '#') hashes++
	if (hashes < 1 || hashes > 6) return null
	const after = i + hashes
	if (after < line.length && !isBlank(line[after])) return null
	return { prefix: line.slice(0, after), text: line.slice(after).trim() }
}

/** Calls `visit` for every ATX heading line outside fenced or indented code. */
function forEachHeadingLine(lines: string[], visit: (index: number, prefix: string, text: string) => void): void {
	// Fence opener: bounded by the line's own leading run, applied once per line.
	let fence: string | null = null
	lines.forEach((line, index) => {
		const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
		if (open) {
			const marker = open[1][0]
			if (fence === null) fence = marker
			else if (marker === fence) fence = null
			return
		}
		if (fence !== null || line.startsWith('\t') || line.startsWith('    ')) return
		const heading = atxHeading(line)
		if (heading) visit(index, heading.prefix, heading.text)
	})
}

/**
 * The markdown with every heading target removed, line count unchanged. Only the braces go: a
 * heading's raw text stays a prefix of the original line, which is what the heading-to-source-line
 * mapper searches for.
 */
export function stripHeadingTargets(markdown: string): string {
	if (!markdown.includes('{')) return markdown
	const lines = markdown.split('\n')
	forEachHeadingLine(lines, (index, _prefix, text) => {
		if (!text.includes('{')) return
		const parsed = parseHeadingTarget(text)
		if (parsed.title === withoutClosingHashes(text).trim()) return
		// Cut the original line at the target's brace (the last one: closing hashes hold none), so
		// its spacing is kept and the result is a prefix of the source line.
		lines[index] = lines[index].slice(0, lines[index].lastIndexOf('{')).trimEnd()
	})
	return lines.join('\n')
}

/** Every heading in document order, with its target (or null). */
export function parseSectionTargets(markdown: string): SectionTarget[] {
	const result: SectionTarget[] = []
	forEachHeadingLine(markdown.split('\n'), (line, _prefix, text) => {
		result.push({ ...parseHeadingTarget(text), line })
	})
	return result
}

/**
 * Letters and digits only, lower case: the rendered heading's text and the source heading's text
 * differ in markdown symbols, link syntax and spacing, never in their words.
 */
export function normalizeHeadingTitle(text: string): string {
	return text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * The target of each rendered heading, matched to the source headings by title with a forward-only
 * cursor, so two headings with the same title keep their own targets in document order. A rendered
 * heading with no match (an embedded note's heading, a heading the strip passes rewrote) gets null
 * and does not move the cursor, so one miss cannot shift every target after it.
 */
export function assignSectionTargets(renderedTitles: readonly string[], source: readonly SectionTarget[]): (number | null)[] {
	const keys = source.map(heading => normalizeHeadingTitle(heading.title))
	let cursor = 0
	return renderedTitles.map(title => {
		const key = normalizeHeadingTitle(title)
		if (!key) return null
		const found = keys.indexOf(key, cursor)
		if (found === -1) return null
		cursor = found + 1
		return source[found].targetSeconds
	})
}
