import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { GATE_NAMES, gates, verify, type Gate } from './verify'

const root = path.resolve(import.meta.dir, '..')
const read = (name: string) => readFileSync(path.join(root, name), 'utf8')

describe('verify holds every gate', () => {
	test('the gates are deps, freshness, check, test, lint and build, in that order', () => {
		expect(GATE_NAMES).toEqual(['deps', 'freshness', 'check', 'test', 'lint', 'build'])
	})

	test('the deps gate installs exactly what bun.lock says', () => {
		expect(gates()[0].run).toEqual(['bun', 'install', '--frozen-lockfile'])
	})

	test('the freshness gate uses the injected registry and fails when the plugin is behind', async () => {
		const freshness = gates(async () => '99.0.0').find((gate) => gate.name === 'freshness')!
		expect(freshness.name).toBe('freshness')
		expect(typeof freshness.run).toBe('function')
		const result = await (freshness.run as (root: string) => Promise<{ ok: boolean; message: string }>)(root)
		expect(result.ok).toBe(false)
		expect(result.message).toContain('behind')
	})

	test('stops at the first failing gate and names it', async () => {
		const ran: string[] = []
		const list: Gate[] = [
			{ name: 'one', run: async () => (ran.push('one'), { ok: true, message: 'ok' }) },
			{ name: 'two', run: async () => (ran.push('two'), { ok: false, message: 'nope' }) },
			{ name: 'three', run: async () => (ran.push('three'), { ok: true, message: 'ok' }) },
		]
		const verdict = await verify(root, list)
		expect(verdict).toEqual({ ok: false, failed: 'two', message: 'nope' })
		expect(ran).toEqual(['one', 'two'])
	})

	test('a failing command gate fails the verdict', async () => {
		const verdict = await verify(root, [{ name: 'boom', run: ['bun', '-e', 'process.exit(3)'] }])
		expect(verdict.ok).toBe(false)
		expect(verdict.failed).toBe('boom')
		expect(verdict.message).toContain('exit 3')
	})

	test('release.ts and both workflows call verify and list no gate of their own', () => {
		const gateCommand = /\bbun (run )?(check|test|lint|build)\b/
		for (const file of ['scripts/release.ts', '.github/workflows/ci.yml', '.github/workflows/release.yml']) {
			const text = read(file)
			expect(text, `${file} lists a gate`).not.toMatch(gateCommand)
		}
		expect(read('.github/workflows/ci.yml')).toContain('bun scripts/verify.ts')
		expect(read('.github/workflows/release.yml')).toContain('bun scripts/verify.ts')
		expect(read('scripts/release.ts')).toContain("from './verify'")
	})
})
