import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Américo, 2026-11-05: "I don't wanna see those emoji icons again on t+". Interface icons are Obsidian's
 * Lucide set through setIcon. Text the reader wrote is theirs and is not touched.
 */
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name)
		if (statSync(path).isDirectory()) return sourceFiles(path)
		return /\.(ts|svelte|css|html)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
	})
}

describe('interface icons', () => {
	test('no emoji anywhere in the plugin source', () => {
		const found: string[] = []
		for (const file of sourceFiles(import.meta.dir)) {
			readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
				if (EMOJI.test(line)) found.push(`${file.slice(import.meta.dir.length + 1)}:${i + 1}`)
			})
		}
		expect(found).toEqual([])
	})

	test('the release notes dialog uses icon names', () => {
		const source = readFileSync(join(import.meta.dir, 'release-notes.ts'), 'utf8')
		expect(source).toContain("added: 'plus-circle'")
	})
})
