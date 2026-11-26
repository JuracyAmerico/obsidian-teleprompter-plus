import type { PassageAnchor } from '../passage-anchor'
import { sameSection, type SectionRef } from '../sections'
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

/**
 * Where the floating window opens. On the Prompter it is solid unless the reader chose otherwise:
 * a call window placed on the Prompter display, under the script, shows through it, so the reader
 * sees the interviewer while looking into the camera (Américo, 2026-11-25, ISC-145).
 */
export function floatingPlacement(
	displays: DisplayInfo[],
	preferences: {
		preferPrompter: boolean
		savedBounds: WindowBounds | null | undefined
		seeThroughPercent: number
		prompterSeeThroughPercent?: number
		prompterSize?: { width: number; height: number } | null
	}
): FloatingPlacement {
	const prompter = preferences.preferPrompter ? findPrompterDisplay(displays) : null
	if (prompter) {
		return {
			bounds: centeredOnPrompter(prompter.bounds, preferences.prompterSize),
			onPrompter: true,
			seeThroughPercent: clampSeeThrough(preferences.prompterSeeThroughPercent ?? MAX_SEE_THROUGH_PERCENT),
		}
	}
	return {
		bounds: restorableBounds(preferences.savedBounds, displays.map(display => display.bounds)),
		onPrompter: false,
		seeThroughPercent: clampSeeThrough(preferences.seeThroughPercent),
	}
}

/**
 * The window on the Prompter: the size the reader left it at, centred on the Prompter, or the whole
 * Prompter when no size was kept (Américo, 2026-11-25: "keep the floating window at that size I'm now
 * and centered", ISC-146). A size larger than the Prompter is capped to it.
 */
export function centeredOnPrompter(
	display: WindowBounds,
	size: { width: number; height: number } | null | undefined
): WindowBounds {
	if (!size || !(size.width > 0) || !(size.height > 0)) return display
	const width = Math.min(Math.round(size.width), display.width)
	const height = Math.min(Math.round(size.height), display.height)
	return {
		x: display.x + Math.round((display.width - width) / 2),
		y: display.y + Math.round((display.height - height) / 2),
		width,
		height,
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
	private section: SectionRef | null = null
	private readonly sectionListeners = new Set<(section: SectionRef) => void>()

	/**
	 * The floating view reports the section it is reading, so the main view's Jump to Section
	 * list and note pane can follow the Prompter (ISC-139). A section reference (line, title and
	 * occurrence), not an id: ids are per-view render ordinals; and not a bare title, which named the
	 * first of every repeated "Situation" in a STAR answer bank.
	 */
	reportSection(section: SectionRef): void {
		if (!this.controller || sameSection(this.section, section)) return
		this.section = section
		this.sectionListeners.forEach(listener => listener(section))
	}

	/** Returns the function that stops listening. */
	onSection(listener: (section: SectionRef) => void): () => void {
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

	private note: string | null = null

	/**
	 * The note the floating window is reading. While a script floats, the main view stays on this
	 * note instead of following whichever note the reader clicks: switching reset both clocks and
	 * sent the Prompter to the wrong section (list item #3, ISC-148).
	 */
	get notePath(): string | null {
		return this.controller ? this.note : null
	}

	setNote(path: string | null): void {
		this.note = path
	}

	/** Keeps the floating note's path right when it is renamed while it floats. */
	renamed(oldPath: string, newPath: string): void {
		if (this.note === oldPath) this.note = newPath
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
		this.lastWindowClose = closeWindow
		this.deliver = deliver ?? null
		this.notify()
	}

	detach(controller: FloatingWindowController): void {
		if (this.controller !== controller) return
		this.controller = null
		this.closeWindow = null
		this.deliver = null
		this.section = null
		this.note = null
		this.notify()
	}

	unlock(): void {
		this.controller?.unlock()
	}

	close(): void {
		// Closed on purpose: nothing is left for closeOnUnload to close later.
		this.lastWindowClose = null
		this.closeWindow?.()
	}

	/**
	 * The floating window's closer, kept after its view is torn down. On a plugin reload or update,
	 * Obsidian destroys the view before the plugin's onunload runs, so close() has nothing left to
	 * call and the window came back as an ordinary pop-out on the Prompter (dead window, ISC-155).
	 */
	private lastWindowClose: (() => void) | null = null

	/** Closes the floating window on plugin unload, even when its view was already torn down. */
	closeOnUnload(): void {
		const close = this.closeWindow ?? this.lastWindowClose
		this.lastWindowClose = null
		try {
			close?.()
		} catch (error) {
			console.warn("[Floating] Could not close the floating window on unload:", error)
		}
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
