/**
 * Replays a recorded session through the current VoiceTrackingService at the recorded timing.
 *
 * Same stand-ins as fixtures/service-harness.ts, without bun:test so a plain script can run it: a fake
 * recognizer hands results in through `onResult`, timers run on a manual clock, `Date.now()` reads that
 * clock for the duration of the replay. There is no DOM, so word spans are never built; the page is
 * modelled as one number, the word at its reading line, which follows the place as it does in the app,
 * and the re-sync search is centred on it. The voice-activity gate fails open without a microphone, so
 * every no-progress result counts toward a stall, as it would for a reader who is still speaking.
 */

import type { TextElement, VoiceTrackingConfig } from '../types'
import type { VoiceTrackingService } from '../voice-tracking-service'
import type { HeardEvent, RecordedMatch, RecordedReread } from './trace'

/** A move the app made outside the matcher: a section jump, a manual-scroll snap, a re-wrap after an edit. */
export interface ExternalMove {
	t: number
	to: number
	/** The place a session started from, rather than a move during it. */
	anchor: boolean
}

export interface ReplayResult {
	/**
	 * The place shown right after each heard event was handed over: the matcher's place once it has
	 * moved, and before that the word the page was left on (a load resets the matcher, not the page).
	 */
	positionAfter: number[]
	/** Every change of the matcher's position, timers included. */
	moves: { t: number; from: number; to: number }[]
	/** Times the matcher armed a re-sync on its own (a stall, or a far match waiting for confirmation). */
	resyncs: number[]
	/** Where the place ended, timers flushed. */
	finalPosition: number
}

interface Internals {
	currentWordIndex: number
	wordTokens: TextElement[]
	tokens: TextElement[]
	needsGlobalSearch: boolean
	contentArea: unknown
	estimateWordIndexFromScroll: () => number
}

type ServiceClass = new (config: Partial<VoiceTrackingConfig>, recognizer: never) => VoiceTrackingService

/**
 * Where the app's matcher position changed between two recorded decisions without the matcher having
 * proposed it. A decision moves the place only within [cur, proposed] (or to a recorded re-read), so a
 * `cur` outside the previous decision's range was put there by the reader: a section jump, a manual
 * scroll, an edit. The replay makes the same move at the same moment, so it follows the same reading.
 */
export function externalMoves(heard: HeardEvent[], matches: RecordedMatch[], rereads: RecordedReread[]): ExternalMove[] {
	const moves: ExternalMove[] = []
	let previous: RecordedMatch | null = null
	for (const match of matches) {
		// Before the result that caused it; a little earlier when a held result was matched by a timer.
		const t = heard[match.heardIndex]?.t === match.t ? match.t : match.t - 1
		if (previous === null) {
			if (match.cur !== 0) moves.push({ t, to: match.cur, anchor: true })
		} else {
			const low = Math.min(previous.cur, previous.proposed)
			const high = Math.max(previous.cur, previous.proposed)
			const since = previous.t
			const reread = rereads.some(r => r.t >= since && r.t <= match.t && r.to === match.cur)
			if ((match.cur < low || match.cur > high) && !reread) moves.push({ t, to: match.cur, anchor: false })
		}
		previous = match
	}
	return moves
}

/**
 * @param startPage - The word at the page's reading line when the session starts. A script load resets
 *   the matcher to word 0 but leaves the page where the reader had it, and the re-sync searches around
 *   the page, so this is where the previous session of the same view and script left the place.
 */
export function replaySession(
	Service: ServiceClass,
	words: string[],
	heard: HeardEvent[],
	config: Partial<VoiceTrackingConfig>,
	moves: ExternalMove[],
	continued: boolean,
	startPage = 0,
): ReplayResult {
	const realNow = Date.now
	let clock = heard[0]?.t ?? 0
	Date.now = () => clock
	try {
		let nextId = 1
		let timers: { at: number; run: () => void; id: number }[] = []
		const fakeWindow = {
			setTimeout: (run: () => void, ms: number): number => {
				const id = nextId++
				timers.push({ at: clock + Math.max(0, ms), run, id })
				return id
			},
			clearTimeout: (id: number | null): void => {
				timers = timers.filter(timer => timer.id !== id)
			},
			requestAnimationFrame: (): number => nextId++,
			cancelAnimationFrame: (): void => {},
		}
		let deliver: (text: string, isFinal: boolean) => void = () => {
			throw new Error('the service never subscribed to recognizer results')
		}
		const recognizer = {
			onResult: (callback: (text: string, isFinal: boolean) => void) => { deliver = callback },
			onStatus: () => {},
			onError: () => {},
			onProgress: () => {},
			updateGrammar: () => {},
			getIsInitialized: () => true,
			getIsListening: () => true,
			getLanguage: () => config.language ?? 'en-US',
			stop: () => {},
			start: async () => {},
			initialize: async () => {},
			dispose: () => {},
		}
		const service = new Service({ engine: 'vosk', language: 'en-US', ...config }, recognizer as never)
		const internals = service as unknown as Internals
		const tokens: TextElement[] = words.map((value, index) => ({ type: 'TOKEN', value, index }))
		internals.wordTokens = tokens
		internals.tokens = tokens
		internals.contentArea = { scrollTop: 0, clientHeight: 600, ownerDocument: { defaultView: fakeWindow } }
		internals.currentWordIndex = 0
		// A start after the microphone was off searches for the reader; a re-wrap carries the place over.
		internals.needsGlobalSearch = !continued
		// The page follows the place once the matcher moves it; until then it is where it was left.
		let page = Math.max(0, Math.min(words.length - 1, startPage))
		internals.estimateWordIndexFromScroll = () => page

		const result: ReplayResult = { positionAfter: [], moves: [], resyncs: [], finalPosition: 0 }
		let position = internals.currentWordIndex
		let armed = internals.needsGlobalSearch
		const observe = (): void => {
			const now = internals.currentWordIndex
			if (now !== position) {
				result.moves.push({ t: clock, from: position, to: now })
				position = now
				page = now
			}
			if (internals.needsGlobalSearch && !armed) result.resyncs.push(clock)
			armed = internals.needsGlobalSearch
		}
		const advanceTo = (t: number): void => {
			for (;;) {
				const due = timers.filter(timer => timer.at <= t).sort((a, b) => a.at - b.at || a.id - b.id)[0]
				if (!due) break
				timers = timers.filter(timer => timer !== due)
				clock = Math.max(clock, due.at)
				due.run()
				observe()
			}
			clock = Math.max(clock, t)
		}

		const pending = [...moves].sort((a, b) => a.t - b.t)
		let m = 0
		heard.forEach(event => {
			while (m < pending.length && pending[m].t <= event.t) {
				const move = pending[m++]
				advanceTo(move.t)
				const target = Math.max(0, Math.min(words.length - 1, move.to))
				if (move.anchor && !continued) {
					// Where the page sat when the microphone came on: the search starts from there.
					internals.currentWordIndex = target
				} else {
					service.seekToWord(target)
				}
				position = internals.currentWordIndex
				page = position
				armed = internals.needsGlobalSearch
			}
			advanceTo(event.t)
			deliver(event.text, event.final)
			observe()
			result.positionAfter.push(page)
		})
		// A result held at the end of the session is still matched when its throttle window ends.
		advanceTo(clock + 2000)
		result.finalPosition = page
		return result
	} finally {
		Date.now = realNow
	}
}
