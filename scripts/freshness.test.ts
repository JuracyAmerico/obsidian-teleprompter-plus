import { describe, expect, test } from 'bun:test'
import { checkFreshness, isBehind, PLUGIN, runFreshness } from './freshness'

const registry = (version: string) => async () => version
const unreachable = async (): Promise<string> => {
	throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org')
}

describe('isBehind', () => {
	test('compares numerically, not as text', () => {
		expect(isBehind('0.1.9', '0.6.0')).toBe(true)
		expect(isBehind('0.9.0', '0.10.0')).toBe(true)
		expect(isBehind('0.6.0', '0.6.0')).toBe(false)
		expect(isBehind('0.6.1', '0.6.0')).toBe(false)
		expect(isBehind('1.0.0', '0.99.99')).toBe(false)
	})

	test('refuses a version it cannot read', () => {
		expect(() => isBehind('latest', '0.6.0')).toThrow('cannot compare')
	})
})

describe('lint plugin freshness gate', () => {
	test('refuses when the installed plugin is behind latest (the 0.12.14 case: 0.1.9 against 0.6.0)', async () => {
		const result = await checkFreshness('0.1.9', registry('0.6.0'))
		expect(result.ok).toBe(false)
		expect(result.message).toContain('0.1.9')
		expect(result.message).toContain('0.6.0')
		expect(result.message).toContain('behind')
	})

	test('passes when installed equals latest, and when it is ahead', async () => {
		expect((await checkFreshness('0.6.0', registry('0.6.0'))).ok).toBe(true)
		expect((await checkFreshness('0.7.0', registry('0.6.0'))).ok).toBe(true)
	})

	test('refuses, with a clear message, when the registry cannot be reached', async () => {
		const result = await checkFreshness('0.6.0', unreachable)
		expect(result.ok).toBe(false)
		expect(result.message).toContain('Cannot tell whether')
		expect(result.message).toContain('ENOTFOUND')
	})

	test('asks the registry about the lint plugin and never upgrades anything', async () => {
		const asked: string[] = []
		await checkFreshness('0.6.0', async (name) => {
			asked.push(name)
			return '0.6.0'
		})
		expect(asked).toEqual([PLUGIN])
		const behind = await checkFreshness('0.1.9', registry('0.6.0'))
		expect(behind.message).toContain('Upgrade it on purpose')
	})

	test('refuses when the plugin is not installed', async () => {
		const result = await runFreshness('/nonexistent-root', registry('0.6.0'))
		expect(result.ok).toBe(false)
		expect(result.message).toContain('not installed')
	})
})
