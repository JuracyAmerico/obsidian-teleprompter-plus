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

describe('ISC-159: the phone remote speed slider and section highlight', () => {
	const page = readFileSync(join(import.meta.dir, 'remote-interface.ts'), 'utf8')
	const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
	test('incoming state leaves the thumb alone while dragging; fine steps; live updates', () => {
		expect(page).toContain('if (!speedDragging) {')
		expect(page).toContain('min="0.5" max="10" step="0.1"')
		expect(page).toContain('if (now - lastSpeedSent > 120) {')
	})
	test('set-speed uses the slider range, not 1 to 50', () => {
		expect(app).not.toContain('Math.max(1, Math.min(50, customEvent.detail.speed))')
		expect(app).toContain('Math.max(settings.minScrollSpeed || 0.5, Math.min(settings.maxScrollSpeed || 10, customEvent.detail.speed))')
	})
	test('the list scrolls the current section into view, after the open animation', () => {
		expect(page).toContain('function scrollToCurrentSection() {')
		expect(page).toContain('setTimeout(scrollToCurrentSection, 350);')
	})
	test('the current section is sent and pushes on change', () => {
		expect(app).toContain('currentHeaderIndex: headers().findIndex(h => h.text === currentVisibleHeader),')
		expect(app).toContain('section: currentVisibleHeader,')
	})
})

describe('ISC-160: the phone remote page as served', () => {
	test('its script parses (a \\n in the template once became a real line break and killed the page)', async () => {
		const { REMOTE_INTERFACE_HTML } = await import('./remote-interface')
		const js = REMOTE_INTERFACE_HTML.slice(REMOTE_INTERFACE_HTML.lastIndexOf('<script>') + 8, REMOTE_INTERFACE_HTML.lastIndexOf('</script>'))
		expect(() => new Function(js)).not.toThrow()
	})
	test('the section list is rebuilt only when sections change; the highlight moves in place; no scroll under a finger', () => {
		const page = readFileSync(join(import.meta.dir, 'remote-interface.ts'), 'utf8')
		expect(page).toContain('sectionsKey(newState.headers) !== sectionsKey(state.headers)')
		expect(page).toContain('markCurrentSection();')
		expect(page).toContain('if (Date.now() - lastSectionsTouch < 3000) return;')
	})
})
