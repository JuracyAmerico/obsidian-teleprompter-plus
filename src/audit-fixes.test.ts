import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Source-text guards for four findings of the 2026-10-30 announced-vs-code audit. Settings and the
 * Svelte component cannot be mounted under bun, so these fail if the old state comes back.
 */
const root = join(import.meta.dir, '..')
const settings = readFileSync(join(root, 'src', 'settings.ts'), 'utf8')
const app = readFileSync(join(root, 'src', 'TeleprompterApp.svelte'), 'utf8')
const modal = readFileSync(join(root, 'src', 'whats-new-modal.ts'), 'utf8')

function functionBody(source: string, name: string): string {
	const start = source.indexOf(`function ${name}(`)
	expect(start).toBeGreaterThan(-1)
	const ends = ['\n  function ', '\n  async function '].map(s => source.indexOf(s, start + 1)).filter(i => i > start)
	return source.slice(start, Math.min(...ends))
}

describe('audit fixes', () => {
	test('obs sync: play start and reset emit the events main.ts listens for', () => {
		expect(functionBody(app, 'startSession')).toContain("new CustomEvent('teleprompter:play-started')")
		expect(functionBody(app, 'resetToTop')).toContain("new CustomEvent('teleprompter:reset-complete')")
	})

	test('release notes toggle: a setting turns the What\'s New dialog back on', () => {
		expect(settings).toMatch(/\.setValue\(this\.plugin\.settings\.showReleaseNotes\)/)
		expect(settings).toMatch(/this\.plugin\.settings\.showReleaseNotes = value/)
		expect(modal).toContain("this plugin's about settings tab")
	})

	test('about links: no placeholder repository owner', () => {
		expect(settings).not.toContain('yourusername')
		expect(settings).toContain('github.com/JuracyAmerico/obsidian-teleprompter-plus')
	})

	test('dead voice settings: controls the follower never reads are gone', () => {
		for (const name of ['Scroll behavior', 'Max jump distance', 'Min jump distance', 'Animation base time', 'Animation per word', 'Pause threshold', 'Scroll trail']) {
			expect(settings).not.toContain(`name: '${name}`)
		}
		expect(settings).not.toContain("id: 'voice-pause'")
	})
})
