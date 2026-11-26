import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LISTENED_COMMAND_EVENTS, parseCommand } from './commands'

// Every command the Stream Deck plugin sends must be registered on the server, or the key fails
// (Fable review 2026-11-26: six keys sent commands nobody registered).
const DECK_COMMANDS = ['cycle-speed-preset', 'next-speed-preset', 'prev-speed-preset', 'cycle-alignment', 'cycle-progress-indicator', 'toggle-auto-pause']

describe('Stream Deck commands are registered and handled', () => {
	const main = readFileSync(join(import.meta.dir, 'main.ts'), 'utf8')
	for (const c of DECK_COMMANDS) {
		test(c, () => {
			expect(main).toContain(`registerCommand('${c}'`)
			expect(main).toContain(`new CustomEvent('teleprompter:${c}')`)
			// The view listens for the event and it names an intent the view runs.
			expect<readonly string[]>(LISTENED_COMMAND_EVENTS).toContain(`teleprompter:${c}`)
			expect(parseCommand(`teleprompter:${c}`, undefined)).not.toBeNull()
		})
	}
})

describe('ISC-161: starting voice or read-aloud cancels a running countdown; Conservative is not stricter than Balanced', () => {
	const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
	const settings = readFileSync(join(import.meta.dir, 'settings.ts'), 'utf8')
	test('read-aloud start', () => expect(app).toContain("cancelCountdown('read-aloud started')"))
	test('voice toggle', () => expect(app).toContain("cancelCountdown('voice tracking toggled')"))
	test('conservative threshold', () => expect(settings).toMatch(/conservative:\s*\{\s*confidenceThreshold: 0\.20,/))
})
