/**
 * Turns a note back into the word list voice tracking matched against, for traces written before
 * the trace carried that list itself.
 *
 * The app renders the note with marked, inside Svelte, and voice wraps the words of the rendered page
 * minus code, embeds and stage cues. This file repeats the parts of that path that live in importable
 * modules and approximates the rest (wiki-link embeds and images are left alone). The result is an
 * approximation, so the bench never trusts it on its own: `verifyWords` checks it against the word
 * indexes the trace recorded, and a session whose words do not line up is reported unresolved.
 */

import { Marked } from 'marked'
import { removeYAMLFrontmatter } from '../../parser/heading-source-map'
import { stripHeadingTargets } from '../../parser/section-targets'
import { markStageCues } from '../../parser/stage-cues'
import { stripBareUrls, stripFencedDivs, stripRawLatexCommands } from '../../parser/text-cleaner'
import { cleanWord, tokenizeWords } from '../word-tokenizer'
import { scriptHash } from '../script-fingerprint'
import type { RecordedMatch, TracedScript } from './trace'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(html: string): string {
	return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		if (name[0] === '#') {
			const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole
		}
		return ENTITIES[name.toLowerCase()] ?? whole
	})
}

/** Text voice never counts, as tags: `pre, code, .embedded-note, script, style, .tp-stage-cue`. */
const UNTRACKED_BLOCKS = [
	/<pre[\s>][\s\S]*?<\/pre>/gi,
	/<code[\s>][\s\S]*?<\/code>/gi,
	/<script[\s>][\s\S]*?<\/script>/gi,
	/<style[\s>][\s\S]*?<\/style>/gi,
	/<span class="tp-stage-cue">[\s\S]*?<\/span>/gi,
]

/** The words of a script as the prompter shows it, the way voice tracking indexes them. */
export function renderedScriptWords(content: string): string[] {
	let markdown = stripHeadingTargets(content)
	markdown = markdown.replace(/<!--[\s\S]*?-->/g, '')
	markdown = markdown.replace(/```\{=[a-z]+\}\r?\n[\s\S]*?\r?\n```/g, '')
	markdown = stripRawLatexCommands(markdown)
	markdown = stripFencedDivs(markdown)
	markdown = stripBareUrls(markdown)
	markdown = markdown.replace(/\{[#.]?[^}\n]{0,200}(?:width|height|fig-|\.unnumbered|\.unlisted)[^}\n]{0,200}\}/g, '')
	markdown = markStageCues(markdown)
	let html = new Marked().parse(markdown, { async: false })
	for (const block of UNTRACKED_BLOCKS) html = html.replace(block, ' ')
	const text = decodeEntities(html.replace(/<[^>]*>/g, ''))
	return tokenizeWords(text).map(token => token.value)
}

/**
 * The texts the app could have prompted for this note: the note without its frontmatter, and the
 * same cut before a trailing References section (the app drops a bibliography before prompting).
 */
export function promptedContentCandidates(raw: string): string[] {
	const body = removeYAMLFrontmatter(raw).content
	const candidates = [body]
	const heading = /\n#{1,3}\s*References?\s*(?=\n|$)|\n::: \{#refs\}/gi
	for (const match of body.matchAll(heading)) candidates.push(body.slice(0, match.index).trimEnd())
	return candidates
}

/** The prompted text of `raw` that has this traced size, if any. */
export function contentMatchingSize(raw: string, chars: number, words: number): string | null {
	for (const candidate of promptedContentCandidates(raw)) {
		if (candidate.length === chars && tokenizeWords(candidate).length === words) return candidate
	}
	return null
}

/** The prompted text of `raw` with this traced hash, if any. */
export function contentMatchingHash(raw: string, hash: string): string | null {
	return promptedContentCandidates(raw).find(candidate => scriptHash(candidate) === hash) ?? null
}

export interface WordCheck {
	/** Recorded word positions compared (current and proposed word of each recorded decision). */
	compared: number
	/** Share of them where the reconstructed list has the same word at the same index. */
	agreement: number
	/** Word count the trace recorded for the session, -1 when it recorded none. */
	tracedCount: number
}

/** Does this word list put the same words at the indexes the app recorded? */
export function verifyWords(words: string[], script: TracedScript | null, matches: RecordedMatch[]): WordCheck {
	let compared = 0
	let agreeing = 0
	const check = (index: number, word: string): void => {
		if (word === '?' || index < 0) return
		compared++
		if (index < words.length && cleanWord(words[index]) === cleanWord(word)) agreeing++
	}
	for (const match of matches) {
		check(match.cur, match.curWord)
		check(match.proposed, match.proposedWord)
	}
	const tracedCount = script?.wrappedWords ?? matches.find(m => m.total >= 0)?.total ?? -1
	return { compared, agreement: compared === 0 ? 1 : agreeing / compared, tracedCount }
}
