// Jump to Section follows the reading (ISC-134). Pure helpers so the rules are testable without the Svelte component.

export interface NavHeader {
	id: string
	parentId?: string
}

/** How long the list holds still after the reader scrolls it by hand. */
export const MANUAL_PAUSE_MS = 5000

/** Where the current title sits in the list, as a fraction of the list's height from the top. */
export const FOLLOW_FRACTION = 1 / 3

/**
 * The id to highlight for the current section: the section itself when it is visible,
 * otherwise its nearest ancestor that is not hidden inside a collapsed parent.
 */
export function visibleActiveId(headers: NavHeader[], activeIndex: number, collapsed: ReadonlySet<string>): string | null {
	const active = headers[activeIndex]
	if (!active) return null
	const byId = new Map(headers.map((h) => [h.id, h]))
	const chain: NavHeader[] = []
	for (let h: NavHeader | undefined = active; h; h = h.parentId ? byId.get(h.parentId) : undefined) chain.push(h)
	// chain[0] is the active header, the last entry is its root. Walk from the root down and stop below the first collapsed one.
	for (let i = chain.length - 1; i >= 0; i--) {
		if (i > 0 && collapsed.has(chain[i].id)) return chain[i].id
	}
	return active.id
}

export interface FollowGeometry {
	itemTop: number // the item's offset from the top of the scrolling list content
	itemHeight: number
	viewHeight: number // the list's visible height
	contentHeight: number // the list's full scroll height
	scrollTop: number // where the list is now
}

/**
 * The scrollTop that puts the item about a third from the top, clamped to the list's range.
 * Returns null when the list is already within a few pixels of it, so the list does not twitch.
 */
export function followScrollTop(g: FollowGeometry, fraction = FOLLOW_FRACTION): number | null {
	const max = Math.max(0, g.contentHeight - g.viewHeight)
	const wanted = g.itemTop + g.itemHeight / 2 - g.viewHeight * fraction
	const target = Math.round(Math.min(max, Math.max(0, wanted)))
	return Math.abs(target - g.scrollTop) < 4 ? null : target
}

/** True when the list may follow again: no manual scroll of the list in the last MANUAL_PAUSE_MS. */
export function mayFollow(now: number, lastManualScrollAt: number, pauseMs = MANUAL_PAUSE_MS): boolean {
	return now - lastManualScrollAt >= pauseMs
}

/** The compact progress line: "67% · ~3 min · 1,230 words", leaving out parts that are not shown. */
export function progressLine(percent: number, remainingMinutes: number | null, words: number): string {
	const parts = [`${percent}%`]
	if (remainingMinutes !== null) parts.push(remainingMinutes < 1 ? '< 1 min' : `~${Math.round(remainingMinutes)} min`)
	if (words > 0) parts.push(`${words.toLocaleString('en-US')} words`)
	return parts.join(' · ')
}

/**
 * The collapsed set with every collapsed ancestor of the current section opened, so the panel can
 * highlight the section itself. Returns the very set it was given when there is nothing to open, so
 * the caller can tell and skip the redraw. The current section's own collapsed state is left alone:
 * it is visible either way.
 */
export function expandToReveal(headers: NavHeader[], activeIndex: number, collapsed: ReadonlySet<string>): ReadonlySet<string> {
	const active = headers[activeIndex]
	if (!active || collapsed.size === 0) return collapsed
	const byId = new Map(headers.map((h) => [h.id, h]))
	let next: Set<string> | null = null
	for (let h = active.parentId ? byId.get(active.parentId) : undefined; h; h = h.parentId ? byId.get(h.parentId) : undefined) {
		if (!collapsed.has(h.id)) continue
		next ??= new Set(collapsed)
		next.delete(h.id)
	}
	return next ?? collapsed
}
