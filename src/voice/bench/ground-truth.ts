/**
 * Ground truth for a recorded session: for each recognizer result, the script word the reader had
 * just said. Worked out offline from the whole session, which the live matcher never has.
 *
 * Method:
 *  1. Utterances. A recognizer result normally repeats its utterance from the start with one more word
 *     (or a revised word). A result after a final, or one that is much shorter than the previous result
 *     or starts with different words, opens a new utterance.
 *  2. Later context. Each utterance is represented by its LAST result, the recognizer's best and most
 *     complete hypothesis, which already revised the misheard words of the earlier partials.
 *  3. Placement. That hypothesis is cut into units of about 16 words. Each unit is aligned against the
 *     whole script with a fitting alignment (every heard word aligned or counted as an insertion, the
 *     script free at both ends; exact word 1, near word 0.5, other word -0.8, gap -0.7), keeping the
 *     best few placements in distinct places.
 *  4. Sequence. A Viterbi pass picks one placement per unit for the whole session, or marks the unit
 *     off-script: carrying straight on from the previous unit is free, any other move (a re-read, a
 *     section jump) costs 3 points, so a repeated phrase is placed where the reading actually was.
 *  5. Final words. A word the placement inserted keeps the place of the nearest placed word before it,
 *     unless it is the next script word (words read just before a skipped sentence) or a false start of
 *     the next placed word ("a small smaller problem"), which take that word's place.
 *  6. Each result. The last few words of each result are aligned into its utterance's final hypothesis
 *     to find which final word its newest word became (a stutter in the result is cheaper than a
 *     missing final word; a revised newest word, "Pablo" for "Tableau", counts when the word before it
 *     lines up next to it). That final word's script index is the truth. Results in an off-script
 *     unit, or with no placed word before them, get no truth and are left out of every metric.
 *
 * Checked by hand against 47 results of a real rehearsal (fixtures/bench-sample.ts), stutters, revised
 * words and a restart from an earlier line included; ground-truth.test.ts holds the aligner to them.
 */

import { levenshteinDistance, similarity } from '../levenshtein'
import { cleanWord, tokenizeWords } from '../word-tokenizer'
import type { HeardEvent } from './trace'

const UNIT_WORDS = 16
const MIN_LAST_UNIT = 6
const CANDIDATES = 4
const EXACT = 1
const NEAR = 0.5
const MISMATCH = -0.8
const GAP = -0.7
/** A final-hypothesis word the result does not have yet: rarer than a stutter in the result. */
const FINAL_WORD_SKIPPED = -1
/** A result word the recognizer replaced in the final: likelier than an inserted word. */
const REVISED = -0.6
const JUMP_COST = 3
const OFF_SCRIPT_SWITCH = 0.5
/** A continuation may skip this many script words, or repeat this many, at no cost. */
const SKIP_FREE = 6
const REPEAT_FREE = 2
/** How many trailing words of a result are aligned into the final hypothesis. */
const TAIL_WORDS = 5

export function heardWords(text: string): string[] {
	return tokenizeWords(text).map(token => cleanWord(token.value)).filter(word => word.length > 0)
}

function wordScore(a: string, b: string): number {
	if (a === b) return EXACT
	if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return NEAR
	if (a.length >= 4 && b.length >= 4 && similarity(a, b) >= 0.75) return NEAR
	// Short homophones the recognizer swaps: "by" for "buy", "the" for "they".
	if (a.length >= 2 && b.length >= 2 && a[0] === b[0] && levenshteinDistance(a, b) === 1) return NEAR
	return MISMATCH
}

export interface Utterance {
	/** Indexes into the session's heard events, in order. */
	events: number[]
	/** Words of the last result of the utterance. */
	final: string[]
}

/** Does result `a` start like result `b`? Order-tolerant: a revision can insert or drop a word. */
function sameStart(a: string[], b: string[]): boolean {
	const k = Math.min(3, a.length, b.length)
	const opening = b.slice(0, k + 2)
	let same = 0
	for (let i = 0; i < k; i++) if (opening.some(word => wordScore(a[i], word) > 0)) same++
	return same * 2 >= k
}

/** Step 1: group recognizer results into utterances. Results with no words belong to none. */
export function splitUtterances(heard: HeardEvent[]): Utterance[] {
	const utterances: Utterance[] = []
	let previous: { words: string[]; final: boolean } | null = null
	heard.forEach((event, index) => {
		const words = heardWords(event.text)
		if (words.length === 0) return
		const opens = previous === null || previous.final ||
			words.length < previous.words.length * 0.5 ||
			!sameStart(words, previous.words)
		if (opens) utterances.push({ events: [], final: [] })
		const current = utterances[utterances.length - 1]
		current.events.push(index)
		current.final = words
		previous = { words, final: event.final }
	})
	return utterances
}

export interface Placement {
	score: number
	start: number
	end: number
	/** Script index for each unit word, -1 for an insertion. */
	map: number[]
}

/** Step 3: fitting alignment of `unit` into `script`, best placements in distinct places. */
export function placeUnit(unit: string[], script: string[], keep = CANDIDATES): Placement[] {
	const rows = unit.length + 1
	const cols = script.length + 1
	if (unit.length === 0 || script.length === 0) return []
	const score = new Float64Array(rows * cols)
	// 0 diagonal, 1 up (unit word inserted), 2 left (script word skipped)
	const move = new Uint8Array(rows * cols)
	for (let i = 1; i < rows; i++) {
		score[i * cols] = i * GAP
		move[i * cols] = 1
	}
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const diagonal = score[(i - 1) * cols + j - 1] + wordScore(unit[i - 1], script[j - 1])
			const up = score[(i - 1) * cols + j] + GAP
			const left = i === rows - 1 ? -Infinity : score[i * cols + j - 1] + GAP
			let best = diagonal
			let from = 0
			if (up > best) { best = up; from = 1 }
			if (left > best) { best = left; from = 2 }
			score[i * cols + j] = best
			move[i * cols + j] = from
		}
	}
	const last = (rows - 1) * cols
	const ends = Array.from({ length: script.length }, (_, k) => k + 1)
		.sort((a, b) => score[last + b] - score[last + a])
	const placements: Placement[] = []
	for (const endColumn of ends) {
		if (placements.length >= keep) break
		const map = new Array<number>(unit.length).fill(-1)
		let i = rows - 1
		let j = endColumn
		while (i > 0) {
			const from = move[i * cols + j]
			if (j === 0 || from === 1) {
				i--
			} else if (from === 0) {
				map[i - 1] = j - 1
				i--
				j--
			} else {
				j--
			}
		}
		const placed = map.filter(index => index >= 0)
		if (placed.length === 0) continue
		const start = Math.min(...placed)
		const end = Math.max(...placed)
		if (placements.some(p => start <= p.end + unit.length && end >= p.start - unit.length)) continue
		placements.push({ score: score[last + endColumn], start, end, map })
	}
	return placements
}

interface Unit {
	utterance: number
	/** Offset of the unit's first word in its utterance's final hypothesis. */
	offset: number
	words: string[]
	candidates: Placement[]
}

function cutUnits(utterances: Utterance[], script: string[]): Unit[] {
	const units: Unit[] = []
	utterances.forEach((utterance, u) => {
		const total = utterance.final.length
		for (let offset = 0; offset < total; offset += UNIT_WORDS) {
			let end = Math.min(total, offset + UNIT_WORDS)
			if (total - end < MIN_LAST_UNIT) end = total
			const words = utterance.final.slice(offset, end)
			units.push({ utterance: u, offset, words, candidates: placeUnit(words, script) })
			if (end === total) break
		}
	})
	return units
}

function moveCost(previousEnd: number, nextStart: number): number {
	const step = nextStart - previousEnd - 1
	return step >= -REPEAT_FREE && step <= SKIP_FREE ? 0 : JUMP_COST
}

/** Step 4: one placement (or off-script, null) per unit, best over the whole session. */
function chooseSequence(units: Unit[]): (Placement | null)[] {
	interface Cell { total: number; back: number; lastEnd: number }
	const table: Cell[][] = []
	units.forEach((unit, u) => {
		const options: (Placement | null)[] = [...unit.candidates, null]
		const row: Cell[] = options.map(option => {
			const emission = option ? option.score : 0
			if (u === 0) return { total: emission, back: -1, lastEnd: option ? option.end : -1 }
			const previousOptions: (Placement | null)[] = [...units[u - 1].candidates, null]
			let best: Cell = { total: -Infinity, back: -1, lastEnd: -1 }
			table[u - 1].forEach((previous, p) => {
				const before = previousOptions[p]
				let cost: number
				if (option && before) cost = moveCost(before.end, option.start)
				else if (option) cost = previous.lastEnd < 0 ? 0 : moveCost(previous.lastEnd, option.start) + OFF_SCRIPT_SWITCH
				else cost = before ? OFF_SCRIPT_SWITCH : 0
				const total = previous.total + emission - cost
				if (total > best.total) best = { total, back: p, lastEnd: option ? option.end : previous.lastEnd }
			})
			return best
		})
		table.push(row)
	})
	const chosen: (Placement | null)[] = new Array<Placement | null>(units.length).fill(null)
	if (units.length === 0) return chosen
	let index = table[units.length - 1].reduce((best, cell, k, row) => (cell.total > row[best].total ? k : best), 0)
	for (let u = units.length - 1; u >= 0; u--) {
		const options = [...units[u].candidates, null]
		chosen[u] = options[index]
		index = table[u][index].back
	}
	return chosen
}

/**
 * Step 5: which word of `final` the last word of `partial` became, or -1.
 *
 * A result is a revised prefix of its final hypothesis, so a word of the final missing from the result
 * costs more than a word of the result missing from the final (a stutter such as "a broken a broken").
 * The newest word takes the final word it is aligned with when the two agree; when they differ (the
 * recognizer revised it, "Pablo" to "Tableau") only if the word before it lines up right next to it.
 * Otherwise the newest word that does line up is used.
 */
export function lastWordInFinal(partial: string[], final: string[]): number {
	if (partial.length === 0 || final.length === 0) return -1
	const tail = partial.slice(-TAIL_WORDS)
	const expected = partial.length - 1
	const from = Math.max(0, expected - tail.length - 10)
	const to = Math.min(final.length, expected + 6)
	const window = final.slice(from, to)
	if (window.length === 0) return Math.min(final.length - 1, expected)
	const rows = tail.length + 1
	const cols = window.length + 1
	const score = new Float64Array(rows * cols)
	const move = new Uint8Array(rows * cols)
	for (let i = 1; i < rows; i++) {
		score[i * cols] = i * GAP
		move[i * cols] = 1
	}
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const pair = wordScore(tail[i - 1], window[j - 1])
			const diagonal = score[(i - 1) * cols + j - 1] + (pair > 0 ? pair : REVISED)
			const up = score[(i - 1) * cols + j] + GAP
			const left = i === rows - 1 ? -Infinity : score[i * cols + j - 1] + FINAL_WORD_SKIPPED
			let best = diagonal
			let fromMove = 0
			if (up > best) { best = up; fromMove = 1 }
			if (left > best) { best = left; fromMove = 2 }
			score[i * cols + j] = best
			move[i * cols + j] = fromMove
		}
	}
	// Best end; ties go to the end nearest where the word would sit if nothing was revised.
	let bestColumn = 1
	for (let j = 1; j < cols; j++) {
		const better = score[(rows - 1) * cols + j] > score[(rows - 1) * cols + bestColumn]
		const tie = score[(rows - 1) * cols + j] === score[(rows - 1) * cols + bestColumn]
		if (better || (tie && Math.abs(from + j - 1 - expected) < Math.abs(from + bestColumn - 1 - expected))) bestColumn = j
	}
	// Walk back to the newest tail word that lines up with a final word.
	let i = rows - 1
	let j = bestColumn
	while (i > 0) {
		const fromMove = move[i * cols + j]
		if (j > 0 && fromMove === 0) {
			const agrees = wordScore(tail[i - 1], window[j - 1]) > 0
			const newest = i === rows - 1
			const neighbourAgrees = newest && i > 1 && j > 1 && move[(i - 1) * cols + j - 1] === 0 &&
				wordScore(tail[i - 2], window[j - 2]) > 0
			if (agrees || neighbourAgrees) return from + j - 1
			i--
			j--
		} else if (j === 0 || fromMove === 1) {
			i--
		} else {
			j--
		}
	}
	return -1
}

export interface Truth {
	/** Script index of the word just said, per heard event; null where there is no reliable truth. */
	positions: (number | null)[]
	utterances: number
	units: number
	offScriptUnits: number
}

/** Ground truth for every recognizer result of a session. */
export function groundTruth(heard: HeardEvent[], script: string[]): Truth {
	const cleanScript = script.map(word => cleanWord(word))
	const utterances = splitUtterances(heard)
	const units = cutUnits(utterances, cleanScript)
	const chosen = chooseSequence(units)

	// Script index of every final word of every utterance; -1 off-script or before any placed word.
	// An inserted word keeps the place of the last placed word before it: the reader is still there.
	const finalIndex: number[][] = utterances.map(u => new Array<number>(u.final.length).fill(-1))
	const placed: boolean[][] = utterances.map(u => new Array<boolean>(u.final.length).fill(false))
	const offScript: boolean[][] = utterances.map(u => new Array<boolean>(u.final.length).fill(false))
	let carried = -1
	units.forEach((unit, k) => {
		const placement = chosen[k]
		unit.words.forEach((_, w) => {
			const at = unit.offset + w
			if (!placement) {
				offScript[unit.utterance][at] = true
				return
			}
			let index = placement.map[w]
			// An inserted word that is the next script word continues the reading: the words read just
			// before a skipped sentence land at the start of the unit that jumps past it.
			if (index < 0 && carried >= 0 && carried + 1 < cleanScript.length && wordScore(unit.words[w], cleanScript[carried + 1]) > 0) {
				index = carried + 1
			}
			if (index >= 0) carried = index
			placed[unit.utterance][at] = index >= 0
			finalIndex[unit.utterance][at] = index >= 0 ? index : carried
		})
	})
	// A false start of the next word ("a small smaller problem") is that word, not the one before it.
	utterances.forEach((utterance, u) => {
		for (let at = utterance.final.length - 2; at >= 0; at--) {
			if (placed[u][at] || offScript[u][at] || !placed[u][at + 1]) continue
			const next = finalIndex[u][at + 1]
			if (wordScore(utterance.final[at], cleanScript[next]) > 0) finalIndex[u][at] = next
		}
	})

	const positions: (number | null)[] = new Array<number | null>(heard.length).fill(null)
	utterances.forEach((utterance, u) => {
		for (const event of utterance.events) {
			const at = lastWordInFinal(heardWords(heard[event].text), utterance.final)
			if (at < 0 || offScript[u][at]) continue
			const index = finalIndex[u][at]
			positions[event] = index >= 0 ? index : null
		}
	})
	return {
		positions,
		utterances: utterances.length,
		units: units.length,
		offScriptUnits: chosen.filter(c => c === null).length,
	}
}
