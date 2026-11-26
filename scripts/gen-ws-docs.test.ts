import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	BEGIN_MARKER,
	DOC_PATH,
	END_MARKER,
	MAIN_PATH,
	WIRE_LIMITS,
	describe as describeCommand,
	extractCommands,
	generate,
	replaceBetweenMarkers,
} from './gen-ws-docs'

const root = path.resolve(import.meta.dir, '..')
const mainSource = readFileSync(MAIN_PATH, 'utf8')
const doc = readFileSync(DOC_PATH, 'utf8')

/** The generated part of the doc: what a reader of the table sees. */
function generatedSection(text: string): string {
	return text.slice(text.indexOf(BEGIN_MARKER), text.indexOf(END_MARKER))
}

describe('websocket API command reference', () => {
	test('finds every registerCommand call in src/main.ts', () => {
		const calls = (mainSource.match(/\.registerCommand\(\s*'/g) ?? []).length
		const commands = extractCommands(mainSource)
		expect(commands.length).toBe(calls)
		expect(commands.length).toBeGreaterThanOrEqual(102)
		expect(new Set(commands.map(c => c.name)).size).toBe(commands.length)
	})

	test('every registered command is in the doc', () => {
		const table = generatedSection(doc)
		const missing = extractCommands(mainSource)
			.map(c => c.name)
			.filter(name => !table.includes(`| \`${name}\` |`))
		expect(missing, `commands missing from docs/websocket-api.md (run: bun scripts/gen-ws-docs.ts): ${missing.join(', ')}`).toEqual([])
	})

	test('the table in the doc is what the generator writes now', () => {
		const { current, next } = generate()
		expect(current === next, 'docs/websocket-api.md is out of date; run: bun scripts/gen-ws-docs.ts').toBe(true)
	})

	test('reads the parameter names and types from the handlers', () => {
		const byName = new Map(extractCommands(mainSource).map(c => [c.name, c.params]))
		expect(byName.get('set-speed')).toEqual([{ name: 'speed', type: 'number' }])
		expect(byName.get('jump-to-header')).toEqual([{ name: 'index', type: 'number' }])
		expect(byName.get('jump-to-header-by-id')).toEqual([{ name: 'headerId', type: 'string' }])
		expect(byName.get('scroll-up')).toEqual([{ name: 'amount', type: 'number' }])
		expect(byName.get('open-file')).toEqual([{ name: 'path', type: 'string' }])
		expect(byName.get('obs-set-scene')).toEqual([{ name: 'scene', type: 'string' }])
		expect(byName.get('set-scroll-position')?.map(p => p.name)).toEqual(['position', 'percentage'])
		expect(byName.get('load-speaker-notes')?.map(p => p.name)).toEqual(['content', 'slide', 'totalSlides'])
		expect(byName.get('toggle-play')).toEqual([])
	})

	test('a command added to main.ts without a doc entry is caught', () => {
		const added = `${mainSource}\n\t\tthis.wsServer.registerCommand('brand-new-command', (cmd) => { void cmd?.level as number })\n`
		const names = extractCommands(added).map(c => c.name)
		expect(names).toContain('brand-new-command')
		expect(generatedSection(doc).includes('| `brand-new-command` |')).toBe(false)
	})

	test('handler bodies with strings, comments and template literals do not end the scan early', () => {
		const tricky = [
			"this.wsServer.registerCommand('a', (cmd) => {",
			"  // a ) in a comment",
			"  const s = ') not the end'",
			"  window.dispatchEvent(new CustomEvent(`x:${1}`, { detail: { n: (cmd as Record<string, unknown>)?.n as number } }))",
			"})",
			"this.wsServer.registerCommand('b', () => {})",
		].join('\n')
		const commands = extractCommands(tricky)
		expect(commands.map(c => c.name)).toEqual(['a', 'b'])
		expect(commands[0].params).toEqual([{ name: 'n', type: 'number' }])
		expect(commands[1].params).toEqual([])
	})

	test('the wire limits written in the generator are still in validateCommand', () => {
		const server = readFileSync(path.join(root, 'src/websocket-server.ts'), 'utf8')
		for (const [field, limit] of Object.entries(WIRE_LIMITS)) {
			for (const literal of limit.literals) {
				expect(server.includes(literal), `${field}: "${literal}" not found in src/websocket-server.ts`).toBe(true)
			}
		}
	})

	test('replaceBetweenMarkers keeps the text around the markers and refuses a doc without them', () => {
		const out = replaceBetweenMarkers(`before\n${BEGIN_MARKER}\nold\n${END_MARKER}\nafter\n`, 'TABLE')
		expect(out).toBe(`before\n${BEGIN_MARKER}\n\nTABLE\n\n${END_MARKER}\nafter\n`)
		expect(() => replaceBetweenMarkers('no markers', 'TABLE')).toThrow()
	})

	test('every command has a sentence', () => {
		for (const c of extractCommands(mainSource)) {
			expect(describeCommand(c.name).length, c.name).toBeGreaterThan(3)
		}
	})
})
