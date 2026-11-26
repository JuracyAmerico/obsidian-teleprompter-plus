import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isLoopbackAddress, remoteKeyFromUrl } from './websocket-server'

describe('ISC-158: remote key for clients off this computer', () => {
	test('loopback addresses are this computer; network addresses are not', () => {
		for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.2']) expect(isLoopbackAddress(a)).toBe(true)
		for (const a of ['192.168.2.40', '100.73.241.35', '::ffff:192.168.2.40', '', undefined]) expect(isLoopbackAddress(a)).toBe(false)
	})

	test('the key is read from the link query', () => {
		expect(remoteKeyFromUrl('/?key=abc123')).toBe('abc123')
		expect(remoteKeyFromUrl('/remote?x=1&key=k')).toBe('k')
		expect(remoteKeyFromUrl('/')).toBe('')
		expect(remoteKeyFromUrl(undefined)).toBe('')
	})

	test('server, page, plugin and broadcast are wired', () => {
		const ws = readFileSync(join(import.meta.dir, 'websocket-server.ts'), 'utf8')
		expect(ws).toContain("const requiredToken = this.config.authToken || (offMachine ? this.config.remoteKey : '')")
		expect(ws).toContain("remoteKeyFromUrl(req.url) !== this.config.remoteKey")
		const page = readFileSync(join(import.meta.dir, 'remote-interface.ts'), 'utf8')
		expect(page).toContain("ws.send(JSON.stringify({ type: 'auth', token: key }))")
		const main = readFileSync(join(import.meta.dir, 'main.ts'), 'utf8')
		expect(main).toContain('remoteKey: this.settings.remoteKey,')
		const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
		expect(app).toMatch(/const intervalId = setInterval\(\(\) => \{\s*if \(!contentArea\) return[\s\S]{0,300}if \(!isFloating && plugin\.floatingSession\.active\) return/)
	})
})
