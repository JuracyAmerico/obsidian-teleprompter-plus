/**
 * What the phone layout leaves out: everything that needs a local server, a helper process,
 * an Electron window or the Mac's own speech. One list, so the toolbar, the settings and the
 * read-aloud engine choice agree.
 */

/** Settings tabs that only configure desktop machinery (the remote server and OBS). */
export const DESKTOP_ONLY_SETTINGS_TABS: readonly string[] = ['connection', 'obs']

/** Toolbar controls that open desktop windows or start desktop-only features. */
export const DESKTOP_ONLY_TOOLBAR_CONTROLS: readonly string[] = ['detach', 'float', 'voice-tracking']

/** Read-aloud engines that run a process on the Mac. */
export const DESKTOP_ONLY_ENGINES: readonly string[] = ['kokoro', 'mac-say']

export function forPhone<T>(items: readonly T[], idOf: (item: T) => string, desktopOnly: readonly string[], mobile: boolean): T[] {
	return mobile ? items.filter(item => !desktopOnly.includes(idOf(item))) : [...items]
}
