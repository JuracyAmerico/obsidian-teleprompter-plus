import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import viteConfig from '../../vite.config'
import { DESKTOP_ONLY_ENGINES, DESKTOP_ONLY_SETTINGS_TABS, DESKTOP_ONLY_TOOLBAR_CONTROLS, PHONE_BAR_CONTROLS, PHONE_MORE_CONTROLS, forPhone } from './mobile-surface'
import { ScreenHold, type ScreenHoldDeps, type WakeLockApi } from './screen-hold'

const SRC = join(import.meta.dir, '..')

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap(name => {
		const full = join(dir, name)
		if (statSync(full).isDirectory()) return name === 'test-support' ? [] : sourceFiles(full)
		return /\.(ts|svelte)$/.test(name) && !name.endsWith('.test.ts') ? [full] : []
	})
}

// Used only by scripts/package-plugin-runtime.ts at build time, never by the plugin itself
const BUILD_TIME_ONLY = ['plugin-package.ts']

describe('mobile phase 1', () => {
	test('ISC-117 no static import: plugin source imports no Node or Electron module except as a type', () => {
		const native = /^\s*import\s+(?!type\b)[^;'"]*?from\s+['"](node:[\w/]+|fs|path|os|child_process|electron|ws|http|https|crypto|net)['"]/m
		const offenders = sourceFiles(SRC)
			.filter(file => !BUILD_TIME_ONLY.includes(relative(SRC, file)))
			.filter(file => native.test(readFileSync(file, 'utf8')))
			.map(file => relative(SRC, file))
		expect(offenders).toEqual([])
		const main = readFileSync(join(SRC, 'main.ts'), 'utf8')
		expect(main).not.toContain('plugin-package')
	})

	test('ISC-118 no server on the phone: the start path and the auto start both ask the device first', () => {
		const main = readFileSync(join(SRC, 'main.ts'), 'utf8')
		expect(main).toMatch(/autoStartWebSocket && canRunDesktopMachinery\(\)/)
		expect(main).toMatch(/if \(this\.wsServer \|\| !canRunDesktopMachinery\(\)\)/)
	})

	test('ISC-119 phone surface: desktop-only tabs, controls and engines drop out only on the phone', () => {
		expect(DESKTOP_ONLY_SETTINGS_TABS).toEqual(expect.arrayContaining(['connection', 'obs']))
		expect(DESKTOP_ONLY_TOOLBAR_CONTROLS).toEqual(expect.arrayContaining(['float', 'detach', 'voice-tracking']))
		expect(DESKTOP_ONLY_ENGINES).toEqual(expect.arrayContaining(['kokoro', 'mac-say']))
		const engines = ['auto', 'kokoro', 'mac-say', 'web-speech', 'elevenlabs']
		expect(forPhone(engines, e => e, DESKTOP_ONLY_ENGINES, true)).toEqual(['auto', 'web-speech', 'elevenlabs'])
		expect(forPhone(engines, e => e, DESKTOP_ONLY_ENGINES, false)).toEqual(engines)
		const app = readFileSync(join(SRC, 'TeleprompterApp.svelte'), 'utf8')
		expect(app).toContain('ordered.filter(def => PHONE_BAR_CONTROLS.includes(def.id) || PHONE_MORE_CONTROLS.includes(def.id))')
		expect(app).toContain('if (showsMobileInterface()) return PHONE_MORE_CONTROLS.includes(def.id)')
		const phone = [...PHONE_BAR_CONTROLS, ...PHONE_MORE_CONTROLS]
		for (const desktopOnly of DESKTOP_ONLY_TOOLBAR_CONTROLS) expect(phone).not.toContain(desktopOnly)
		// Six on the bar plus More fit a 390-point phone; measured at 390 px under emulateMobile
		expect(PHONE_BAR_CONTROLS.filter(id => id !== 'time-display').length).toBeLessThanOrEqual(6)
	})

	test('ISC-124 phone page: opens in the main page, no keyboard hints, section panel starts closed', () => {
		const main = readFileSync(join(SRC, 'main.ts'), 'utf8')
		expect(main).toContain("mobile ? workspace.getLeaf('tab') : workspace.getRightLeaf(false)")
		const app = readFileSync(join(SRC, 'TeleprompterApp.svelte'), 'utf8')
		expect(app).toContain('{#if !isTeleprompterFocused && !showsMobileInterface()}')
		expect(app).toContain('let showNavigation = $state(!showsMobileInterface() &&')
		expect(app).toMatch(/font-size: min\(calc\(var\(--base-font-size\) \* 1\.8\), 9cqw\)/)
	})

	test('ISC-125 thumb reach: on a phone the controls sit at the bottom, clear of the status bar and the navigation bar', () => {
		const app = readFileSync(join(SRC, 'TeleprompterApp.svelte'), 'utf8')
		expect(app).toContain('class:tp-phone={showsMobileInterface()}')
		expect(app).toMatch(/\.teleprompter-plus\.tp-phone > \.controls \{\s*order: 10;/)
		expect(app).toMatch(/padding-top: var\(--safe-area-inset-top/)
		expect(app).toMatch(/padding-bottom: calc\(var\(--navbar-height/)
	})

	test('ISC-127 menus open upward: on a phone every toolbar menu opens above the bar, never under the navigation bar', () => {
		const app = readFileSync(join(SRC, 'TeleprompterApp.svelte'), 'utf8')
		const rule = app.match(/\.teleprompter-plus\.tp-phone > \.controls :is\(([^)]*)\) \{([^}]*)\}/)
		expect(rule).not.toBeNull()
		for (const popup of ['.popup-slider', '.popup-panel']) expect(rule![1]).toContain(popup)
		expect(rule![2]).toContain('top: auto;')
		expect(rule![2]).toContain('bottom: calc(100% + 0.5rem);')
	})

	test('ISC-126 iPhone is not a Mac: every isMacOS check in the engines also requires Node', () => {
		// Obsidian on iOS reports Platform.isMacOS true; trusting it alone sent read-aloud into Kokoro,
		// which threw "path is not available on this device" (phone log, 2026-11-05 21:14)
		const files = ['tts/mac-say-engine.ts', 'tts/kokoro-engine.ts', 'voice/apple-speech-recognizer.ts']
		for (const file of files) {
			const source = readFileSync(join(SRC, file), 'utf8')
			const uses = source.split('\n').filter(line => line.includes('Platform.isMacOS') && !line.trim().startsWith('//'))
			expect(uses.length).toBeGreaterThan(0)
			for (const line of uses) expect(`${file}: ${line.trim()}`).toMatch(/hasNode\(\)/)
		}
	})

	test('ISC-121 no inline map: a default build carries no source map', () => {
		expect(viteConfig.build?.sourcemap).toBe(false)
	})
})

function fakeWakeLock() {
	const log: string[] = []
	let n = 0
	const api: WakeLockApi = {
		request: async () => {
			const id = ++n
			log.push(`request ${id}`)
			const sentinel = { released: false, release: async () => { sentinel.released = true; log.push(`release ${id}`) } }
			return sentinel
		},
	}
	const listeners = new Map<string, () => void>()
	const doc = {
		visibilityState: 'visible' as DocumentVisibilityState,
		addEventListener: (type: string, fn: () => void) => { listeners.set(type, fn) },
		removeEventListener: (type: string) => { listeners.delete(type) },
	}
	return { api, log, doc, listeners }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('ISC-120 screen hold on the phone', () => {
	test('wake lock: play requests a screen lock and pause releases it', async () => {
		const fake = fakeWakeLock()
		const hold = new ScreenHold({ powerSaveBlocker: () => null, wakeLock: () => fake.api, doc: fake.doc as unknown as ScreenHoldDeps['doc'] })
		expect(hold.supported).toBe(true)
		expect(hold.start()).toBe(true)
		await settle()
		hold.stop()
		await settle()
		expect(fake.log).toEqual(['request 1', 'release 1'])
	})

	test('wake lock: returning to the app asks again, and nothing is asked after a stop', async () => {
		const fake = fakeWakeLock()
		const hold = new ScreenHold({ powerSaveBlocker: () => null, wakeLock: () => fake.api, doc: fake.doc as unknown as ScreenHoldDeps['doc'] })
		hold.start()
		await settle()
		fake.listeners.get('visibilitychange')?.()
		await settle()
		hold.stop()
		await settle()
		expect(fake.listeners.has('visibilitychange')).toBe(false)
		expect(fake.log.filter(l => l.startsWith('request'))).toEqual(['request 1', 'request 2'])
	})

	test('desktop keeps Electron, and a device with neither cannot hold', () => {
		const calls: string[] = []
		const blocker = { start: () => { calls.push('start'); return 7 }, stop: (id: number) => { calls.push(`stop ${id}`) } }
		const desktop = new ScreenHold({ powerSaveBlocker: () => blocker, wakeLock: () => null, doc: null })
		desktop.start()
		desktop.stop()
		expect(calls).toEqual(['start', 'stop 7'])
		const none = new ScreenHold({ powerSaveBlocker: () => null, wakeLock: () => null, doc: null })
		expect(none.supported).toBe(false)
		expect(none.start()).toBe(false)
	})
})
