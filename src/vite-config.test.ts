import { describe, expect, test } from 'bun:test'
import viteConfig from '../vite.config'

describe('vite build packaging', () => {
	test('keeps ws external so the Obsidian bundle does not inline Node-only websocket server code', () => {
		const external = viteConfig.build?.rollupOptions?.external

		expect(Array.isArray(external)).toBe(true)
		expect(external).toContain('ws')
	})

	test('does not alias ws into the browser-oriented Vite bundle', () => {
		const alias = viteConfig.resolve?.alias

		expect(alias).toBeDefined()
		expect(alias).not.toHaveProperty('ws')
	})
})
