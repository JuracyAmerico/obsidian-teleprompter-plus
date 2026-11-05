/**
 * What the phone layout leaves out: everything that needs a local server, a helper process,
 * an Electron window or the Mac's own speech. One list, so the toolbar, the settings and the
 * read-aloud engine choice agree.
 */

/** Settings tabs that only configure desktop machinery (the remote server and OBS). */
export const DESKTOP_ONLY_SETTINGS_TABS: readonly string[] = ['connection', 'obs']

/** Toolbar controls that open desktop windows. Voice tracking runs on the phone through the offline Vosk model. */
export const DESKTOP_ONLY_TOOLBAR_CONTROLS: readonly string[] = ['detach', 'float']

/**
 * A phone is about 390 points wide: the desktop bar of twenty-odd controls piles on top of itself.
 * The phone bar carries what a reader needs mid-read; one-tap toggles go to More (panel controls
 * cannot, their popups get clipped there); the rest is for the desktop.
 */
export const PHONE_BAR_CONTROLS: readonly string[] = ['play-pause', 'speed', 'font-size', 'tts', 'voice-tracking', 'time-display']
export const PHONE_MORE_CONTROLS: readonly string[] = ['reset', 'navigation', 'eyeline', 'focus-mode', 'flip-h', 'flip-v', 'keep-awake', 'pin', 'alignment', 'progress-indicator']

/** Read-aloud engines that run a process on the Mac. */
export const DESKTOP_ONLY_ENGINES: readonly string[] = ['kokoro', 'mac-say']

export function forPhone<T>(items: readonly T[], idOf: (item: T) => string, desktopOnly: readonly string[], mobile: boolean): T[] {
	return mobile ? items.filter(item => !desktopOnly.includes(idOf(item))) : [...items]
}

/** Phone bar buttons a reader may turn off (Américo, 2026-11-05: "read aloud does not suit to everybody").
 *  Play/pause and the clock always stay. */
export const PHONE_OPTIONAL_CONTROLS: readonly { id: string; name: string }[] = [
	{ id: 'voice-tracking', name: 'Voice tracking' },
	{ id: 'speed', name: 'Speed' },
	{ id: 'font-size', name: 'Font size' },
	{ id: 'tts', name: 'Read aloud' },
]

/** The phone bar after the reader's choices; a turned-off button is gone, not moved to More. */
export function phoneBarControls(hidden: readonly string[] | undefined): string[] {
	const optional = new Set(PHONE_OPTIONAL_CONTROLS.map(control => control.id))
	return PHONE_BAR_CONTROLS.filter(id => !(optional.has(id) && (hidden ?? []).includes(id)))
}
