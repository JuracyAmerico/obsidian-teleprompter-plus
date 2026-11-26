/**
 * Hint words for Apple's on-device recognizer (SFSpeechRecognitionRequest.contextualStrings).
 *
 * The Swift sidecar passes at most CONTEXT_HINT_LIMIT of them, so the list is spent on the words the
 * recognizer is most likely to miss: the RARE ones in this script (names, jargon, place names), rarest
 * first. Capitalisation is not a signal: in prose it mostly marks a sentence start ("Then", "Now", "I"),
 * and those words are heard perfectly well without a hint.
 */

import type { TextElement } from './types'

/** The Swift sidecar's contextualStrings cap. */
export const CONTEXT_HINT_LIMIT = 100

/** Shorter words are almost never misheard, and a hint list of them is wasted. */
const MIN_HINT_LENGTH = 4

/** An acronym ("UX", "CRS") or a word with a digit is distinctive even when short. */
function isDistinctiveShortWord(word: string): boolean {
	return /^[A-Z0-9]{2,}$/.test(word) || /\d/.test(word)
}

function foldKey(word: string): string {
	return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

interface SpokenWord {
	word: string
	/** Capitalised where a sentence does not start, an acronym, hyphenated, or with a digit. */
	nameLike: boolean
}

/**
 * Words as a reader says them: a hyphenated name ("U-Haul", "cross-border") is one word to the ear but
 * two tokens to the tokenizer, so tokens joined by a lone hyphen are put back together.
 */
function spokenWords(tokens: TextElement[]): SpokenWord[] {
	const words: SpokenWord[] = []
	let sentenceStart = true
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]
		if (token.type !== 'TOKEN') {
			// A full stop, a Markdown heading/quote/list marker or a blank line starts a sentence;
			// a single line break does not (Markdown wraps prose across lines).
			if (/[.!?:;#>*]|\n\s*\n|\n\s*[-+]\s/.test(token.value)) sentenceStart = true
			continue
		}
		let word = token.value
		while (tokens[i + 1]?.type === 'DELIMITER' && tokens[i + 1].value === '-' && tokens[i + 2]?.type === 'TOKEN') {
			word += '-' + tokens[i + 2].value
			i += 2
		}
		const capitalisedMidSentence = !sentenceStart && /^\p{Lu}/u.test(word)
		words.push({ word, nameLike: capitalisedMidSentence || word.includes('-') || isDistinctiveShortWord(word) })
		sentenceStart = false
	}
	return words
}

/**
 * The hint list for a script: each distinct word once (case and accents folded), in the form it first
 * appears, ordered rarest first. Among equally rare words, name-like ones (see SpokenWord) come first,
 * since names are what the recognizer misses; then longer words, then the order they appear in.
 *
 * @param tokens - The script tokenized WITH delimiters, so hyphenated names can be rejoined
 * @param limit - How many hints to return
 */
export function buildContextHints(tokens: TextElement[], limit: number = CONTEXT_HINT_LIMIT): string[] {
	const seen = new Map<string, { word: string; count: number; nameLike: boolean; first: number }>()
	spokenWords(tokens).forEach(({ word, nameLike }, position) => {
		if (word.length < MIN_HINT_LENGTH && !isDistinctiveShortWord(word)) return
		const key = foldKey(word)
		const entry = seen.get(key)
		if (entry) {
			entry.count++
			entry.nameLike ||= nameLike
		} else {
			seen.set(key, { word, count: 1, nameLike, first: position })
		}
	})
	return [...seen.values()]
		.sort((a, b) =>
			a.count - b.count ||
			Number(b.nameLike) - Number(a.nameLike) ||
			b.word.length - a.word.length ||
			a.first - b.first)
		.slice(0, limit)
		.map(entry => entry.word)
}
