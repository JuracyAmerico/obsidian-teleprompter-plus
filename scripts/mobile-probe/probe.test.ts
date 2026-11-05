import { beforeAll, describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { obsidianStub } from '../../src/test-support/obsidian-stub'

const source = readFileSync(join(import.meta.dir, 'main.ts'), 'utf8')

const stub = obsidianStub
void mock.module('obsidian', () => stub)
const { ProbeReport, bounded, runPassive } = await import('./main')

let bundle = ''
beforeAll(async () => {
	const built = await Bun.build({ entrypoints: [join(import.meta.dir, 'main.ts')], format: 'cjs', target: 'browser', external: ['obsidian'] })
	bundle = await built.outputs[0].text()
})

function fakeVault() {
	const saves: string[] = []
	const vault = {
		create: async (_path: string, body: string) => { saves.push(body) },
		adapter: { write: async (_path: string, body: string) => { saves.push(body) } },
	}
	return { saves, app: { vault } as never }
}

describe('mobile probe', () => {
	test('require: the bundle evaluates when only obsidian can be required', () => {
		const asked: string[] = []
		const onlyObsidian = (name: string) => {
			asked.push(name)
			if (name === 'obsidian') return stub
			throw new Error(`no module ${name}`)
		}
		const module = { exports: {} as { default?: unknown } }
		new Function('require', 'module', 'exports', bundle)(onlyObsidian, module, module.exports)
		expect(asked).toEqual(['obsidian'])
		expect(typeof module.exports.default).toBe('function')
	})

	test('require: no regular expression literal holds a lookbehind, which would stop an old iPhone parsing the file', () => {
		expect(bundle.includes('/(?<')).toBe(false)
	})

	test('network: nothing reaches out, and speech recognition is only looked at', () => {
		expect(source).not.toMatch(/\b(fetch|requestUrl|XMLHttpRequest|WebSocket|sendBeacon)\s*\(|new WebSocket/)
		expect(source).not.toMatch(/new\s+(webkit)?SpeechRecognition/)
	})

	test('no audio: nothing records or writes the microphone', () => {
		expect(source).not.toMatch(/MediaRecorder|createScriptProcessor/)
		const body = source.slice(source.indexOf('async function microphoneTest'), source.indexOf('async function wakeLockTest'))
		expect(body).not.toMatch(/vault|adapter|indexedDB/)
		expect(body).toContain('track.stop()')
	})

	test('after every step: the note is saved each time a row is added', async () => {
		const { saves, app } = fakeVault()
		const report = new ProbeReport(app, 'now')
		await report.add('one', 'a')
		await report.add('two', 'b|c')
		expect(saves.length).toBe(2)
		expect(saves[1]).toContain('| one | a |')
		expect(saves[1]).toContain('| two | b/c |')
	})

	test('after every step: saves overlapping in time still land in order', async () => {
		const { saves, app } = fakeVault()
		const report = new ProbeReport(app, 'now')
		await Promise.all([report.add('one', 'a'), report.add('two', 'b'), report.add('three', 'c')])
		expect(saves.length).toBe(3)
		expect(saves[2]).toContain('| three | c |')
	})

	test('after every step: a passive run with no browser APIs still reports each check', async () => {
		const { saves, app } = fakeVault()
		const report = new ProbeReport(app, 'now')
		await runPassive(report)
		expect(report.rows.length).toBe(saves.length)
		const names = report.rows.map((row: string[]) => row[0])
		for (const name of ["require('fs')", 'Regex lookbehind', 'WebAssembly', 'wakeLock', 'IndexedDB']) expect(names).toContain(name)
	})

	test('timeout: a step that never settles is recorded and the next one runs', async () => {
		const hung = await bounded(() => new Promise<string>(() => {}), 10)
		expect(hung).toBe('TIMEOUT after 10 ms')
		expect(await bounded(async () => 'next')).toBe('next')
		expect(await bounded(async () => { throw new TypeError('nope') })).toBe('FAILED TypeError: nope')
	})
})
