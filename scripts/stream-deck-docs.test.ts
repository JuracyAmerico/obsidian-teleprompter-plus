import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MAIN_PATH, extractCommands } from './gen-ws-docs'

const doc = readFileSync(path.resolve(import.meta.dir, '../docs/stream-deck-actions.md'), 'utf8')
const registered = new Set(extractCommands(readFileSync(MAIN_PATH, 'utf8')).map(c => c.name))

/** Rows of the key tables: `| **Key** | \`command\` | ... |`. */
function keyRows(text: string): Array<{ key: string; command: string }> {
	const rows: Array<{ key: string; command: string }> = []
	for (const line of text.split('\n')) {
		const m = /^\| \*\*(.+?)\*\* \| (`[^`]+`|none[^|]*) \|/.exec(line)
		if (m) rows.push({ key: m[1], command: m[2] })
	}
	return rows
}

describe('Stream Deck key catalog', () => {
	const rows = keyRows(doc)

	test('lists the 60 keys of the deck plugin manifest', () => {
		expect(rows.length).toBe(60)
		expect(new Set(rows.map(r => r.key)).size).toBe(60)
	})

	test('every command a key sends is registered in src/main.ts', () => {
		const unknown = rows
			.map(r => r.command)
			.filter(c => c.startsWith('`'))
			.map(c => c.slice(1, -1))
			.filter(c => !registered.has(c))
		expect(unknown, `docs/stream-deck-actions.md names commands the plugin does not register: ${unknown.join(', ')}`).toEqual([])
	})

	test('the keys the deck gained are listed', () => {
		for (const key of ['Voice Tracking', 'Clock', 'Cycle Speed Preset', 'Toggle Auto-Pause', 'Cycle Theme']) {
			expect(rows.map(r => r.key), key).toContain(key)
		}
	})

	test('keys the manifest does not have are not listed', () => {
		for (const gone of ['Get State', 'Set Speed', 'Jump to Section', 'Cancel Countdown', 'Bookmarks']) {
			expect(rows.map(r => r.key), gone).not.toContain(gone)
		}
	})
})
