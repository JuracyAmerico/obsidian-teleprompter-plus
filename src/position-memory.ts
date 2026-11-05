/**
 * Where each note was left, kept in the plugin's data so it survives a restart. Records hold words,
 * never pixels: a font size change or an edit above the reader must still land on the same passage.
 */

import type { PassageAnchor } from './passage-anchor'

export interface RememberedPosition extends PassageAnchor {
	/** When it was saved, so the oldest go first once the cap is reached. */
	savedAt: number
}

export type NotePositions = Record<string, RememberedPosition>

export const MAX_REMEMBERED_POSITIONS = 200

/** A script read this far is finished: the next rehearsal starts from the top, not from the end. */
export const FINISHED_FRACTION = 0.95

export function rememberPosition(
	positions: NotePositions,
	path: string,
	anchor: PassageAnchor,
	now: number,
	cap: number = MAX_REMEMBERED_POSITIONS
): void {
	if (anchor.fraction >= FINISHED_FRACTION || anchor.wordIndex === 0) {
		delete positions[path]
		return
	}
	positions[path] = { ...anchor, savedAt: now }
	const paths = Object.keys(positions)
	if (paths.length <= cap) return
	paths
		.sort((a, b) => positions[a].savedAt - positions[b].savedAt)
		.slice(0, paths.length - cap)
		.forEach(oldest => delete positions[oldest])
}

/** A note was renamed, or a folder was, which carries every note inside it. */
export function renamePosition(positions: NotePositions, oldPath: string, newPath: string): boolean {
	let changed = false
	for (const path of Object.keys(positions)) {
		const moved = path === oldPath ? newPath : path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : null
		if (moved === null) continue
		positions[moved] = positions[path]
		delete positions[path]
		changed = true
	}
	return changed
}

export function forgetPosition(positions: NotePositions, path: string): boolean {
	if (!positions[path]) return false
	delete positions[path]
	return true
}

function isRememberedPosition(value: unknown): value is RememberedPosition {
	if (typeof value !== 'object' || value === null) return false
	const v = value as Record<string, unknown>
	return (
		typeof v.wordIndex === 'number' && v.wordIndex >= 0 &&
		typeof v.contextStart === 'number' && v.contextStart >= 0 &&
		typeof v.context === 'string' &&
		typeof v.fraction === 'number' && v.fraction >= 0 && v.fraction <= 1 &&
		typeof v.savedAt === 'number'
	)
}

/** A hand-edited or corrupt data file must not reach the script: anything malformed is dropped. */
export function validPositions(value: unknown): NotePositions {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
	const clean: NotePositions = {}
	for (const [path, position] of Object.entries(value)) {
		if (isRememberedPosition(position)) clean[path] = position
	}
	return clean
}
