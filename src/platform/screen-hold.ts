/**
 * Keeps the screen on while reading. The desktop app holds it through Electron's powerSaveBlocker;
 * the phone has no Electron, so it uses the browser's screen wake lock instead. iOS drops a wake
 * lock whenever the app goes to the background, so the lock is asked for again on return.
 */
import { nativeModule } from './native'

interface PowerSaveBlocker {
	start(type: string): number
	stop(id: number): void
}

interface WakeLockSentinel {
	released?: boolean
	release(): Promise<void>
}

export interface WakeLockApi {
	request(type: 'screen'): Promise<WakeLockSentinel>
}

export interface ScreenHoldDeps {
	powerSaveBlocker: () => PowerSaveBlocker | null
	wakeLock: () => WakeLockApi | null
	doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null
}

function defaultDeps(): ScreenHoldDeps {
	return {
		powerSaveBlocker: () => {
			const electron = nativeModule<{ powerSaveBlocker?: PowerSaveBlocker; remote?: { powerSaveBlocker?: PowerSaveBlocker } }>('electron')
			return electron?.remote?.powerSaveBlocker ?? electron?.powerSaveBlocker ?? null
		},
		wakeLock: () => (typeof navigator !== 'undefined' && 'wakeLock' in navigator
			? (navigator as unknown as { wakeLock: WakeLockApi }).wakeLock
			: null),
		doc: typeof document === 'undefined' ? null : document,
	}
}

export class ScreenHold {
	private blockerId: number | null = null
	private sentinel: WakeLockSentinel | null = null
	private wanted = false
	private readonly onVisible = () => {
		if (this.wanted && this.deps.doc?.visibilityState === 'visible') void this.requestWakeLock()
	}

	constructor(private readonly deps: ScreenHoldDeps = defaultDeps()) {}

	/** Whether this device can hold the screen at all; the button is hidden where it cannot. */
	get supported(): boolean {
		return this.deps.powerSaveBlocker() !== null || this.deps.wakeLock() !== null
	}

	/** Returns whether a hold is now in place (or being asked for, on the phone). */
	start(): boolean {
		if (this.wanted) return true
		const blocker = this.deps.powerSaveBlocker()
		if (blocker) {
			this.blockerId = blocker.start('prevent-display-sleep')
			this.wanted = true
			return true
		}
		if (!this.deps.wakeLock()) return false
		this.wanted = true
		this.deps.doc?.addEventListener('visibilitychange', this.onVisible)
		void this.requestWakeLock()
		return true
	}

	stop(): void {
		this.wanted = false
		if (this.blockerId !== null) {
			try { this.deps.powerSaveBlocker()?.stop(this.blockerId) } catch { /* the window may be gone */ }
			this.blockerId = null
		}
		this.deps.doc?.removeEventListener('visibilitychange', this.onVisible)
		const sentinel = this.sentinel
		this.sentinel = null
		if (sentinel && !sentinel.released) void sentinel.release().catch(() => { /* already gone */ })
	}

	private async requestWakeLock(): Promise<void> {
		const api = this.deps.wakeLock()
		if (!api) return
		try {
			const sentinel = await api.request('screen')
			// Stopped while the request was in flight: give the lock straight back
			if (!this.wanted) {
				void sentinel.release().catch(() => {})
				return
			}
			this.sentinel = sentinel
		} catch {
			// Refused (low battery mode, page hidden); the next return to the app asks again
		}
	}
}
