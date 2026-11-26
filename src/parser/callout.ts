/**
 * Obsidian callouts on the prompter. Pure, so the rendering rules are testable with a real
 * Marked instance outside the Svelte component.
 *
 * Two shipped defects this fixes: a folded callout (`> [!info]- Legend`) lost its title, showing
 * "Info" with a body that began "- Legend", because the fold sign stopped the title match; and
 * the body went through inline parsing line by line, so a list showed its literal "- " markers.
 */

import type { Marked, Renderer, Tokens } from 'marked'

export interface CalloutHeader {
	/** Lower-case type: `info`, `tip`, `my-type`. */
	type: string
	/** The title written after the marker, or null for the type's default. */
	title: string | null
	/** `-` folded, `+` foldable and open, null not foldable. */
	fold: '+' | '-' | null
}

/** `[!type]`, an optional fold sign, then an optional title, on the callout's first line. */
const HEADER = /^\[!([\w-]+)\]([+-])?[ \t]*(.*)$/

/** The callout header on a blockquote's first line, or null when the blockquote is no callout. */
export function parseCalloutHeader(firstLine: string): CalloutHeader | null {
	const match = HEADER.exec(firstLine.trim())
	if (!match) return null
	const title = match[3]?.trim() ?? ''
	return {
		type: match[1].toLowerCase(),
		title: title === '' ? null : title,
		fold: match[2] === '+' || match[2] === '-' ? match[2] : null,
	}
}

interface CalloutStyle {
	icon: string
	defaultTitle: string
	colorClass: string
}

const STYLES: Record<string, Omit<CalloutStyle, 'colorClass'> & { color: string }> = {
	info: { icon: 'info', defaultTitle: 'Info', color: 'info' },
	tip: { icon: 'lightbulb', defaultTitle: 'Tip', color: 'tip' },
	hint: { icon: 'lightbulb', defaultTitle: 'Hint', color: 'tip' },
	important: { icon: 'flame', defaultTitle: 'Important', color: 'tip' },
	warning: { icon: 'alert-triangle', defaultTitle: 'Warning', color: 'warning' },
	caution: { icon: 'alert-triangle', defaultTitle: 'Caution', color: 'warning' },
	attention: { icon: 'alert-triangle', defaultTitle: 'Attention', color: 'warning' },
	note: { icon: 'pencil', defaultTitle: 'Note', color: 'note' },
	success: { icon: 'check-circle-2', defaultTitle: 'Success', color: 'success' },
	check: { icon: 'check-circle-2', defaultTitle: 'Check', color: 'success' },
	done: { icon: 'check-circle-2', defaultTitle: 'Done', color: 'success' },
	question: { icon: 'help-circle', defaultTitle: 'Question', color: 'question' },
	help: { icon: 'help-circle', defaultTitle: 'Help', color: 'question' },
	faq: { icon: 'help-circle', defaultTitle: 'FAQ', color: 'question' },
	danger: { icon: 'zap', defaultTitle: 'Danger', color: 'danger' },
	error: { icon: 'x-circle', defaultTitle: 'Error', color: 'danger' },
	bug: { icon: 'bug', defaultTitle: 'Bug', color: 'danger' },
	failure: { icon: 'x-circle', defaultTitle: 'Failure', color: 'danger' },
	fail: { icon: 'x-circle', defaultTitle: 'Fail', color: 'danger' },
	missing: { icon: 'x-circle', defaultTitle: 'Missing', color: 'danger' },
	example: { icon: 'list', defaultTitle: 'Example', color: 'example' },
	quote: { icon: 'quote', defaultTitle: 'Quote', color: 'quote' },
	cite: { icon: 'quote', defaultTitle: 'Cite', color: 'quote' },
	abstract: { icon: 'file-text', defaultTitle: 'Abstract', color: 'abstract' },
	summary: { icon: 'file-text', defaultTitle: 'Summary', color: 'abstract' },
	tldr: { icon: 'file-text', defaultTitle: 'TL;DR', color: 'abstract' },
	todo: { icon: 'check-square', defaultTitle: 'Todo', color: 'todo' },
	video: { icon: 'film', defaultTitle: 'Video', color: 'video' },
}

/** Icon, default title and colour class for a type; an unknown type gets a pin and its own name. */
export function calloutStyle(type: string): CalloutStyle {
	const known = STYLES[type]
	if (known) return { icon: known.icon, defaultTitle: known.defaultTitle, colorClass: `callout-${known.color}` }
	return { icon: 'pin', defaultTitle: type.charAt(0).toUpperCase() + type.slice(1), colorClass: 'callout-default' }
}

export interface CalloutRenderers {
	/** Full markdown for the body: lists, paragraphs, nested quotes. */
	block(markdown: string): string
	/** Inline markdown for the title. */
	inline(markdown: string): string
}

/**
 * HTML for a blockquote's inner text when it is a callout, '' when callouts are hidden, and null
 * when it is an ordinary blockquote. A hidden callout's body is never parsed, so its headings take
 * no place in the section list.
 */
export function renderCallout(text: string, render: CalloutRenderers, options: { hide?: boolean } = {}): string | null {
	const newline = text.indexOf('\n')
	const firstLine = newline === -1 ? text : text.slice(0, newline)
	const header = parseCalloutHeader(firstLine)
	if (!header) return null
	if (options.hide) return ''

	const body = newline === -1 ? '' : text.slice(newline + 1).trim()
	const style = calloutStyle(header.type)
	const title = header.title === null ? style.defaultTitle : render.inline(header.title)
	const fold = header.fold === null ? '' : ` data-callout-fold="${header.fold}"`

	return `<div class="callout ${style.colorClass}" data-callout="${header.type}"${fold}>
        <div class="callout-title">
          <span class="callout-icon" data-tp-icon="${style.icon}"></span>
          <span class="callout-title-text">${title}</span>
        </div>
        <div class="callout-content">${body === '' ? '' : render.block(body)}</div>
      </div>\n`
}

/**
 * The blockquote renderer for a view's own Marked instance. Callout bodies go through the running
 * parser, so a heading inside a callout takes the next heading ordinal in document order like any
 * other. A plain quote keeps its text in one element, as it always has: read-aloud reads both a
 * blockquote and the paragraphs inside it, so wrapping it in paragraphs would read it twice.
 */
export function calloutBlockquote(md: Marked, hidden: () => boolean): (this: Renderer, token: Tokens.Blockquote) => string {
	return function (this: Renderer, token: Tokens.Blockquote): string {
		const parser = this.parser
		const callout = renderCallout(
			token.text,
			{
				block: markdown => parser.parse(md.lexer(markdown)),
				inline: markdown => parser.parseInline(md.Lexer.lexInline(markdown, md.defaults)),
			},
			{ hide: hidden() },
		)
		return callout ?? `<blockquote>${token.text}</blockquote>\n`
	}
}
