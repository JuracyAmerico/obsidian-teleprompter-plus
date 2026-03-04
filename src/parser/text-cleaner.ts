/**
 * Text cleaning pipeline for TTS.
 * Strips non-readable content from markdown/QMD files, producing clean prose.
 */

import type { TTSSection, TTSDocument } from '../tts/tts-types'

/** Common abbreviations that shouldn't trigger sentence splits */
const ABBREVIATIONS = new Set([
	'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd',
	'vs', 'etc', 'inc', 'ltd', 'corp', 'dept', 'div', 'est', 'approx',
	'fig', 'no', 'vol', 'rev', 'ed', 'pp', 'ch', 'sec',
	'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
	'e.g', 'i.e', 'al', 'et'
])

/** Strip YAML frontmatter (---...---) from beginning of content */
function stripFrontmatter(text: string): string {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
	if (match) {
		return text.slice(match[0].length)
	}
	return text
}

/** Extract bibliography path from YAML frontmatter */
export function extractBibPath(text: string): string | null {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
	if (!match) return null

	const yaml = match[1]
	const bibMatch = yaml.match(/bibliography:\s*(.+)/)
	if (bibMatch) {
		return bibMatch[1].trim()
	}
	return null
}

/** Strip raw format blocks ({=openxml}, {=latex}, {=html}) */
function stripRawBlocks(text: string): string {
	// Pandoc raw blocks: ```{=format}\n...\n```
	return text.replace(/```\{=[a-z]+\}\r?\n[\s\S]*?\r?\n```/g, '')
}

/** Strip fenced code blocks */
function stripCodeBlocks(text: string): string {
	return text.replace(/```[\s\S]*?```/g, '')
}

/** Strip inline code */
function stripInlineCode(text: string): string {
	return text.replace(/`[^`]+`/g, '')
}

/** Strip HTML tags */
function stripHtml(text: string): string {
	return text.replace(/<[^>]+>/g, '')
}

/** Strip markdown images, keep alt text if present */
function stripImages(text: string, readAltText: boolean): string {
	if (readAltText) {
		return text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
	}
	return text.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
}

/** Strip Obsidian embeds (![[filename]]) */
function stripEmbeds(text: string): string {
	return text.replace(/!\[\[[^\]]+\]\]/g, '')
}

/** Convert markdown links to just their text */
function stripLinks(text: string): string {
	// [text](url) -> text
	return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		// [[wikilink|display]] -> display
		.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
		// [[wikilink]] -> wikilink
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
}

/** Strip bold/italic markers but keep text */
function stripEmphasis(text: string): string {
	return text
		.replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // ***bold italic***
		.replace(/\*\*(.+?)\*\*/g, '$1')        // **bold**
		.replace(/\*(.+?)\*/g, '$1')             // *italic*
		.replace(/___(.+?)___/g, '$1')           // ___bold italic___
		.replace(/__(.+?)__/g, '$1')             // __bold__
		.replace(/_(.+?)_/g, '$1')               // _italic_
		.replace(/~~(.+?)~~/g, '$1')             // ~~strikethrough~~
		.replace(/==(.+?)==/g, '$1')             // ==highlight==
}

/** Strip LaTeX math expressions */
function stripMath(text: string): string {
	// Block math: $$...$$
	text = text.replace(/\$\$[\s\S]*?\$\$/g, '')
	// Inline math: $...$
	text = text.replace(/\$[^$]+\$/g, '')
	return text
}

/** Strip tables */
function stripTables(text: string): string {
	// Remove lines that start with | (table rows) and separator lines (|---|)
	const lines = text.split('\n')
	const result: string[] = []
	let inTable = false

	for (const line of lines) {
		const trimmed = line.trim()
		if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
			inTable = true
			continue
		}
		if (inTable && trimmed === '') {
			inTable = false
		}
		if (!inTable) {
			result.push(line)
		}
	}
	return result.join('\n')
}

/** Strip blockquotes (> prefix) but keep text */
function stripBlockquotes(text: string): string {
	return text.replace(/^>\s*/gm, '')
}

/** Strip horizontal rules */
function stripHorizontalRules(text: string): string {
	return text.replace(/^[-*_]{3,}\s*$/gm, '')
}

/** Strip footnotes */
function stripFootnotes(text: string): string {
	// Footnote definitions: [^n]: ...
	text = text.replace(/^\[\^[^\]]+\]:.*$/gm, '')
	// Footnote references: [^n]
	text = text.replace(/\[\^[^\]]+\]/g, '')
	return text
}

/** Strip list markers but keep text */
function stripListMarkers(text: string): string {
	return text.replace(/^(\s*)([-*+]|\d+\.)\s+/gm, '$1')
}

/** Clean up whitespace: collapse multiple newlines, trim lines */
function normalizeWhitespace(text: string): string {
	return text
		.replace(/\r\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/[ \t]+/g, ' ')
		.split('\n')
		.map(line => line.trim())
		.join('\n')
		.trim()
}

/** Options for the text cleaning pipeline */
export interface CleanerOptions {
	skipCodeBlocks: boolean
	skipTables: boolean
	readImageAltText: boolean
}

const DEFAULT_OPTIONS: CleanerOptions = {
	skipCodeBlocks: true,
	skipTables: true,
	readImageAltText: false,
}

/**
 * Split text into sentences, handling abbreviations and edge cases.
 * Returns an array of trimmed, non-empty sentences.
 */
export function splitSentences(text: string): string[] {
	const sentences: string[] = []
	let current = ''

	const words = text.split(/\s+/)

	for (let i = 0; i < words.length; i++) {
		const word = words[i]
		current += (current ? ' ' : '') + word

		// Check if word ends with sentence-ending punctuation
		const endsWithPunctuation = /[.!?]$/.test(word) || /[.!?]["')]$/.test(word)

		if (endsWithPunctuation) {
			// Check if it's an abbreviation
			const cleanWord = word.replace(/[.!?"')]+$/, '').toLowerCase()
			const isAbbreviation = ABBREVIATIONS.has(cleanWord) ||
				ABBREVIATIONS.has(cleanWord + '.') ||
				// Single letter followed by period (initials like "J.")
				/^[a-z]\.$/i.test(word) ||
				// Number followed by period (could be a numbered list reference)
				/^\d+\.$/.test(word)

			// Check if next word starts with lowercase (continuation, not new sentence)
			const nextWord = words[i + 1]
			const nextStartsLower = nextWord && /^[a-z]/.test(nextWord)

			if (!isAbbreviation && !nextStartsLower) {
				const trimmed = current.trim()
				if (trimmed) sentences.push(trimmed)
				current = ''
			}
		}
	}

	// Add remaining text as last sentence
	const remaining = current.trim()
	if (remaining) sentences.push(remaining)

	return sentences
}

/**
 * Main text cleaning pipeline.
 * Takes raw markdown/QMD content and produces a TTSDocument.
 */
export function cleanDocument(rawContent: string, options: Partial<CleanerOptions> = {}): TTSDocument {
	const opts = { ...DEFAULT_OPTIONS, ...options }

	// Extract frontmatter before stripping
	let text = rawContent

	// Step 1: Strip non-readable block content
	text = stripFrontmatter(text)
	text = stripRawBlocks(text)
	if (opts.skipCodeBlocks) text = stripCodeBlocks(text)
	if (opts.skipTables) text = stripTables(text)
	text = stripFootnotes(text)

	// Step 2: Parse into sections by headings
	const lines = text.split('\n')
	const sections: TTSSection[] = []
	let currentHeading = ''
	let currentHeadingId = 'section-0'
	let currentContent: string[] = []
	let headingCounter = 0

	for (const line of lines) {
		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
		if (headingMatch) {
			// Save previous section
			if (currentContent.length > 0) {
				const prose = cleanInlineContent(currentContent.join('\n'), opts)
				const sentences = splitSentences(prose)
				if (sentences.length > 0) {
					sections.push({
						heading: currentHeading,
						headingId: currentHeadingId,
						sentences,
					})
				}
			}
			currentHeading = headingMatch[2].trim()
			currentHeadingId = `header-${headingCounter++}`
			currentContent = []
		} else {
			currentContent.push(line)
		}
	}

	// Save last section
	if (currentContent.length > 0) {
		const prose = cleanInlineContent(currentContent.join('\n'), opts)
		const sentences = splitSentences(prose)
		if (sentences.length > 0) {
			sections.push({
				heading: currentHeading,
				headingId: currentHeadingId,
				sentences,
			})
		}
	}

	// Build flat sentence list and section map
	const allSentences: string[] = []
	const sectionMap: number[] = []

	sections.forEach((section, sectionIndex) => {
		for (const sentence of section.sentences) {
			allSentences.push(sentence)
			sectionMap.push(sectionIndex)
		}
	})

	return { sections, allSentences, sectionMap }
}

/** Clean inline markdown content (bold, italic, links, etc.) to plain text */
function cleanInlineContent(text: string, opts: CleanerOptions): string {
	text = stripHorizontalRules(text)
	text = stripEmbeds(text)
	text = stripImages(text, opts.readImageAltText)
	text = stripLinks(text)
	text = stripInlineCode(text)
	text = stripHtml(text)
	text = stripMath(text)
	text = stripEmphasis(text)
	text = stripBlockquotes(text)
	text = stripListMarkers(text)
	text = normalizeWhitespace(text)
	return text
}
