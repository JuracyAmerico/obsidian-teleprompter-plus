/**
 * The read-aloud speed lives in settings, because every new read-aloud service starts from
 * settings.ttsRate: the floating view's first read, and the engine rebuilt after a voice or engine
 * change. Changing the speed only on the running service made it snap back to the old value then.
 */

const MIN_RATE = 0.5
const MAX_RATE = 2.0

/** Injected so tests can run the delayed save by hand. */
export interface SaveTimers {
	set(run: () => void, ms: number): unknown
	clear(handle: unknown): void
}

const REAL_TIMERS: SaveTimers = {
	set: (run, ms) => setTimeout(run, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * Returns the function to call with each new speed. Settings change at once, so a service built
 * a moment later already reads the new speed; the write to disk waits until the slider settles.
 */
export function createRateMemory(
	settings: { ttsRate: number },
	save: () => void,
	delayMs = 500,
	timers: SaveTimers = REAL_TIMERS
): (rate: number) => void {
	let pending: unknown = null
	return (rate: number) => {
		if (!Number.isFinite(rate)) return
		const next = Math.max(MIN_RATE, Math.min(MAX_RATE, rate))
		if (settings.ttsRate === next && pending === null) return
		settings.ttsRate = next
		if (pending !== null) timers.clear(pending)
		pending = timers.set(() => {
			pending = null
			save()
		}, delayMs)
	}
}
