import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { keyLabel, shortcutRows } from './shortcuts-list'
import { obsidianStub } from './test-support/obsidian-stub'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('./settings')

describe('ISC-185: the keyboard button lists the shortcuts', () => {
	test('key names read as a person says them', () => {
		expect(keyLabel(' ')).toBe('Space')
		expect(keyLabel('ArrowUp')).toBe('↑')
		expect(keyLabel('ArrowLeft')).toBe('←')
		expect(keyLabel('PageDown')).toBe('Page Down')
		expect(keyLabel('Home')).toBe('Home')
		expect(keyLabel('n')).toBe('N')
		expect(keyLabel('N')).toBe('N')
	})

	test('the default keys give one row per action, both cases of a letter as one key', () => {
		const rows = shortcutRows(DEFAULT_SETTINGS.customHotkeys, false)
		const byAction = (action: string) => rows.find(r => r.action === action)
		expect(byAction('Play / pause')?.keys).toBe('Space')
		expect(byAction('Section list')?.keys).toBe('N')
		expect(byAction('Voice tracking')?.keys).toBe('V')
		expect(byAction('Read aloud')?.keys).toBe('T')
		expect(new Set(rows.map(r => r.action)).size).toBe(rows.length)
	})

	test('two keys on one action share its row', () => {
		const rows = shortcutRows({ j: 'nextSection', ArrowRight: 'nextSection' }, false)
		expect(rows).toContainEqual({ keys: 'J / →', action: 'Next section' })
	})

	test('in arrow mode the up and down arrows turn pages, as the key handler does', () => {
		const rows = shortcutRows({ ArrowUp: 'speedUp', ArrowDown: 'speedDown' }, true)
		expect(rows.slice(0, 2).map(r => r.action)).toEqual(['Page up', 'Page down'])
	})

	test('a key the user remapped shows under its new action', () => {
		const rows = shortcutRows({ x: 'togglePlay' }, false)
		expect(rows[0]).toEqual({ keys: 'X', action: 'Play / pause' })
	})

	test('the fixed keys the handler always reads are listed last', () => {
		const rows = shortcutRows({ ' ': 'togglePlay' }, false)
		expect(rows.slice(-3).map(r => r.keys)).toEqual(['R', '1 to 9', 'Esc'])
	})

	test('an action with no name of its own is listed by its id, never dropped', () => {
		expect(shortcutRows({ q: 'somethingNew' }, false)[0]).toEqual({ keys: 'Q', action: 'somethingNew' })
	})
})

const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')

describe('ISC-185: the button opens the list in the main view', () => {
	test('the click gives the prompter the keyboard and toggles the list, closing any other popup', () => {
		const start = app.indexOf('function toggleShortcutsList()')
		expect(start).toBeGreaterThan(-1)
		const body = app.slice(start, app.indexOf('\n  }\n', start))
		expect(body).toContain('focusTeleprompter()')
		expect(body).toContain('showShortcutsList = !showShortcutsList')
		expect(body).toContain("closeOtherPopups('shortcuts')")
	})

	test('the button is wired to it, says what it does, and the list is read from the live hotkeys', () => {
		const button = app.slice(app.indexOf('class="tp-keys-btn icon-btn"') - 200, app.indexOf('class="tp-keys-btn icon-btn"') + 700)
		expect(button).toContain('onclick={toggleShortcutsList}')
		expect(button).toContain('aria-expanded={showShortcutsList}')
		expect(app).toContain('shortcutRows(customHotkeys, plugin?.settings?.pedalArrowKeys === true)')
		expect(app).toContain('class="popup-panel tp-keys-panel"')
		expect(app).toContain('role="dialog"')
	})

	test('every other popup closes it, and Escape closes it', () => {
		const start = app.indexOf('function closeOtherPopups(')
		expect(app.slice(start, app.indexOf('\n  }\n', start))).toContain("if (except !== 'shortcuts') showShortcutsList = false")
		const key = app.slice(app.indexOf('function handleKeyPress('), app.indexOf('// Check custom hotkeys'))
		expect(key).toContain('showShortcutsList = false')
	})

	test('the list opens inward from the right edge, where the button sits', () => {
		const panel = app.slice(app.indexOf('  .tp-keys-panel {'), app.indexOf('}', app.indexOf('  .tp-keys-panel {')))
		expect(panel).toContain('right: 0')
		expect(panel).toContain('left: auto')
	})
})
