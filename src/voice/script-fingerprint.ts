/**
 * What a voice trace records about the script so a session can be replayed later: the text itself,
 * a content hash to recognise it again, and (when the host knows it) the note it came from.
 *
 * The hash is cyrb53, a 53-bit non-cryptographic hash. It identifies a script version; it does not
 * protect anything. It runs synchronously because the trace is written from the matcher's own path.
 */

/** Where the script came from, when the host can say. `mtime` is the note's modified time in ms. */
export interface ScriptSource {
	path: string
	mtime: number
}

/** 14 hex characters identifying `text`. Equal texts always give equal hashes. */
export function scriptHash(text: string): string {
	let h1 = 0xdeadbeef
	let h2 = 0x41c6ce57
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i)
		h1 = Math.imul(h1 ^ code, 2654435761)
		h2 = Math.imul(h2 ^ code, 1597334677)
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
	const value = 4294967296 * (2097151 & h2) + (h1 >>> 0)
	return value.toString(16).padStart(14, '0')
}

/**
 * The matched words as one line, the exact list voice tracking indexes. Word tokens never contain a
 * space, so splitting this on spaces gives the list back.
 */
export function wordListText(words: readonly { value: string }[]): string {
	return words.map(word => word.value).join(' ')
}

/** Which words sit in a heading, as ascending index runs: "3-5 40-47". Empty when none do. */
export function headingRangesText(words: readonly { heading?: boolean }[]): string {
	const runs: string[] = []
	for (let i = 0; i < words.length; i++) {
		if (!words[i].heading) continue
		let end = i
		while (end + 1 < words.length && words[end + 1].heading) end++
		runs.push(end === i ? String(i) : `${i}-${end}`)
		i = end
	}
	return runs.join(' ')
}

/** The word indexes of a `headingRangesText` line. Anything that is not a run is skipped. */
export function parseHeadingRanges(text: string): number[] {
	const indexes: number[] = []
	for (const run of text.split(' ')) {
		const match = /^(\d+)(?:-(\d+))?$/.exec(run)
		if (!match) continue
		const first = Number(match[1])
		const last = match[2] === undefined ? first : Number(match[2])
		for (let i = first; i <= last; i++) indexes.push(i)
	}
	return indexes
}
