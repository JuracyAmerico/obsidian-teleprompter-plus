import { describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { obsidianStub } from '../test-support/obsidian-stub'
import { appendCappedLine, utf8Bytes, VOICE_TRACE_FILE, VOICE_TRACE_MAX_BYTES, VOICE_TRACE_PREVIOUS_FILE } from './trace-file'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('../settings')
const { pickImportableSettings } = await import('../settings-import')

const src = (file: string): string => readFileSync(join(import.meta.dir, '..', file), 'utf8')

describe('voice-trace.jsonl', () => {
	test('never grows past the cap: it rotates into one older file, and two files is the most there are', () => {
		const dir = mkdtempSync(join(tmpdir(), 'tp-trace-'))
		try {
			const file = join(dir, VOICE_TRACE_FILE)
			const previous = join(dir, VOICE_TRACE_PREVIOUS_FILE)
			const cap = 1000
			const line = JSON.stringify({ type: 'heard', text: 'olá mundo '.repeat(5) }) + '\n'
			for (let i = 0; i < 200; i++) appendCappedLine(fs, file, previous, line, cap)

			expect(statSync(file).size).toBeLessThanOrEqual(cap)
			expect(statSync(previous).size).toBeLessThanOrEqual(cap)
			expect(readdirSync(dir).sort()).toEqual([VOICE_TRACE_PREVIOUS_FILE, VOICE_TRACE_FILE].sort())
			// Whole lines only: every line in both files parses
			for (const name of [file, previous]) {
				for (const row of readFileSync(name, 'utf8').trim().split('\n')) expect(() => JSON.parse(row) as unknown).not.toThrow()
			}
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('a first line bigger than the cap is still written, and the next one rotates it out', () => {
		const writes: string[] = []
		const renames: string[] = []
		let size = 0
		const fake = {
			statSync: () => {
				if (size === 0) throw new Error('ENOENT')
				return { size }
			},
			appendFileSync: (_path: string, data: string) => { writes.push(data); size += utf8Bytes(data) },
			renameSync: (from: string, to: string) => { renames.push(`${from}->${to}`); size = 0 },
		}
		appendCappedLine(fake, 'a', 'b', 'x'.repeat(50), 10)
		expect(renames).toEqual([])
		appendCappedLine(fake, 'a', 'b', 'y', 10)
		expect(renames).toEqual(['a->b'])
		expect(writes).toHaveLength(2)
	})

	test('the cap is 5 MB and counts bytes, not characters', () => {
		expect(VOICE_TRACE_MAX_BYTES).toBe(5 * 1024 * 1024)
		expect(utf8Bytes('ção')).toBe(5)
	})

	test('opt-in: off by default, a plain toggle in the voice settings that says what it writes, never imported', () => {
		expect(DEFAULT_SETTINGS.voiceTrace).toBe(false)
		expect(src('main.ts')).toContain('s.voiceTrace = s.voiceTrace === true')
		const settings = src('settings.ts')
		expect(settings).toContain("name: 'Write a voice trace (diagnostics)'")
		expect(settings).toMatch(/Off unless you turn it on\. Saves the whole script and every word the recognizer hears/)
		expect(pickImportableSettings({ voiceTrace: true }, DEFAULT_SETTINGS)).toEqual({})
	})

	test('wiring: the app writes the trace only through the capped writer, only while the switch is on', () => {
		const app = src('TeleprompterApp.svelte')
		expect(app).not.toContain('writeTraceLine')
		expect(app).not.toContain('error-log.jsonl')
		expect(app).toMatch(/appendCappedLine\(fs, path\.join\(dir, VOICE_TRACE_FILE\), path\.join\(dir, VOICE_TRACE_PREVIOUS_FILE\), line\)/)
		const calls = app.match(/writeVoiceTrace\(/g) ?? []
		const guarded = app.match(/if \(voiceTraceEnabled\(\)\) writeVoiceTrace\(/g) ?? []
		expect(calls.length).toBe(guarded.length + 1) // + the definition
		expect(guarded.length).toBe(3)
	})
})
