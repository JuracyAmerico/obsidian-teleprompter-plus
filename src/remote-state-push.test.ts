import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Stream Deck lights its Mirror, Upside Down, Minimap and View Mode keys from the WebSocket
 * state (ISC-210). Before, broadcastStateToWebSocket left those four out (they went only to the
 * app's other windows through broadcastState), so the keys never lit. Source-text guards: bun
 * cannot mount the Svelte component.
 */
const root = import.meta.dir
const app = readFileSync(join(root, 'TeleprompterApp.svelte'), 'utf8')
const server = readFileSync(join(root, 'websocket-server.ts'), 'utf8')

function functionBody(name: string): string {
	const start = app.search(new RegExp(`(async )?function ${name}\\(`))
	expect(start).toBeGreaterThan(-1)
	const rest = app.slice(start + 1)
	const end = rest.search(/\n {2}(async )?function /)
	return rest.slice(0, end)
}

/** The effect that pushes state to remotes when something they show changes. */
function pushEffect(): string {
	const start = app.indexOf('// Auto-broadcast state when it changes (to WebSocket and other windows)')
	expect(start).toBeGreaterThan(-1)
	const end = app.indexOf('broadcastStateToWebSocket()', start)
	return app.slice(start, end)
}

/** Wire field → the component variable it carries. */
const TOGGLES: Record<string, string> = {
	flipHorizontal: 'flipHorizontal',
	flipVertical: 'flipVertical',
	minimapVisible: 'showMinimap',
	viewMode: 'viewMode',
}

describe('display toggles reach the Stream Deck (ISC-210)', () => {
	test('the WebSocket state carries flipHorizontal, flipVertical, minimapVisible and viewMode', () => {
		const body = functionBody('broadcastStateToWebSocket')
		for (const [field, variable] of Object.entries(TOGGLES)) {
			const line = field === variable ? `${field},` : `${field}: ${variable},`
			expect(body, field).toContain(line)
		}
	})

	test('the server type declares them, with the view mode as rendered or plain', () => {
		expect(server).toContain('flipHorizontal?: boolean')
		expect(server).toContain('flipVertical?: boolean')
		expect(server).toContain('minimapVisible?: boolean')
		expect(server).toContain("viewMode?: 'rendered' | 'plain'")
	})

	test('changing one of them pushes state at once, so a toggle made in Obsidian reaches the key', () => {
		const effect = pushEffect()
		for (const variable of Object.values(TOGGLES)) expect(effect, variable).toMatch(new RegExp(`:\\s*${variable},`))
	})

	test('every on/off setting the remotes follow pushes when it changes, not only on the next unrelated push', () => {
		const effect = pushEffect()
		for (const variable of ['showEyeline', 'focusMode', 'isPinned', 'isKeepAwake', 'isFullScreen', 'autoPauseOnEdit']) {
			expect(effect, variable).toMatch(new RegExp(`:\\s*${variable},`))
		}
	})
})
