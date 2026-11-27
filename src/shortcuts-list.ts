/**
 * The list the keyboard button opens: which key runs what, read from the hotkeys the prompter is
 * actually using, so a remapped key shows under its new action. Pure, so it is testable without the
 * Svelte component.
 */
import { hotkeyAction } from './pedal-keys'

export interface ShortcutRow {
	keys: string
	action: string
}

const ACTION_NAMES: Record<string, string> = {
	togglePlay: 'Play / pause',
	speedUp: 'Faster',
	speedDown: 'Slower',
	scrollUp: 'Scroll up',
	scrollDown: 'Scroll down',
	pageDown: 'Page down',
	pageUp: 'Page up',
	resetToTop: 'Back to the top',
	toggleNavigation: 'Section list',
	nextSection: 'Next section',
	prevSection: 'Previous section',
	cycleSpeedPreset: 'Next speed preset',
	toggleFullscreen: 'Full screen',
	toggleEyeline: 'Eyeline',
	toggleVoiceTracking: 'Voice tracking',
	toggleTTS: 'Read aloud',
}

/** Keys the key handler reads whatever the hotkey settings say (R, the number keys, Escape). */
const FIXED_ROWS: readonly ShortcutRow[] = [
	{ keys: 'R', action: 'Re-sync voice tracking if it drifts' },
	{ keys: '1 to 9', action: 'Jump to that section' },
	{ keys: 'Esc', action: 'Give the keyboard back to the note' },
]

const KEY_NAMES: Record<string, string> = {
	' ': 'Space',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	PageDown: 'Page Down',
	PageUp: 'Page Up',
}

/** How a key is written on the list: a letter in capitals, an arrow as an arrow. */
export function keyLabel(key: string): string {
	return KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}

/**
 * One row per action, in the order the hotkeys list them, the keys that run it joined with " / ".
 * `arrowKeysTurnPages` is the pedal setting: the key handler then sends the up and down arrows to
 * the page actions, so the list does too.
 */
export function shortcutRows(hotkeys: Record<string, string>, arrowKeysTurnPages: boolean): ShortcutRow[] {
	const keysByAction = new Map<string, string[]>()
	for (const key of Object.keys(hotkeys)) {
		const action = hotkeyAction(key, hotkeys, arrowKeysTurnPages)
		if (!action) continue
		const label = keyLabel(key)
		const keys = keysByAction.get(action) ?? []
		if (!keys.includes(label)) keys.push(label)
		keysByAction.set(action, keys)
	}
	const rows: ShortcutRow[] = []
	for (const [action, keys] of keysByAction) rows.push({ keys: keys.join(' / '), action: ACTION_NAMES[action] ?? action })
	return [...rows, ...FIXED_ROWS]
}
