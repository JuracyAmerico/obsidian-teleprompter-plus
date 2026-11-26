import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Marked } from 'marked'

// List item #2 (2026-11-26): the main view and the floating view shared the global `marked`. The last
// view to mount owned the heading renderer, so the other numbered its headings from that view's counter
// (header-25.. live) and left its own line map empty: the note pane stopped following sections.

const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')

function view() {
	const md = new Marked()
	const renderer = new md.Renderer()
	let counter = 0
	const lines: string[] = []
	renderer.heading = function (token) {
		lines.push(token.text)
		return `<h${token.depth} id="header-${counter++}">${token.text}</h${token.depth}>\n`
	}
	md.setOptions({ renderer })
	return {
		render(source: string) {
			counter = 0
			lines.length = 0
			return md.parse(source) as string
		},
		lines,
	}
}

describe('each view renders with its own Marked instance', () => {
	test('two views number their headings independently, in any mount order', () => {
		const main = view()
		const floating = view()
		const source = '# One\n\n## Two\n\n## Three'
		floating.render(source)
		const html = main.render(source)
		expect(html).toContain('id="header-0"')
		expect(html).not.toContain('id="header-3"')
		expect(main.lines).toEqual(['One', 'Two', 'Three'])
		expect(floating.lines).toEqual(['One', 'Two', 'Three'])
	})

	test('TeleprompterApp never touches the global marked', () => {
		expect(app).toContain('const md = new Marked()')
		expect(app).not.toMatch(/\bmarked\.(setOptions|parse|parseInline|use|Renderer)\b/)
	})
})
