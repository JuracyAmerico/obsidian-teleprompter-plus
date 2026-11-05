import { Platform } from 'obsidian'

/**
 * Two different questions, kept apart on purpose.
 *
 * Can this device run desktop machinery (a local server, a helper process, Electron windows)?
 * Only the desktop app can; the phone and tablet apps have no Node at all.
 */
export function canRunDesktopMachinery(): boolean {
	return Platform.isMobileApp !== true
}

/**
 * Should the interface show only what works on a phone? True on the phone and tablet apps, and on
 * the desktop app while Obsidian's "emulate mobile" is on, which is how the phone layout is tested
 * on the Mac.
 */
export function showsMobileInterface(): boolean {
	return Platform.isMobile === true
}
