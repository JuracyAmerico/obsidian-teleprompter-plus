import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { obsidianStub } from './test-support/obsidian-stub'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('./settings')

const src = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8')

describe('Hide callouts on the prompter', () => {
	test('off by default, so no script loses its callouts on update', () => {
		expect(DEFAULT_SETTINGS.hideCallouts).toBe(false)
		// Saved settings merge over the defaults, so an install that never saw the switch reads false.
		const merged = Object.assign({}, DEFAULT_SETTINGS, { stageCueDisplay: 'dim' })
		expect(merged.hideCallouts).toBe(false)
	})

	test('the validator keeps only a real true', () => {
		expect(src('main.ts')).toContain('s.hideCallouts = s.hideCallouts === true')
	})

	test('the switch is in Settings and reaches every open view', () => {
		const settings = src('settings.ts')
		expect(settings).toContain("name: 'Hide callouts on the prompter'")
		expect(settings).toContain("new CustomEvent('teleprompter:callouts-changed', { detail: { hide: value === true } })")
		const app = src('TeleprompterApp.svelte')
		expect(app).toContain("document.addEventListener('teleprompter:callouts-changed', handleCalloutsChanged)")
		expect(app).toContain("document.removeEventListener('teleprompter:callouts-changed', handleCalloutsChanged)")
		expect(app).toContain('let hideCallouts = $state(settings.hideCallouts === true)')
	})
})
