/**
 * A simulated reader for gap tests: someone reading a script aloud at a steady pace, pausing at the
 * end of each sentence, heard through a recognizer that behaves like Apple's on-device engine.
 *
 * - Each word is heard `latencyMs` after it is spoken.
 * - Partials are cumulative from the start of the utterance and arrive every `partialEveryMs` while
 *   new words keep coming. A sentence-end pause closes the utterance with a final result.
 * - An accent model swaps some words for what a recognizer hears from a Brazilian speaker
 *   ("tablo" for "Tableau", "brasil" for "Brazil"), deterministically, so runs are repeatable.
 */

import { tokenize } from '../word-tokenizer'

export interface ReaderOptions {
	wordsPerSecond: number
	latencyMs: number
	partialEveryMs: number
	sentencePauseMs: number
	/** Every Nth word is misheard as an accented form; 0 for none. */
	accentEvery: number
	/** Every Nth word is said as a different word (a paraphrase), offset from the accent; 0 for none. */
	paraphraseEvery?: number
	/** After every Nth sentence the reader says something off the script; 0 for never. */
	asideEverySentences?: number
}

export const NON_NATIVE_READER: ReaderOptions = {
	wordsPerSecond: 2.4,
	latencyMs: 350,
	partialEveryMs: 120,
	sentencePauseMs: 450,
	accentEvery: 7,
}

export interface RecognizerEvent { at: number; text: string; isFinal: boolean }

export interface ReaderTimeline {
	/** When each script word is spoken, ms from the start. */
	spokenAt: number[]
	events: RecognizerEvent[]
	endsAt: number
}

/** Accent substitutions heard from a Brazilian reader of English. */
const ACCENTED: Record<string, string> = {
	tableau: 'tablo',
	brazil: 'brasil',
	customers: 'costumers',
	the: 'de',
	think: 'tink',
	three: 'tree',
	health: 'helt',
	that: 'dat',
	with: 'wit',
	this: 'dis',
}

/** Things said off the script between sentences. */
const ASIDES = [
	'sorry let me grab some water real quick',
	'um so where was I again',
	'okay one second my phone is ringing',
	'let me start that part over from the top',
	'and so yeah that is basically it for this',
]

/** Words a speaker puts in place of the script's own when paraphrasing. */
const PARAPHRASE = ['really', 'basically', 'pretty', 'kind', 'stuff', 'whole', 'guess']

function accented(word: string): string {
	const lower = word.toLowerCase()
	if (ACCENTED[lower]) return ACCENTED[lower]
	// Otherwise a vowel heard differently, the commonest slip
	return lower.replace(/[aeiou](?=[^aeiou]*$)/, v => (v === 'i' ? 'e' : 'i'))
}

export function simulateReader(script: string, options: ReaderOptions): ReaderTimeline {
	const elements = tokenize(script)
	const heardWords: string[] = []
	const spokenAt: number[] = []
	const sentenceEnds = new Set<number>()
	const asides: { at: number; words: string[] }[] = []

	let t = 0
	const perWord = 1000 / options.wordsPerSecond
	for (const element of elements) {
		if (element.type === 'TOKEN') {
			const index = heardWords.length
			const misheard = options.accentEvery > 0 && index % options.accentEvery === options.accentEvery - 1
			const paraphraseEvery = options.paraphraseEvery ?? 0
			const swapped = paraphraseEvery > 0 && index % paraphraseEvery === Math.floor(paraphraseEvery / 2)
			heardWords.push(swapped ? PARAPHRASE[index % PARAPHRASE.length] : misheard ? accented(element.value) : element.value)
			spokenAt.push(t)
			t += perWord
		} else if (/[.!?]/.test(element.value) && heardWords.length > 0) {
			sentenceEnds.add(heardWords.length - 1)
			t += options.sentencePauseMs
			const asideEvery = options.asideEverySentences ?? 0
			if (asideEvery > 0 && sentenceEnds.size % asideEvery === 0) {
				const words = ASIDES[asides.length % ASIDES.length].split(' ')
				asides.push({ at: t, words })
				t += words.length * perWord + options.sentencePauseMs
			}
		}
	}

	const events: RecognizerEvent[] = []
	for (const aside of asides) {
		aside.words.forEach((_, k) => {
			events.push({ at: aside.at + k * perWord + options.latencyMs, text: aside.words.slice(0, k + 1).join(' '), isFinal: false })
		})
		events.push({ at: aside.at + aside.words.length * perWord + options.latencyMs + 200, text: aside.words.join(' '), isFinal: true })
	}
	let utteranceStart = 0
	let lastEmittedCount = 0
	const visibleAt = (i: number) => spokenAt[i] + options.latencyMs

	for (let i = 0; i < heardWords.length; i++) {
		// Partials while word i is the newest one heard, until the next word becomes visible
		const nextVisible = i + 1 < heardWords.length ? visibleAt(i + 1) : visibleAt(i) + options.partialEveryMs
		for (let at = visibleAt(i); at < nextVisible; at += options.partialEveryMs) {
			const count = i + 1 - utteranceStart
			if (count === lastEmittedCount) continue
			events.push({ at, text: heardWords.slice(utteranceStart, i + 1).join(' '), isFinal: false })
			lastEmittedCount = count
		}
		if (sentenceEnds.has(i) || i === heardWords.length - 1) {
			events.push({ at: visibleAt(i) + 200, text: heardWords.slice(utteranceStart, i + 1).join(' '), isFinal: true })
			utteranceStart = i + 1
			lastEmittedCount = 0
		}
	}
	events.sort((a, b) => a.at - b.at)
	return { spokenAt, events, endsAt: (spokenAt.at(-1) ?? 0) + options.latencyMs + 1000 }
}

export interface GapReport {
	/** Mean words between the word being spoken and the service's position, sampled every 100 ms. */
	meanGap: number
	/** Largest such gap during the run. */
	maxGap: number
	/** Most words the service was ever AHEAD of the word being spoken. */
	maxAhead: number
	/** Where the service ended, and the last script word. */
	finalIndex: number
	lastWord: number
}

/** Play a timeline into a harness and measure how far the service trails the voice. */
export function measureGap(
	timeline: ReaderTimeline,
	hear: (text: string, isFinal: boolean) => void,
	advance: (ms: number) => void,
	position: () => number,
): GapReport {
	const SAMPLE_MS = 100
	let clock = 0
	let next = 0
	let total = 0
	let samples = 0
	let maxGap = 0
	let maxAhead = 0
	const spokenIndexAt = (t: number): number => {
		let index = -1
		while (index + 1 < timeline.spokenAt.length && timeline.spokenAt[index + 1] <= t) index++
		return index
	}

	for (let sampleAt = 0; sampleAt <= timeline.endsAt; sampleAt += SAMPLE_MS) {
		while (next < timeline.events.length && timeline.events[next].at <= sampleAt) {
			const event = timeline.events[next++]
			advance(event.at - clock)
			clock = event.at
			hear(event.text, event.isFinal)
		}
		advance(sampleAt - clock)
		clock = sampleAt
		const spoken = spokenIndexAt(sampleAt)
		if (spoken < 0) continue
		const gap = Math.max(0, spoken - position())
		maxAhead = Math.max(maxAhead, position() - spoken)
		total += gap
		samples++
		maxGap = Math.max(maxGap, gap)
	}
	return {
		meanGap: samples > 0 ? total / samples : 0,
		maxGap,
		maxAhead,
		finalIndex: position(),
		lastWord: timeline.spokenAt.length - 1,
	}
}
