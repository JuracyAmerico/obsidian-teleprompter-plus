import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PAGE_TURN_SHARE, hotkeyAction, withMissingDefaultHotkeys } from './pedal-keys'
import { obsidianStub } from './test-support/obsidian-stub'
import { commandHandlerSource } from './test-support/command-handler-source'
import { parseCommand } from './commands'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('./settings')

const src = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8')

describe('pedal keys', () => {
	test('page keys are defaults and turn 80% of a screen', () => {
		expect(DEFAULT_SETTINGS.customHotkeys['PageDown']).toBe('pageDown')
		expect(DEFAULT_SETTINGS.customHotkeys['PageUp']).toBe('pageUp')
		expect(PAGE_TURN_SHARE).toBe(0.8)
		expect(src('TeleprompterApp.svelte')).toContain("case 'pageDown':")
		expect(src('TeleprompterApp.svelte')).toContain("case 'pageUp':")
	})

	test('page keys reach a saved layout, and a saved choice wins', () => {
		const saved = { ' ': 'togglePlay', ArrowUp: 'scrollUp' }
		const merged = withMissingDefaultHotkeys(saved, DEFAULT_SETTINGS.customHotkeys)
		expect(merged['PageDown']).toBe('pageDown')
		expect(merged['ArrowUp']).toBe('scrollUp')
		expect(withMissingDefaultHotkeys(undefined, DEFAULT_SETTINGS.customHotkeys)['PageUp']).toBe('pageUp')
		expect(src('main.ts')).toContain('withMissingDefaultHotkeys(s.customHotkeys, d.customHotkeys)')
	})

	test('page keys move voice with the turn', () => {
		const app = src('TeleprompterApp.svelte')
		const turn = app.slice(app.indexOf('function turnPage('), app.indexOf('function turnPage(') + 500)
		expect(turn).toContain('moveVoiceToReadingPosition()')
		const move = app.slice(app.indexOf('function moveVoiceToReadingPosition('), app.indexOf('function turnPage('))
		expect(move).toContain('seekToWord')
		expect(move).toContain('ownsVoice()')
	})

	test('stream deck: a remote scroll moves voice with it', () => {
		const app = src('TeleprompterApp.svelte')
		expect(parseCommand('teleprompter:scroll', { amount: 100 })).toEqual({ kind: 'scrollBy', amount: 100 })
		const scroll = commandHandlerSource(app, 'scroll', { amount: 100 })
		expect(scroll).toContain('contentArea.scrollTop += amount')
		expect(scroll).toContain('moveVoiceToReadingPosition()')
	})

	test('arrow mode routes the arrows to pages, off by default', () => {
		const keys = DEFAULT_SETTINGS.customHotkeys
		expect(DEFAULT_SETTINGS.pedalArrowKeys).toBe(false)
		expect(hotkeyAction('ArrowDown', keys, false)).toBe('speedDown')
		expect(hotkeyAction('ArrowDown', keys, true)).toBe('pageDown')
		expect(hotkeyAction('ArrowUp', keys, true)).toBe('pageUp')
		expect(hotkeyAction('ArrowLeft', keys, true)).toBe('scrollUp')
		expect(hotkeyAction('q', keys, true)).toBeUndefined()
		expect(src('TeleprompterApp.svelte')).toContain('hotkeyAction(e.key, customHotkeys')
	})

	test('arrow mode: README says keys need the prompter focused', () => {
		expect(readFileSync(join(import.meta.dir, '..', 'README.md'), 'utf8')).toContain('only while the prompter has focus')
	})
})
