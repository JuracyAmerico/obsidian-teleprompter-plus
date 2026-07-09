/**
 * Maps rendered heading ordinals back to their line in the source markdown.
 *
 * The teleprompter renders headings with ids like `header-3`. That number is a render-order
 * ordinal and carries no positional information — anything that needs a source line must ask
 * this module, never parse the id.
 *
 * The subtlety: marked parses a *stripped* copy of the note (HTML comments, Pandoc raw blocks,
 * fenced divs and bare URLs are all removed first), so parser offsets do not correspond to lines
 * in the original. Instead we re-find each heading's raw text in the original with a forward-only
 * cursor, which keeps duplicate heading texts in document order.
 */

/** Result of stripping YAML frontmatter: the body, and how many lines were consumed. */
export interface FrontmatterStripResult {
	content: string
	linesRemoved: number
}

/**
 * Strip leading YAML frontmatter. `linesRemoved` is the line shift between the returned
 * content and the original file, so `contentLine + linesRemoved === fileLine`.
 */
export function removeYAMLFrontmatter(text: string): FrontmatterStripResult {
	if (text.startsWith('---\n')) {
		const endIndex = text.indexOf('\n---\n', 4)
		if (endIndex !== -1) {
			const removed = text.slice(0, endIndex + 5)
			// split() counts the empty string after the final newline; the line shift is the
			// number of newlines consumed, not the number of split parts.
			const linesRemoved = removed.split('\n').length - 1
			return { content: text.slice(endIndex + 5), linesRemoved }
		}
	}
	return { content: text, linesRemoved: 0 }
}

/**
 * Lines that can never hold an ATX heading: inside a fenced code block, or indented as code.
 * A real heading allows at most three leading spaces, so the indent rule is exact.
 */
function markCodeLines(source: string): boolean[] {
	const isCode: boolean[] = []
	let fence: string | null = null

	source.split('\n').forEach((line, i) => {
		const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
		if (open) {
			const marker = open[1][0]
			if (fence === null) fence = marker
			else if (marker === fence) fence = null
			isCode[i] = true
			return
		}
		isCode[i] = fence !== null || /^(?: {4,}|\t)/.test(line)
	})

	return isCode
}

export interface HeadingLineMapper {
	/**
	 * Resolve a marked heading token's `raw` text to its 0-based line in the source.
	 * Returns -1 when the heading cannot be located — a strip pass may have rewritten it.
	 * A miss does not advance the cursor, so one unresolvable heading cannot desync the rest.
	 */
	resolve(raw: string): number
}

export function createHeadingLineMapper(source: string): HeadingLineMapper {
	const lineStarts = [0]
	for (let i = 0; i < source.length; i++) {
		if (source[i] === '\n') lineStarts.push(i + 1)
	}

	const isCode = markCodeLines(source)
	let cursor = 0

	const lineAtOffset = (offset: number): number => {
		let lo = 0
		let hi = lineStarts.length - 1
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1
			if (lineStarts[mid] <= offset) lo = mid
			else hi = mid - 1
		}
		return lo
	}

	return {
		resolve(raw: string): number {
			const needle = raw.split('\n')[0].trimEnd()
			if (!needle) return -1

			let idx = -1
			if (cursor === 0 && source.startsWith(needle) && !isCode[0]) {
				idx = 0
			} else {
				let from = Math.max(0, cursor - 1)
				for (;;) {
					const found = source.indexOf('\n' + needle, from)
					if (found === -1) break
					if (!isCode[lineAtOffset(found + 1)]) {
						idx = found + 1
						break
					}
					from = found + 1 // that match was inside code — keep looking
				}
			}
			if (idx === -1) return -1

			cursor = idx + needle.length
			return lineAtOffset(idx)
		},
	}
}
