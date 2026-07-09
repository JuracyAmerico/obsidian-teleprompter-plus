/**
 * Citation resolver for TTS.
 * Parses .bib files and resolves Pandoc-style citations to APA in-text format.
 * Uses @retorquere/bibtex-parser for .bib parsing.
 *
 * Examples:
 *   [@ries2011]           -> "(Ries, 2011)"
 *   [-@moore2014]         -> "(2014)"
 *   [@a; @b]              -> "(A, Year; B, Year)"
 *   3+ authors            -> "(First et al., Year)"
 *   Institutional author  -> "(Government of Canada, Year)"
 */

interface BibEntry {
	key: string
	authors: string[]   // Last names only
	year: string
	isInstitutional: boolean
}

/** Cache of parsed bibliography entries keyed by file path */
const bibCache = new Map<string, Map<string, BibEntry>>()

/**
 * Parse a .bib file content into a map of citation key -> BibEntry.
 * Uses a lightweight regex parser to avoid heavy dependency for basic needs.
 */
export function parseBibFile(content: string): Map<string, BibEntry> {
	const entries = new Map<string, BibEntry>()

	// Match @type{key, ... }
	// End anchor is `$` (not `\n*$`): a trailing run of newlines under the lazy body makes `\n*`
	// re-scan the run at every position — O(n²) on a .bib padded with blank lines.
	const entryRegex = /@\w+\{([^,]+),\s*([\s\S]*?)(?=\n@|$)/g
	let match: RegExpExecArray | null

	while ((match = entryRegex.exec(content)) !== null) {
		const key = match[1].trim()
		const body = match[2]

		const authors = extractAuthors(body)
		const year = extractField(body, 'year') || extractYearFromDate(body)
		const authorField = extractField(body, 'author') || ''
		const isInstitutional = checkInstitutional(authorField)

		entries.set(key, {
			key,
			authors,
			year: year || 'n.d.',
			isInstitutional,
		})
	}

	return entries
}

/** Extract author last names from a bib entry body */
function extractAuthors(body: string): string[] {
	const authorField = extractField(body, 'author')
	if (!authorField) return ['Unknown']

	// Brace-aware split on " and " — must NOT split when "and" appears inside
	// a corporate-name brace group like {Agriculture and Agri-Food Canada}.
	const authorParts = splitAuthorsOnAnd(authorField)
	return authorParts.map(author => {
		const trimmed = author.trim()
		// Handle institutional authors wrapped in braces: {Restaurants Canada}
		if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
			return trimmed.slice(1, -1).trim()
		}
		// Handle "Last, First" format
		if (trimmed.includes(',')) {
			return trimmed.split(',')[0].trim()
		}
		// Handle "First Last" format - take last word
		const words = trimmed.split(/\s+/)
		return words[words.length - 1]
	})
}

/** Split a BibTeX author field on " and " separators, respecting brace depth. */
function splitAuthorsOnAnd(authorField: string): string[] {
	const parts: string[] = []
	let current = ''
	let depth = 0
	for (let i = 0; i < authorField.length; i++) {
		const c = authorField[i]
		if (c === '{') {
			depth++
			current += c
		} else if (c === '}') {
			if (depth > 0) depth--
			current += c
		} else if (depth === 0 && authorField.substring(i, i + 5) === ' and ') {
			parts.push(current)
			current = ''
			i += 4 // loop's i++ skips the trailing space
		} else {
			current += c
		}
	}
	if (current.length > 0) parts.push(current)
	return parts
}

/** Check if an author list represents an institutional author */
function checkInstitutional(authorField: string): boolean {
	const trimmed = authorField.trim()
	// BibTeX institutional authors are wrapped in double braces: {{Org Name}}
	// After extractField strips outer braces, we see {Org Name}
	if (trimmed.startsWith('{') && trimmed.endsWith('}')) return true
	// Single author with spaces and no comma = likely institutional
	if (!trimmed.includes(',') && !trimmed.includes(' and ') && trimmed.includes(' ')) return true
	return false
}

/** Extract a field value from a bib entry body */
function extractField(body: string, field: string): string | null {
	// Find the field assignment start: field = {... or field = "... or field = number
	const fieldStart = new RegExp(`${field}\\s*=\\s*`, 'i')
	const startMatch = fieldStart.exec(body)
	if (!startMatch) return null

	const afterEquals = body.substring(startMatch.index + startMatch[0].length)

	// Handle brace-delimited values with nested braces (e.g., {{Restaurants Canada}})
	if (afterEquals.startsWith('{')) {
		let depth = 0
		let i = 0
		for (; i < afterEquals.length; i++) {
			if (afterEquals[i] === '{') depth++
			else if (afterEquals[i] === '}') {
				depth--
				if (depth === 0) break
			}
		}
		// Return content inside outermost braces
		return afterEquals.substring(1, i).trim()
	}

	// Handle quoted values
	if (afterEquals.startsWith('"')) {
		const endQuote = afterEquals.indexOf('"', 1)
		if (endQuote > 0) return afterEquals.substring(1, endQuote).trim()
	}

	// Handle bare numbers
	const numMatch = afterEquals.match(/^(\d+)/)
	if (numMatch) return numMatch[1]

	return null
}

/** Extract year from a date field (ISO format: 2011-01-15) */
function extractYearFromDate(body: string): string | null {
	const date = extractField(body, 'date')
	if (date) {
		const yearMatch = date.match(/^(\d{4})/)
		if (yearMatch) return yearMatch[1]
	}
	return null
}

/**
 * Format a single citation key to APA in-text format.
 *
 * @param entry - The bibliography entry
 * @param suppressAuthor - If true, only show year (for [-@key] citations)
 */
function formatCitation(entry: BibEntry, suppressAuthor: boolean): string {
	if (suppressAuthor) {
		return entry.year
	}

	if (entry.isInstitutional) {
		return `${entry.authors[0]}, ${entry.year}`
	}

	if (entry.authors.length === 1) {
		return `${entry.authors[0]}, ${entry.year}`
	}

	if (entry.authors.length === 2) {
		return `${entry.authors[0]} & ${entry.authors[1]}, ${entry.year}`
	}

	// 3+ authors: "First et al., Year"
	return `${entry.authors[0]} et al., ${entry.year}`
}

/**
 * Load and cache a bibliography file.
 * Reads from the Obsidian vault using the app's vault adapter.
 *
 * @param bibContent - Raw .bib file content
 * @param cacheKey - Key for caching (usually file path)
 */
export function loadBibliography(bibContent: string, cacheKey: string): Map<string, BibEntry> {
	const cached = bibCache.get(cacheKey)
	if (cached) {
		return cached
	}

	const entries = parseBibFile(bibContent)
	bibCache.set(cacheKey, entries)
	return entries
}

/** Clear the bibliography cache */
export function clearBibCache(): void {
	bibCache.clear()
}

/**
 * Resolve all Pandoc-style citations in text to APA in-text format.
 *
 * Handles:
 *   [@key]           -> "(Author, Year)"
 *   [-@key]          -> "(Year)"
 *   [@key1; @key2]   -> "(Author1, Year; Author2, Year)"
 *   @key (narrative) -> "Author (Year)"
 *
 * Unknown keys are left as-is for transparency.
 */
export function resolveCitations(text: string, entries: Map<string, BibEntry>): string {
	// Handle bracketed citations: [@key], [-@key], [@key1; @key2]
	// Bound each side to single-line, {0,500}/{1,500}: citation groups are short and single-line.
	// Unbounded `[^\]]*@[^\]]+` is O(n²) backtracking on a note full of `[`.
	text = text.replace(/\[([^\]\n]{0,500}@[^\]\n]{1,500})\]/g, (_match, inner: string) => {
		const parts = inner.split(';').map((p: string) => p.trim())

		const formatted = parts.map((part: string) => {
			const suppressAuthor = part.startsWith('-@')
			const keyMatch = part.match(/-?@([a-zA-Z0-9_:-]+)/)
			if (!keyMatch) return part

			const key = keyMatch[1]
			const entry = entries.get(key)
			if (!entry) return part // Leave unknown keys as-is

			return formatCitation(entry, suppressAuthor)
		})

		return `(${formatted.join('; ')})`
	})

	// Handle narrative citations: @key (not in brackets, not preceded by [ or -)
	// Avoid regex lookbehind (not supported on some iOS versions per ObsidianReviewBot)
	// Instead, capture the preceding character and conditionally replace
	text = text.replace(/(^|[^[\\-])@([a-zA-Z0-9_:-]+)/g, (_match, prefix: string, key: string) => {
		const entry = entries.get(key)
		if (!entry) return `${prefix}@${key}` // Leave unknown keys as-is

		if (entry.isInstitutional) {
			return `${prefix}${entry.authors[0]} (${entry.year})`
		}

		if (entry.authors.length === 1) {
			return `${prefix}${entry.authors[0]} (${entry.year})`
		}

		if (entry.authors.length === 2) {
			return `${prefix}${entry.authors[0]} and ${entry.authors[1]} (${entry.year})`
		}

		return `${prefix}${entry.authors[0]} et al. (${entry.year})`
	})

	return text
}
