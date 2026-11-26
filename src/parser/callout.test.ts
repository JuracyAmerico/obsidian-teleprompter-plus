import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Marked } from 'marked'
import { calloutBlockquote, calloutStyle, parseCalloutHeader } from './callout'
import { createHeadingLineMapper } from './heading-source-map'

/** A view's Marked instance wired the way TeleprompterApp wires it. */
function view(options: { hide?: boolean } = {}) {
	const md = new Marked()
	const renderer = new md.Renderer()
	let hide = options.hide === true
	let counter = 0
	let mapper = createHeadingLineMapper('')
	const lines: number[] = []
	renderer.heading = function (token) {
		lines.push(mapper.resolve(token.raw))
		return `<h${token.depth} data-header-id="header-${counter++}">${token.text}</h${token.depth}>\n`
	}
	renderer.blockquote = calloutBlockquote(md, () => hide)
	md.setOptions({ renderer, breaks: true, gfm: true })
	return {
		render(source: string): string {
			counter = 0
			lines.length = 0
			mapper = createHeadingLineMapper(source)
			return md.parse(source) as string
		},
		lines,
		setHide(value: boolean) {
			hide = value
		},
	}
}

/** The text a reader would see, tags dropped and whitespace collapsed. */
function visible(html: string): string {
	return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('callout header', () => {
	test('type, fold and title', () => {
		expect(parseCalloutHeader('[!info]- Legend')).toEqual({ type: 'info', title: 'Legend', fold: '-' })
		expect(parseCalloutHeader('[!TIP]+ Open one')).toEqual({ type: 'tip', title: 'Open one', fold: '+' })
		expect(parseCalloutHeader('[!note]')).toEqual({ type: 'note', title: null, fold: null })
		expect(parseCalloutHeader('[!note]-')).toEqual({ type: 'note', title: null, fold: '-' })
		expect(parseCalloutHeader('[!my-type] Custom')).toEqual({ type: 'my-type', title: 'Custom', fold: null })
		// No space before the title, as some notes are typed: still the title, not the body.
		expect(parseCalloutHeader('[!info]-Legend')).toEqual({ type: 'info', title: 'Legend', fold: '-' })
		expect(parseCalloutHeader('[!note]Title')).toEqual({ type: 'note', title: 'Title', fold: null })
	})

	test('not a callout', () => {
		expect(parseCalloutHeader('Just a quote')).toBeNull()
		expect(parseCalloutHeader('[!] empty')).toBeNull()
		expect(parseCalloutHeader('[info] no bang')).toBeNull()
	})

	test('styles: known types keep their colour; unknown ones get a pin and their own name', () => {
		expect(calloutStyle('hint')).toEqual({ icon: 'lightbulb', defaultTitle: 'Hint', colorClass: 'callout-tip' })
		expect(calloutStyle('bug').colorClass).toBe('callout-danger')
		expect(calloutStyle('tldr').defaultTitle).toBe('TL;DR')
		expect(calloutStyle('my-type')).toEqual({ icon: 'pin', defaultTitle: 'My-type', colorClass: 'callout-default' })
	})
})

describe('callouts on the prompter', () => {
	test('a folded callout keeps its title, and its body does not start with "- Legend"', () => {
		const html = view().render('> [!info]- Legend\n> - **SLOW** slow down\n> - [pause] breathe\n')
		expect(html).toContain('<span class="callout-title-text">Legend</span>')
		expect(html).not.toContain('>Info<')
		expect(html).toContain('data-callout-fold="-"')
		const body = html.slice(html.indexOf('<div class="callout-content">'))
		expect(visible(body).startsWith('SLOW slow down')).toBe(true)
	})

	test('a list in the body is a list, with no literal "- "', () => {
		const html = view().render('> [!note] Steps\n> - one\n> - two\n')
		expect(html).toMatch(/<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/)
		expect(visible(html)).not.toContain('- one')
	})

	test('paragraphs, emphasis and a numbered list', () => {
		const html = view().render('> [!tip] Remember\n> Say it **slowly**.\n>\n> 1. first\n> 2. second\n')
		expect(html).toContain('<strong>slowly</strong>')
		expect(html).toMatch(/<ol>\s*<li>first<\/li>/)
	})

	test('a title with markdown renders inline', () => {
		expect(view().render('> [!note] The *key* point\n> body\n')).toContain('<span class="callout-title-text">The <em>key</em> point</span>')
	})

	test('no title: the type name; unknown type: its own name', () => {
		expect(view().render('> [!warning]\n> careful\n')).toContain('<span class="callout-title-text">Warning</span>')
		expect(view().render('> [!legend]\n> x\n')).toContain('<span class="callout-title-text">Legend</span>')
	})

	test('a title-only callout has an empty body', () => {
		expect(view().render('> [!info] Just a title\n')).toContain('<div class="callout-content"></div>')
	})

	test('a nested callout renders as a callout inside the body', () => {
		const html = view().render('> [!note] Outer\n> text\n> > [!tip] Inner\n> > inner text\n')
		expect(html.match(/class="callout /g)?.length).toBe(2)
		expect(html).toContain('<span class="callout-title-text">Inner</span>')
	})

	test('a plain blockquote keeps its text in one element, so read-aloud reads it once', () => {
		// Read-aloud collects both `blockquote` and `p`; paragraphs inside a quote would be read twice.
		const html = view().render('> a plain quote\n> on two lines\n')
		expect(html).toBe('<blockquote>a plain quote\non two lines</blockquote>\n')
	})

	test('headings inside a callout take their place in order, on their own lines', () => {
		const v = view()
		const html = v.render('# Q1\n\n> [!note] Prep\n> ## Situation\n> notes\n\n## Situation\n')
		expect(html).toContain('data-header-id="header-1">Situation</h2>')
		expect(html).toContain('data-header-id="header-2">Situation</h2>')
		expect(v.lines).toEqual([0, 3, 6])
	})
})

describe('Hide callouts on the prompter', () => {
	const note = '# Opening\n\n> [!info]- Markup legend\n> - **SLOW** slow down\n> ## Hidden heading\n\nHello everyone.\n\n## Close\n'

	test('off: the callout shows', () => {
		const html = view().render(note)
		expect(html).toContain('Markup legend')
	})

	test('on: the callout and everything in it are gone; the script and its headings stay', () => {
		const v = view({ hide: true })
		const html = v.render(note)
		expect(html).not.toContain('callout')
		expect(html).not.toContain('Markup legend')
		expect(html).not.toContain('SLOW')
		expect(html).not.toContain('Hidden heading')
		expect(html).toContain('Hello everyone.')
		// The hidden heading takes no ordinal: Close stays header-1, mapped to its own line.
		expect(html).toContain('data-header-id="header-1">Close</h2>')
		expect(v.lines).toEqual([0, 8])
	})

	test('a plain blockquote is not a callout and always shows', () => {
		expect(view({ hide: true }).render('> a quote I read aloud\n')).toContain('a quote I read aloud')
	})

	test('the switch applies on the next render', () => {
		const v = view()
		expect(v.render(note)).toContain('Markup legend')
		v.setHide(true)
		expect(v.render(note)).not.toContain('Markup legend')
	})
})

describe('TeleprompterApp wiring', () => {
	const app = readFileSync(join(import.meta.dir, '..', 'TeleprompterApp.svelte'), 'utf8')

	test('the app renders blockquotes through calloutBlockquote and re-renders when the switch changes', () => {
		expect(app.includes('renderer.blockquote = calloutBlockquote(md, () => hideCalloutsInRender)')).toBe(true)
		expect(app.includes('md.parseInline(line)')).toBe(false)
		const render = app.slice(app.indexOf('// Render markdown whenever content changes'), app.indexOf('resetHeadingLineMap(content)'))
		expect(render).toContain('hideCallouts === lastRenderedHideCallouts')
	})
})
