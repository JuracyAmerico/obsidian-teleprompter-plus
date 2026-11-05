/**
 * Page-turner pedals and presenter clickers send PageUp and PageDown, or the arrow keys in their
 * arrow mode. Saved hotkeys replace the defaults wholesale, so a key added later never reaches an
 * existing user without this merge.
 */

export function withMissingDefaultHotkeys<Action>(
	saved: Record<string, Action> | undefined,
	defaults: Record<string, Action>
): Record<string, Action> {
	return { ...defaults, ...(saved ?? {}) }
}

/** Which action a key runs: in arrow mode the up and down arrows turn pages instead of changing speed. */
export function hotkeyAction(
	key: string,
	hotkeys: Record<string, string>,
	arrowKeysTurnPages: boolean
): string | undefined {
	if (arrowKeysTurnPages && key === 'ArrowDown') return 'pageDown'
	if (arrowKeysTurnPages && key === 'ArrowUp') return 'pageUp'
	return hotkeys[key]
}

export const PAGE_TURN_SHARE = 0.8
