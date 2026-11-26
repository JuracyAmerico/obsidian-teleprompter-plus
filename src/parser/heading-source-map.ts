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
 * Blockquote and callout markers in front of a line: `> `, `> > `. A heading inside a callout
 * reaches the renderer without them, so the line is compared with and without.
 */
const QUOTE_PREFIX = /^(?: {0,3}>[ \t]?)+/

function unquote(line: string): { text: string; depth: number } {
	const prefix = QUOTE_PREFIX.exec(line)
	if (!prefix) return { text: line, depth: 0 }
	return { text: line.slice(prefix[0].length), depth: (prefix[0].match(/>/g) ?? []).length }
}

/**
 * Lines that can never hold an ATX heading: inside a fenced code block, or indented as code.
 * A real heading allows at most three leading spaces, so the indent rule is exact. Fences and
 * indents are read after any quote markers, and a fence opened inside a quote ends with it.
 */
function markCodeLines(lines: readonly string[]): boolean[] {
	const isCode: boolean[] = []
	let fence: { marker: string; depth: number } | null = null

	lines.forEach((line, i) => {
		const { text, depth } = unquote(line)
		if (fence !== null && depth < fence.depth) fence = null
		const open = /^\s{0,3}(`{3,}|~{3,})/.exec(text)
		if (open) {
			const marker = open[1][0]
			if (fence === null) fence = { marker, depth }
			else if (marker === fence.marker) fence = null
			isCode[i] = true
			return
		}
		isCode[i] = fence !== null || /^(?: {4,}|\t)/.test(text)
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
	const lines = source.split('\n')
	const unquoted = lines.map(line => unquote(line).text)
	const isCode = markCodeLines(lines)
	let nextLine = 0

	return {
		resolve(raw: string): number {
			const needle = raw.split('\n')[0].trimEnd()
			if (!needle) return -1

			for (let i = nextLine; i < lines.length; i++) {
				if (isCode[i]) continue
				if (lines[i].startsWith(needle) || unquoted[i].startsWith(needle)) {
					nextLine = i + 1
					return i
				}
			}
			return -1
		},
	}
}
