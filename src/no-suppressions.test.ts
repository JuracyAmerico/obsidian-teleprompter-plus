import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Shipped source carries no lint or type suppression. A suppression turns an error the Obsidian
 * review bot reports into a pass on our machine only; 0.12.14 failed review that way. This test
 * reads files as text and does not depend on ESLint, so it holds even if the lint config is
 * loosened or broken.
 */

const SUPPRESSION = /eslint-disable|eslint-enable|@ts-ignore|@ts-nocheck/

const srcDir = import.meta.dir

/** Shipped source: .ts and .svelte under src/, minus test files and test support. */
function shippedFiles(dir: string): string[] {
	const files: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'test-support') continue
			files.push(...shippedFiles(full))
		} else if (/\.(ts|svelte)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
			files.push(full)
		}
	}
	return files
}

/** "file:line: text" for every line that suppresses lint or type checking. */
export function findSuppressions(sources: Record<string, string>): string[] {
	const found: string[] = []
	for (const [name, text] of Object.entries(sources)) {
		text.split(/\r?\n/).forEach((line, index) => {
			if (SUPPRESSION.test(line)) found.push(`${name}:${index + 1}: ${line.trim()}`)
		})
	}
	return found
}

describe('no suppression comments in shipped source', () => {
	test('finds each kind of suppression, with file and line', () => {
		const found = findSuppressions({
			'a.ts': 'const x = 1\n// eslint-disable-next-line @typescript-eslint/no-deprecated\nfoo()\n',
			'b.ts': '/* eslint-disable */\n/* eslint-enable */\n',
			'c.svelte': '<script lang="ts">\n// @ts-ignore\n// @ts-nocheck\n</script>\n',
		})
		expect(found).toEqual([
			'a.ts:2: // eslint-disable-next-line @typescript-eslint/no-deprecated',
			'b.ts:1: /* eslint-disable */',
			'b.ts:2: /* eslint-enable */',
			'c.svelte:2: // @ts-ignore',
			'c.svelte:3: // @ts-nocheck',
		])
	})

	test('clean source reports nothing', () => {
		expect(findSuppressions({ 'a.ts': 'const x = 1 // fine\n' })).toEqual([])
	})

	test('the scan sees the shipped files (it is not trivially empty)', () => {
		const files = shippedFiles(srcDir)
		expect(files.length).toBeGreaterThan(50)
		expect(files.some((f) => f.endsWith('passage-dom.ts'))).toBe(true)
		expect(files.some((f) => f.endsWith('.svelte'))).toBe(true)
		expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false)
		expect(files.some((f) => f.includes(`${path.sep}test-support${path.sep}`))).toBe(false)
	})

	test('shipped source has no eslint-disable, eslint-enable, @ts-ignore or @ts-nocheck', () => {
		const sources: Record<string, string> = {}
		for (const file of shippedFiles(srcDir)) sources[path.relative(srcDir, file)] = readFileSync(file, 'utf8')
		expect(findSuppressions(sources)).toEqual([])
	})
})
