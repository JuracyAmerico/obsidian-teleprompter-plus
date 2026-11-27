/**
 * ATTACKSURFACE.md is read by people deciding whether to trust the plugin, so it must match the
 * code. These checks catch the drift that has happened before: a surface with a section but no
 * summary row (SURF-06b), a citation pointing past the end of a file that changed, and README
 * naming a file the plugin no longer writes (error-log.jsonl).
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8')
const doc = read('ATTACKSURFACE.md')

describe('ATTACKSURFACE.md', () => {
	test('says which version it applies to and when it was checked against the source', () => {
		expect(doc).toMatch(/^> \*\*Applies to \d+\.\d+\.\d+\*\*.*\*\*Verified against source \d{4}-\d{2}-\d{2}\.\*\*/m)
	})

	test('every surface with a section has a summary row, and every row has a section', () => {
		const sections = new Set([...doc.matchAll(/^## (SURF-\d+b?)(?: \/ (SURF-\d+b?))?/gm)].flatMap((m) => [m[1], m[2]]).filter(Boolean))
		const rows = new Set([...doc.matchAll(/^\| (SURF-\d+b?) \|/gm)].map((m) => m[1]))
		expect([...rows].sort()).toEqual([...sections].sort())
		expect(rows.has('SURF-06b')).toBe(true)
	})

	test('every summary row gives a severity before the fix and a residual one, from the legend', () => {
		const severity = /^(Critical|High|Medium|Low|Info|None)$/
		const rows = [...doc.matchAll(/^\| (SURF-\d+b?) \|([^\n]*)$/gm)]
		expect(rows.length).toBeGreaterThan(15)
		for (const [, id, rest] of rows) {
			const cells = rest.split('|').map((cell) => cell.trim())
			expect({ id, before: severity.test(cells[2]), residual: severity.test(cells[3]) }).toEqual({ id, before: true, residual: true })
		}
	})

	test('every file:line it cites exists and is inside the file', () => {
		const cites = [...doc.matchAll(/`((?:src|native|scripts)\/[\w./-]+\.(?:ts|svelte|cjs|c|swift)):(\d+)(?:-(\d+))?`/g)]
		expect(cites.length).toBeGreaterThan(40)
		for (const [, file, from, to] of cites) {
			expect({ file, exists: existsSync(join(ROOT, file)) }).toEqual({ file, exists: true })
			const lines = read(file).split('\n').length
			expect({ file, line: Number(to ?? from), inside: Number(to ?? from) <= lines }).toEqual({ file, line: Number(to ?? from), inside: true })
		}
	})

	test('the files it names as current exist; the stale page copy does not', () => {
		for (const file of ['src/settings-import.ts', 'src/voice/trace-file.ts', 'src/load-ws.cjs', 'src/ws-absent/bufferutil.cjs', 'src/websocket-bundle.test.ts']) {
			expect({ file, exists: existsSync(join(ROOT, file)) }).toEqual({ file, exists: true })
		}
		expect(existsSync(join(ROOT, 'src/remote-interface.html'))).toBe(false)
	})

	test('the command count it gives is the number main.ts registers', () => {
		const registered = new Set([...read('src/main.ts').matchAll(/registerCommand\('([\w-]+)'/g)].map((m) => m[1]))
		expect(doc).toContain(`${registered.size} commands are registered`)
		for (const command of ['voice-start', 'voice-toggle', 'obs-set-scene', 'obs-get-scenes', 'pin-note', 'open-file', 'load-speaker-notes']) {
			expect({ command, registered: registered.has(command), named: doc.includes(`\`${command}\``) }).toEqual({ command, registered: true, named: true })
		}
	})

	test('README and SECURITY.md agree with it', () => {
		const readme = read('README.md')
		expect(readme).not.toContain('error-log.jsonl')
		expect(readme).not.toContain('Only this computer can reach it')
		expect(readme).toContain('`/health` and `/api/health`')
		expect(read('SECURITY.md')).toContain('ATTACKSURFACE.md#scope-and-attacker-model')
		expect(doc).toContain('## Scope and attacker model')
		expect(doc).not.toContain('GPT-5.4')
		expect(doc).not.toContain('Forge')
	})
})
