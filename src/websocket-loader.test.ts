import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('websocket loader packaging', () => {
	test('loads ws from the installed plugin runtime rather than a bundled import', () => {
		const source = readFileSync(
			path.resolve(import.meta.dir, 'websocket-loader.ts'),
			'utf8',
		)

		expect(source).not.toContain("import * as bundledWs from 'ws'")
		expect(source).toContain("'plugins', 'teleprompter-plus', 'node_modules', 'ws'")
		expect(source).toMatch(/=\s*require\('ws'\)/)
	})
})
