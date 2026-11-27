import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * ISC-184: the voice status pill ("Voice Active", "Listening...") never lands on the toolbar or the
 * clock. It sat at the top right of the whole window, on top of the keyboard button and the clock
 * (Américo's screenshot, 2026-11-27 10:16). bun cannot lay the component out, so this reads the
 * source: where the markup sits, and what its rule positions it by.
 */
const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string | null {
	const start = app.search(new RegExp(`\\n {2}${selector.replace(/[.[\]]/g, '\\$&')} \\{`))
	if (start === -1) return null
	const open = app.indexOf('{', start)
	return app.slice(open + 1, app.indexOf('}', open))
}

describe('ISC-184: the voice status pill stays off the toolbar and the clock', () => {
	test('the markup sits inside .main-content, the reading area below the toolbar and above the progress bar', () => {
		const mainContent = app.indexOf('<div class="main-content">')
		const progress = app.indexOf('<!-- Progress Indicator - Three styles')
		const pill = app.indexOf('<div class="voice-status-overlay">')
		expect(mainContent).toBeGreaterThan(-1)
		expect(pill).toBeGreaterThan(mainContent)
		expect(pill).toBeLessThan(progress)
	})

	test('it is anchored to the bottom of that area, not the top or the right', () => {
		const declarations = rule('.voice-status-overlay')
		expect(declarations).not.toBeNull()
		expect(declarations).toMatch(/\n\s*bottom:/)
		expect(declarations).toMatch(/\n\s*left:/)
		expect(declarations).not.toMatch(/\n\s*top:/)
		expect(declarations).not.toMatch(/\n\s*right:/)
	})

	test('it never takes a click from the script or the progress bar', () => {
		expect(rule('.voice-status-overlay')).toContain('pointer-events: none')
	})

	test('the floating view has no override that puts it back at the top', () => {
		expect(app).not.toMatch(/\.tp-floating \.voice-status-overlay/)
	})
})
