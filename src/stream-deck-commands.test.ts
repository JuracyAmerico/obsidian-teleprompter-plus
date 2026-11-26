import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Every command the Stream Deck plugin sends must be registered on the server, or the key fails
// (Fable review 2026-11-26: six keys sent commands nobody registered).
const DECK_COMMANDS = ['cycle-speed-preset', 'next-speed-preset', 'prev-speed-preset', 'cycle-alignment', 'cycle-progress-indicator', 'toggle-auto-pause']

describe('Stream Deck commands are registered and handled', () => {
	const main = readFileSync(join(import.meta.dir, 'main.ts'), 'utf8')
	const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
	for (const c of DECK_COMMANDS) {
		test(c, () => {
			expect(main).toContain(`registerCommand('${c}'`)
			expect(app).toContain(`'teleprompter:${c}'`)
		})
	}
})
