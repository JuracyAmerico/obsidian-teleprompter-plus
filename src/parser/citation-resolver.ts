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
	const entryRegex = /@\w+\{([^,]+),\s*([\s\S]*?)(?=\n@|\n*$)/g
	let match: RegExpExecArray | null

	while ((match = entryRegex.exec(content)) !== null) {
		const key = match[1].trim()
		const body = match[2]

		const authors = extractAuthors(body)
		const year = extractField(body, 'year') || extractYearFromDate(body)
		const isInstitutional = authors.length === 1 && authors[0].includes(' ')

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

	// Split on " and " (BibTeX standard)
	const authorParts = authorField.split(/\s+and\s+/)
	return authorParts.map(author => {
		const trimmed = author.trim()
		// Handle "Last, First" format
		if (trimmed.includes(',')) {
			return trimmed.split(',')[0].trim()
		}
		// Handle "First Last" format - take last word
		const words = trimmed.split(/\s+/)
		return words[words.length - 1]
	})
}

/** Extract a field value from a bib entry body */
function extractField(body: string, field: string): string | null {
	// Match field = {value} or field = "value" or field = number
	const regex = new RegExp(`${field}\\s*=\\s*(?:\\{([^}]*)\\}|"([^"]*)"|(\\d+))`, 'i')
	const match = body.match(regex)
	if (match) {
		return (match[1] || match[2] || match[3] || '').trim()
	}
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
	text = text.replace(/\[([^\]]*@[^\]]+)\]/g, (_match, inner: string) => {
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

	// Handle narrative citations: @key (not in brackets, not preceded by [)
	text = text.replace(/(?<!\[|-)@([a-zA-Z0-9_:-]+)/g, (_match, key: string) => {
		const entry = entries.get(key)
		if (!entry) return `@${key}` // Leave unknown keys as-is

		if (entry.isInstitutional) {
			return `${entry.authors[0]} (${entry.year})`
		}

		if (entry.authors.length === 1) {
			return `${entry.authors[0]} (${entry.year})`
		}

		if (entry.authors.length === 2) {
			return `${entry.authors[0]} and ${entry.authors[1]} (${entry.year})`
		}

		return `${entry.authors[0]} et al. (${entry.year})`
	})

	return text
}
