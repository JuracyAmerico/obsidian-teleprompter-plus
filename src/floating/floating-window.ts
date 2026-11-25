import type { PassageAnchor } from '../passage-anchor'
/**
 * The floating teleprompter's window behaviour, kept apart from Obsidian and Svelte so it can be
 * tested with a fake window. Design: vault note 2026-10-30-18-10-fable-janela-flutuante-design.md.
 */

export interface WindowBounds {
	x: number
	y: number
	width: number
	height: number
}

/** The part of Electron's BrowserWindow the floating window uses. */
export interface ElectronWindowLike {
	setAlwaysOnTop(flag: boolean, level?: string): void
	setVisibleOnAllWorkspaces(flag: boolean, options?: { visibleOnFullScreen?: boolean }): void
	setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void
	setOpacity(opacity: number): void
	setBackgroundThrottling(allowed: boolean): void
	getBounds(): WindowBounds
	setBounds(bounds: WindowBounds): void
	isDestroyed?(): boolean
	setContentProtection?(enable: boolean): void
}

export const MIN_SEE_THROUGH_PERCENT = 30
export const MAX_SEE_THROUGH_PERCENT = 100
export const DEFAULT_SEE_THROUGH_PERCENT = 85

/** A window must show at least this much of itself on a display to count as reachable. */
const MIN_VISIBLE_PX = 80

export function clampSeeThrough(percent: number): number {
	if (!Number.isFinite(percent)) return DEFAULT_SEE_THROUGH_PERCENT
	return Math.min(MAX_SEE_THROUGH_PERCENT, Math.max(MIN_SEE_THROUGH_PERCENT, percent))
}

/** Floating needs always-on-top and click-through, which Linux window managers do not honour. */
export function canFloat(platform: { isDesktopApp: boolean; isLinux: boolean }): boolean {
	return platform.isDesktopApp && !platform.isLinux
}

const REQUIRED_METHODS: (keyof ElectronWindowLike)[] = [
	'setAlwaysOnTop',
	'setVisibleOnAllWorkspaces',
	'setIgnoreMouseEvents',
	'setOpacity',
	'setBackgroundThrottling',
	'getBounds',
	'setBounds',
]

/** Obsidian exposes every window's Electron object as `window.electronWindow`; null when it does not. */
export function electronWindowOf(win: unknown): ElectronWindowLike | null {
	const candidate = (win as { electronWindow?: unknown } | null | undefined)?.electronWindow
	if (!candidate || typeof candidate !== 'object') return null
	const methods = candidate as Record<string, unknown>
	return REQUIRED_METHODS.every(name => typeof methods[name] === 'function')
		? (candidate as ElectronWindowLike)
		: null
}

export interface DisplayInfo {
	label?: string
	bounds: WindowBounds
}

/** macOS names it "Elgato Prom."; the name is the identity, because other small displays share its size. */
const PROMPTER_LABEL = /elgato\s*prom/i

export function findPrompterDisplay(displays: DisplayInfo[]): DisplayInfo | null {
	return displays.find(display => PROMPTER_LABEL.test(display.label ?? '')) ?? null
}

export interface FloatingPlacement {
	bounds: WindowBounds | null
	onPrompter: boolean
	seeThroughPercent: number
}

/** Where the floating window opens. There is nothing behind a Prompter to see through to. */
export function floatingPlacement(
	displays: DisplayInfo[],
	preferences: { preferPrompter: boolean; savedBounds: WindowBounds | null | undefined; seeThroughPercent: number }
): FloatingPlacement {
	const prompter = preferences.preferPrompter ? findPrompterDisplay(displays) : null
	if (prompter) return { bounds: prompter.bounds, onPrompter: true, seeThroughPercent: MAX_SEE_THROUGH_PERCENT }
	return {
		bounds: restorableBounds(preferences.savedBounds, displays.map(display => display.bounds)),
		onPrompter: false,
		seeThroughPercent: clampSeeThrough(preferences.seeThroughPercent),
	}
}

/** Where a window goes when there is nothing better to restore. */
export const DEFAULT_FLOATING_BOUNDS: WindowBounds = { x: 100, y: 100, width: 800, height: 600 }

/** The Prompter was unplugged under the window: where it goes now. Null when nothing needs to move. */
export function placementAfterPrompterLost(
	displays: DisplayInfo[],
	onPrompter: boolean,
	preferences: { savedBounds: WindowBounds | null | undefined; seeThroughPercent: number }
): FloatingPlacement | null {
	if (!onPrompter || findPrompterDisplay(displays)) return null
	return floatingPlacement(displays, { ...preferences, preferPrompter: false })
}

/** The saved bounds when enough of them lands on a connected display, otherwise null. */
export function restorableBounds(
	saved: WindowBounds | null | undefined,
	displays: WindowBounds[]
): WindowBounds | null {
	if (!saved) return null
	const fits = displays.some(display => {
		const overlapWidth = Math.min(saved.x + saved.width, display.x + display.width) - Math.max(saved.x, display.x)
		const overlapHeight = Math.min(saved.y + saved.height, display.y + display.height) - Math.max(saved.y, display.y)
		return overlapWidth >= MIN_VISIBLE_PX && overlapHeight >= MIN_VISIBLE_PX
	})
	return fits ? saved : null
}

/** Every connected display, or an empty list when Electron's screen module is out of reach. */
export function connectedDisplays(): DisplayInfo[] {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron exists only at runtime, in Obsidian
		const electron = require('electron') as {
			remote?: { screen?: { getAllDisplays(): DisplayInfo[] } }
		}
		return electron.remote?.screen?.getAllDisplays() ?? []
	} catch {
		return []
	}
}

export interface FloatingOptions {
	isMac: boolean
	/** The main Obsidian window. The plugin's code runs in its realm, so it must not be throttled either. */
	mainWindow?: ElectronWindowLike | null
	seeThroughPercent?: number
	bounds?: WindowBounds | null
	onLockChange?: (locked: boolean) => void
}

export class FloatingWindowController {
	private locked = false
	private entered = false

	constructor(
		private readonly win: ElectronWindowLike,
		private readonly options: FloatingOptions
	) {}

	get isLocked(): boolean {
		return this.locked
	}

	enter(): void {
		this.entered = true
		this.locked = false
		this.apply(win => {
			win.setIgnoreMouseEvents(false)
			win.setAlwaysOnTop(true, 'floating')
			if (this.options.isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
			win.setBackgroundThrottling(false)
			win.setOpacity(clampSeeThrough(this.options.seeThroughPercent ?? DEFAULT_SEE_THROUGH_PERCENT) / 100)
			if (this.options.bounds) win.setBounds(this.options.bounds)
		})
		this.applyToMain(main => main.setBackgroundThrottling(false))
	}

	/** Safe on a window that is already closing, and always leaves it clickable. */
	exit(): void {
		if (!this.entered) return
		this.entered = false
		this.unlock()
		this.apply(win => {
			win.setAlwaysOnTop(false)
			if (this.options.isMac) win.setVisibleOnAllWorkspaces(false)
			win.setBackgroundThrottling(true)
			win.setOpacity(1)
		})
		this.applyToMain(main => main.setBackgroundThrottling(true))
	}

	lock(): void {
		if (!this.entered || this.locked) return
		this.locked = true
		this.apply(win => win.setIgnoreMouseEvents(true, { forward: true }))
		this.options.onLockChange?.(true)
	}

	unlock(): void {
		const wasLocked = this.locked
		this.locked = false
		this.apply(win => win.setIgnoreMouseEvents(false))
		if (wasLocked) this.options.onLockChange?.(false)
	}

	/** While the mouse is on the unlock handle the window takes clicks, so the handle can be pressed. */
	setHandleHovered(hovered: boolean): void {
		if (!this.locked) return
		this.apply(win => {
			if (hovered) win.setIgnoreMouseEvents(false)
			else win.setIgnoreMouseEvents(true, { forward: true })
		})
	}

	/** Asks macOS to leave this window out of screen capture. Older Obsidian may not offer it. */
	setHideFromShare(hide: boolean): void {
		this.apply(win => win.setContentProtection?.(hide))
	}

	setSeeThrough(percent: number): void {
		this.apply(win => win.setOpacity(clampSeeThrough(percent) / 100))
	}

	moveTo(bounds: WindowBounds): void {
		this.apply(win => win.setBounds(bounds))
	}

	currentBounds(): WindowBounds | null {
		if (this.isGone(this.win)) return null
		try {
			return this.win.getBounds()
		} catch {
			return null
		}
	}

	private isGone(win: ElectronWindowLike): boolean {
		try {
			return win.isDestroyed?.() === true
		} catch {
			return true
		}
	}

	private apply(action: (win: ElectronWindowLike) => void): void {
		this.safely(this.win, action)
	}

	private applyToMain(action: (win: ElectronWindowLike) => void): void {
		if (this.options.mainWindow) this.safely(this.options.mainWindow, action)
	}

	private safely(win: ElectronWindowLike, action: (win: ElectronWindowLike) => void): void {
		if (this.isGone(win)) return
		try {
			action(win)
		} catch (error) {
			console.warn('[Floating] Window call failed:', error)
		}
	}
}

export interface FloatRequest {
	notePath: string | null
	scrollRatio: number
	/** The reader's place by its words, because the pop-out's width wraps the text differently. */
	anchor: PassageAnchor | null
	startVoice: boolean
}

/**
 * Plugin-wide state shared by the main view and the floating view: the request the main view
 * leaves for the pop-out to pick up, and the way back when a locked window is in the way.
 */
export class FloatingSession {
	private claimedEvents = new WeakSet<Event>()

	/**
	 * Every open view hears a command. For a toggle only the first may act, or one view closes the
	 * floating window and the next sees none open and starts a new one.
	 */
	claim(event: Event): boolean {
		if (this.claimedEvents.has(event)) return false
		this.claimedEvents.add(event)
		return true
	}

	private pending: FloatRequest | null = null
	private controller: FloatingWindowController | null = null
	private closeWindow: (() => void) | null = null
	private deliver: ((type: string, detail: unknown) => void) | null = null
	private forwarding = false
	private readonly listeners = new Set<() => void>()
	private section: string | null = null
	private readonly sectionListeners = new Set<(title: string) => void>()

	/**
	 * The floating view reports the section it is reading, so the main view's Jump to Section
	 * list and note pane can follow the Prompter (ISC-139). Titles, not ids: ids are per-view
	 * render ordinals and can differ between the two views.
	 */
	reportSection(title: string): void {
		if (!this.controller || this.section === title) return
		this.section = title
		this.sectionListeners.forEach(listener => listener(title))
	}

	/** Returns the function that stops listening. */
	onSection(listener: (title: string) => void): () => void {
		this.sectionListeners.add(listener)
		return () => this.sectionListeners.delete(listener)
	}

	private readonly positionListeners = new Set<(anchor: PassageAnchor, within: number) => void>()

	/**
	 * The floating view reports where its eyeline is, so the main view's script can glide with it
	 * (ISC-141, ISC-142). An anchor, not a pixel offset: the two views differ in width and font
	 * size, so the same pixel is a different line in each. `within` is how far the eyeline has moved
	 * from the anchor word toward the next, 0 to 1, so the main view moves between words too.
	 */
	reportPosition(anchor: PassageAnchor, within: number): void {
		if (!this.controller) return
		const share = Number.isFinite(within) ? Math.min(1, Math.max(0, within)) : 0
		this.positionListeners.forEach(listener => listener(anchor, share))
	}

	/** Returns the function that stops listening. */
	onPosition(listener: (anchor: PassageAnchor, within: number) => void): () => void {
		this.positionListeners.add(listener)
		return () => this.positionListeners.delete(listener)
	}

	get active(): boolean {
		return this.controller !== null
	}

	get locked(): boolean {
		return this.controller?.isLocked ?? false
	}

	request(request: FloatRequest): void {
		this.pending = request
	}

	/** One view gets the request, once. */
	takeRequest(): FloatRequest | null {
		const request = this.pending
		this.pending = null
		return request
	}

	attach(
		controller: FloatingWindowController,
		closeWindow: () => void,
		deliver?: (type: string, detail: unknown) => void
	): void {
		this.controller = controller
		this.closeWindow = closeWindow
		this.deliver = deliver ?? null
		this.notify()
	}

	detach(controller: FloatingWindowController): void {
		if (this.controller !== controller) return
		this.controller = null
		this.closeWindow = null
		this.deliver = null
		this.section = null
		this.notify()
	}

	unlock(): void {
		this.controller?.unlock()
	}

	close(): void {
		this.closeWindow?.()
	}

	/** Remote commands arrive at the main window. The script being read is in the floating one. */
	forward(type: string, detail?: unknown): void {
		// A second view inside the floating window would hand each delivered event straight back.
		if (this.forwarding) return
		this.forwarding = true
		try {
			this.deliver?.(type, detail)
		} finally {
			this.forwarding = false
		}
	}

	/** Tells listeners the lock changed. Returns the function that stops listening. */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	notify(): void {
		this.listeners.forEach(listener => listener())
	}
}
