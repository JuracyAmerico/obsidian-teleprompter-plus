/**
 * The take log: every whole take, appended to a small JSON file in the plugin's own folder.
 *
 * Pure: parsing, appending, choosing what to show. main.ts does the reading and writing. The file is
 * the reader's own record and may be hand-edited or half-written, so parsing never throws and keeps
 * every entry it can read.
 */

import type { TakeKind } from './takes'
import { scoreTake } from './takes'

export const TAKE_LOG_FILE = 'takes.json'

/** Oldest entries go first past this: about a year of daily practice, still a small file. */
export const TAKE_LOG_LIMIT = 5000

/** "Show recent takes" lists this many. */
export const RECENT_TAKES = 20

export interface TakeLogEntry {
	notePath: string
	kind: TakeKind
	/** The section's title, or the whole-script title. */
	section: string
	durationSeconds: number
	targetSeconds: number | null
	/** ISO 8601. */
	date: string
}

interface TakeLogFile {
	version: 1
	takes: TakeLogEntry[]
}

function isEntry(value: unknown): value is TakeLogEntry {
	if (typeof value !== 'object' || value === null) return false
	const entry = value as Record<string, unknown>
	return (
		typeof entry.notePath === 'string' && entry.notePath.length > 0 &&
		(entry.kind === 'section' || entry.kind === 'script') &&
		typeof entry.section === 'string' &&
		typeof entry.durationSeconds === 'number' && Number.isFinite(entry.durationSeconds) && entry.durationSeconds >= 0 &&
		(entry.targetSeconds === null || (typeof entry.targetSeconds === 'number' && Number.isFinite(entry.targetSeconds) && entry.targetSeconds > 0)) &&
		typeof entry.date === 'string' && !Number.isNaN(Date.parse(entry.date))
	)
}

/** The entries in a log file's text. Missing, empty, broken or foreign text gives an empty log. */
export function parseTakeLog(raw: string | null | undefined): TakeLogEntry[] {
	if (!raw) return []
	let data: unknown
	try {
		data = JSON.parse(raw)
	} catch {
		return []
	}
	const takes = typeof data === 'object' && data !== null ? (data as { takes?: unknown }).takes : undefined
	if (!Array.isArray(takes)) return []
	return takes.filter(isEntry).map(entry => ({
		notePath: entry.notePath,
		kind: entry.kind,
		section: entry.section,
		durationSeconds: entry.durationSeconds,
		targetSeconds: entry.targetSeconds,
		date: entry.date,
	}))
}

export function serializeTakeLog(takes: readonly TakeLogEntry[]): string {
	const file: TakeLogFile = { version: 1, takes: [...takes] }
	return JSON.stringify(file, null, '\t') + '\n'
}

/** Two views timing the same scroll report the same take; within this window it is one take. */
const DUPLICATE_WINDOW_MS = 5000

/** The same take reported twice (a second window scrolling the same script). */
export function isDuplicateTake(takes: readonly TakeLogEntry[], entry: TakeLogEntry): boolean {
	const when = Date.parse(entry.date)
	return takes.some(other =>
		other.notePath === entry.notePath &&
		other.kind === entry.kind &&
		other.section === entry.section &&
		Math.abs(other.durationSeconds - entry.durationSeconds) <= 1 &&
		Math.abs(Date.parse(other.date) - when) <= DUPLICATE_WINDOW_MS
	)
}

/** The log with one more take, oldest dropped past `limit`. A duplicate leaves the log as it was. */
export function appendTake(takes: readonly TakeLogEntry[], entry: TakeLogEntry, limit = TAKE_LOG_LIMIT): TakeLogEntry[] {
	if (!isEntry(entry) || isDuplicateTake(takes, entry)) return [...takes]
	const next = [...takes, entry]
	return next.length > limit ? next.slice(next.length - Math.max(1, limit)) : next
}

/** Newest first; entries with the same date keep their log order reversed (the later append first). */
function newestFirst(takes: readonly TakeLogEntry[]): TakeLogEntry[] {
	return takes
		.map((entry, index) => ({ entry, index, time: Date.parse(entry.date) }))
		.sort((a, b) => b.time - a.time || b.index - a.index)
		.map(item => item.entry)
}

/** The last `limit` takes of one note, newest first. */
export function recentTakes(takes: readonly TakeLogEntry[], notePath: string, limit = RECENT_TAKES): TakeLogEntry[] {
	return newestFirst(takes.filter(entry => entry.notePath === notePath)).slice(0, Math.max(0, limit))
}

/** One key per section of one note: the whole script and a section of the same name stay apart. */
export function takeKey(entry: Pick<TakeLogEntry, 'kind' | 'section'>): string {
	return `${entry.kind}\u0000${entry.section}`
}

/**
 * The best take of each section of a note, over its whole history: the one closest to its target,
 * the newer on a tie. A section never timed against a target has no best, because there is nothing
 * to be best at; a faster read is not a better answer.
 */
export function bestTakes(takes: readonly TakeLogEntry[], notePath: string): Map<string, TakeLogEntry> {
	const best = new Map<string, { entry: TakeLogEntry; miss: number }>()
	for (const entry of newestFirst(takes.filter(item => item.notePath === notePath))) {
		const score = scoreTake(entry.durationSeconds, entry.targetSeconds)
		if (score.deltaSeconds === null) continue
		const miss = Math.abs(score.deltaSeconds)
		const key = takeKey(entry)
		const current = best.get(key)
		if (!current || miss < current.miss) best.set(key, { entry, miss })
	}
	return new Map([...best].map(([key, value]) => [key, value.entry]))
}

/** Whether this entry is the best take of its section (identity, not equality: two equal takes are two takes). */
export function isBestTake(best: Map<string, TakeLogEntry>, entry: TakeLogEntry): boolean {
	return best.get(takeKey(entry)) === entry
}

/**
 * Takes follow their note when it is renamed or moved, and when a folder holding it is. Returns null
 * when nothing changed, so the file is not rewritten.
 */
export function renameTakeNote(takes: readonly TakeLogEntry[], oldPath: string, newPath: string): TakeLogEntry[] | null {
	if (!oldPath || oldPath === newPath) return null
	const folder = oldPath + '/'
	const moved = (notePath: string): string | null =>
		notePath === oldPath ? newPath : notePath.startsWith(folder) ? newPath + '/' + notePath.slice(folder.length) : null
	if (!takes.some(entry => moved(entry.notePath) !== null)) return null
	return takes.map(entry => {
		const notePath = moved(entry.notePath)
		return notePath === null ? entry : { ...entry, notePath }
	})
}

/** "Nov 26, 14:05" in the reader's locale, for the takes list. */
export function formatTakeDate(date: string, locale?: string): string {
	const when = new Date(date)
	if (Number.isNaN(when.getTime())) return ''
	return when.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
