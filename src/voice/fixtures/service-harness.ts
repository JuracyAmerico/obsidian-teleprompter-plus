/**
 * Drives the real VoiceTrackingService without a DOM, a microphone or a wall clock: a fake recognizer
 * hands results in through the same `onResult` callback the real engines use, timers run on a manual
 * clock, and `Date.now()` reads that clock. Tests then assert on where the service believes the reader is.
 *
 * Bun has no DOM, so the content area is a stand-in carrying only what the service touches: its window
 * (for timers and frames) and a scroll position. Word spans are never built, so the scroll follow never
 * runs; the matcher position is what is under test.
 */

import { spyOn } from 'bun:test'
import type { TextElement, VoiceTrackingConfig } from '../types'
import type { VoiceTrackingService } from '../voice-tracking-service'
import { tokenizeWords } from '../word-tokenizer'

type ResultCallback = (text: string, isFinal: boolean) => void

interface Timer { at: number; run: () => void; id: number }

/** The private state a test reads or seeds. Kept to the fields the assertions need. */
export interface ServiceInternals {
	currentWordIndex: number
	wordTokens: TextElement[]
	needsGlobalSearch: boolean
	contentArea: unknown
	buildContextVocabulary(): string | undefined
	estimateWordIndexFromScroll: () => number
	tokens: TextElement[]
}

export interface Harness {
	service: VoiceTrackingService
	internals: ServiceInternals
	words: TextElement[]
	/** Hand the service one recognizer result at the current clock time. */
	hear: (text: string, isFinal?: boolean) => void
	/** Move the clock forward, running every timer that falls due on the way, in order. */
	advance: (ms: number) => void
	now: () => number
	/** Index of the first script word equal to `word` (case-insensitive) at or after `from`. */
	at: (word: string, from?: number) => number
	/** Put the clock back and drop the Date.now spy. Call in afterEach. */
	restore: () => void
}

export function createHarness(
	Service: new (config: Partial<VoiceTrackingConfig>, recognizer: never) => VoiceTrackingService,
	script: string,
	config: Partial<VoiceTrackingConfig> = {},
): Harness {
	let clock = 1_000_000
	let nextId = 1
	let timers: Timer[] = []
	const clockSpy = spyOn(Date, 'now').mockImplementation(() => clock)

	const fakeWindow = {
		setTimeout: (run: () => void, ms: number): number => {
			const id = nextId++
			timers.push({ at: clock + Math.max(0, ms), run, id })
			return id
		},
		clearTimeout: (id: number | null): void => {
			timers = timers.filter(t => t.id !== id)
		},
		// Frames never run here: no word spans exist, so the scroll follow is never armed.
		requestAnimationFrame: (): number => nextId++,
		cancelAnimationFrame: (): void => {},
	}

	let deliver: ResultCallback = () => {
		throw new Error('service never subscribed to recognizer results')
	}
	const recognizer = {
		onResult: (callback: ResultCallback) => { deliver = callback },
		onStatus: () => {},
		onError: () => {},
		onProgress: () => {},
		updateGrammar: () => {},
		getIsInitialized: () => true,
		getIsListening: () => true,
		getLanguage: () => 'en-US',
		stop: () => {},
		start: async () => {},
		initialize: async () => {},
		dispose: () => {},
	}

	const service = new Service({ engine: 'vosk', language: 'en-US', ...config }, recognizer as never)
	const internals = service as unknown as ServiceInternals
	const words = tokenizeWords(script)
	internals.wordTokens = words
	internals.contentArea = { scrollTop: 0, clientHeight: 600, ownerDocument: { defaultView: fakeWindow } }
	internals.currentWordIndex = 0
	internals.needsGlobalSearch = false
	// The re-sync search is centred on the word at the reading line. In the app the page follows the
	// place, so that word is the place; without spans the service would always answer word 0.
	internals.estimateWordIndexFromScroll = () => internals.currentWordIndex

	const advance = (ms: number): void => {
		const until = clock + ms
		for (;;) {
			const due = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at || a.id - b.id)[0]
			if (!due) break
			timers = timers.filter(t => t !== due)
			clock = Math.max(clock, due.at)
			due.run()
		}
		clock = until
	}

	return {
		service,
		internals,
		words,
		hear: (text, isFinal = false) => deliver(text, isFinal),
		advance,
		now: () => clock,
		at: (word, from = 0) => {
			const wanted = word.toLowerCase()
			const index = words.findIndex((t, i) => i >= from && t.value.toLowerCase() === wanted)
			if (index < 0) throw new Error(`"${word}" is not in the script after word ${from}`)
			return index
		},
		restore: () => clockSpy.mockRestore(),
	}
}
