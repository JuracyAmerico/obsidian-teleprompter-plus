import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Source-text guards for wiring inside the Svelte component, which bun cannot mount. The window
 * behaviour itself is tested with a fake window in floating-window.test.ts.
 */
const root = join(import.meta.dir, '..')
const app = readFileSync(join(root, 'TeleprompterApp.svelte'), 'utf8')
const service = readFileSync(join(root, 'voice', 'voice-tracking-service.ts'), 'utf8')
const main = readFileSync(join(root, 'main.ts'), 'utf8')
const manifest = JSON.parse(readFileSync(join(root, '..', 'manifest.json'), 'utf8')) as { isDesktopOnly: boolean }

function functionBody(name: string): string {
	const start = app.search(new RegExp(`(async )?function ${name}\\(`))
	expect(start).toBeGreaterThan(-1)
	const rest = app.slice(start + 1)
	const end = rest.search(/\n {2}(async )?function /)
	return rest.slice(0, end)
}

describe('floating wiring', () => {
	test('platform gate: the button renders only where floating works, and the plugin stays desktop-only', () => {
		expect(app).toContain('canFloat({ isDesktopApp: Platform.isDesktopApp, isLinux: Platform.isLinux })')
		expect(app).toMatch(/control\.id === 'float'\}\s*\{#if floatSupported\}/)
		expect(manifest.isDesktopOnly).toBe(true)
	})

	test('own window: the voice service schedules nothing on the main window', () => {
		expect(service).toContain('this.contentArea?.ownerDocument?.defaultView')
		expect(service).not.toMatch(/(?<![.\w])requestAnimationFrame\(/)
		expect(service).not.toMatch(/(?<![.\w])cancelAnimationFrame\(/)
		expect(service).not.toMatch(/window\.setTimeout\(/)
		expect(service).not.toMatch(/\b(window|self|globalThis)\.(requestAnimationFrame|setInterval)\(/)
	})

	test('own window: the app schedules frames and the clock from its own window', () => {
		expect(app).not.toMatch(/(?<![.\w])requestAnimationFrame\(/)
		expect(app).not.toMatch(/(?<![.\w])cancelAnimationFrame\(/)
		expect(app).toContain('clockWindow.setInterval(')
		expect(app).not.toMatch(/\b(window|self|globalThis)\.requestAnimationFrame\(/)
	})

	test('close stops voice: the view teardown stops the helper, tells the main window, ends floating', () => {
		const stop = app.indexOf('voiceTrackingService.stop()', app.indexOf('Stop listening when the view goes away'))
		const told = app.indexOf("data: { voiceTrackingActive: false }", stop)
		const ended = app.indexOf('endFloating()', told)
		expect(stop).toBeGreaterThan(-1)
		expect(told).toBeGreaterThan(stop)
		expect(ended).toBeGreaterThan(told)
		expect(ended).toBeLessThan(app.indexOf('stateChannel.close()'))
	})

	test('pins note: the note is pinned by path before the active-note load can replace it', () => {
		const mount = app.indexOf('const floatRequest = isInPopoutWindow()')
		const pin = app.indexOf('pinnedNotePath = floatRequest.notePath', mount)
		const load = app.indexOf('loadActiveNote()', mount)
		expect(mount).toBeGreaterThan(-1)
		expect(pin).toBeGreaterThan(mount)
		expect(pin).toBeLessThan(load)
		expect(functionBody('beginFloating')).toContain('pinnedNotePath = request.notePath')
		expect(functionBody('beginFloating')).not.toContain('getActiveFile')
	})

	test('fallback notice: no window controls gives one Notice and no controller', () => {
		const body = functionBody('beginFloating')
		expect(body).toContain('electronWindowOf(win)')
		expect(body).toMatch(/\} else \{\s*new Notice\('Floating is not available/)
	})

	test('error banner: a voice failure while floating shows inside the floating window', () => {
		expect(functionBody('reportVoiceFailure')).toContain('if (isFloating) floatingVoiceError = voiceFailureText(message)')
		expect(app).toMatch(/\{#if floatingVoiceError\}[\s\S]*role="alert"/)
	})

	test('three unlock paths: the corner handle, a main-window button, and remote and command', () => {
		expect(app).toMatch(/class="tp-floating-handle"[\s\S]*onclick=\{\(\) => plugin\.floatingSession\.unlock\(\)\}/)
		expect(app).toMatch(/\{:else if floatingSessionLocked\}\s*<button class="tp-floating-main-unlock" onclick=\{\(\) => plugin\.floatingSession\.unlock\(\)\}/)
		expect(main).toMatch(/registerCommand\('floating-unlock', \(\) => \{\s*this\.floatingSession\.unlock\(\)/)
		expect(main).toMatch(/id: 'floating-unlock'/)
	})

	test('voice hand-off: floating stops voice in this view and starts it in the floating one', () => {
		const start = functionBody('toggleFloating')
		expect(start).toContain('startVoice: isVoiceEngaged(')
		expect(start).toContain('if (request.startVoice) void toggleVoiceTracking()')
		expect(functionBody('beginFloating')).toContain('if (request.startVoice) await toggleVoiceTracking()')
	})

	test('prompter button: moves the window, remembers the choice, keeps the saved position', () => {
		const body = functionBody('togglePrompterPlacement')
		expect(body).toContain('plugin.settings.floatingPreferPrompter = ')
		expect(body).toContain('floatingController.moveTo(')
		expect(functionBody('saveFloatingBounds')).toMatch(/floatingOnPrompter/)
		expect(app).toContain('onclick={togglePrompterPlacement}')
		expect(app).toMatch(/\{#if floatingHasPrompter\}/)
	})

	test('routes commands: the main view hands events and its voice button to the floating view', () => {
		const handler = functionBody('handleWebSocketEvent')
		expect(handler.slice(0, 500)).toMatch(/!isFloating && plugin\.floatingSession\.active/)
		expect(handler.slice(0, 800)).toContain('plugin.floatingSession.forward(customEvent.type, customEvent.detail)')
		const voice = functionBody('toggleVoiceTracking')
		expect(voice.slice(0, 300)).toContain("plugin.floatingSession.forward('teleprompter:voice-toggle')")
		expect(functionBody('beginFloating')).toContain('new (win as Window & typeof globalThis).CustomEvent(type, { detail })')
	})

	test('prompter chrome: hidden only under the Prompter class', () => {
		expect(app).toContain('class:tp-floating-prompter={floatingOnPrompter}')
		expect(app).toMatch(/\.tp-floating-prompter \.controls,\s*\.tp-floating-prompter \.tp-readout-row,\s*\.tp-floating-prompter \.navigation-panel,\s*\.tp-floating-prompter \.status-bar \{\s*display: none;/)
	})

	test('real window: the view mounts inside its own window, and an unclaimed request is cleared', () => {
		const view = readFileSync(join(root, 'view.ts'), 'utf8')
		expect(view).toContain('this.leaf.getContainer().doc')
		expect(view.indexOf('await this.waitForOwnWindow()')).toBeLessThan(view.indexOf('mount(TeleprompterApp'))
		const toggle = functionBody('toggleFloating')
		expect(toggle.indexOf('await leaf.setViewState')).toBeLessThan(toggle.indexOf('plugin.floatingSession.takeRequest()'))
		expect(toggle).toContain("new Notice('Could not open the floating window")
	})

	test('voice owner: a view that does not own the voice never stops or seeks it', () => {
		expect(app).toMatch(/function ownsVoice\(\): boolean \{\s*return isFloating \|\| !plugin\.floatingSession\.active/)
		const teardown = app.slice(app.indexOf('Stop listening when the view goes away'))
		expect(teardown.slice(0, 500)).toContain('ownsVoice() &&')
		expect(functionBody('jumpToHeader').length).toBeGreaterThan(0)
		expect(app).toMatch(/if \(ownsVoice\(\) && voiceTrackingActive && voiceTrackingService && jumpWordIndex >= 0\)/)
		expect(app).toMatch(/if \(ownsVoice\(\) && voiceTrackingActive && voiceTrackingService\) \{/)
	})

	test('display change: the floating tick rechecks displays', () => {
		const tick = functionBody('syncFloatingDisplay')
		expect(tick).toContain('floatingHasPrompter = findPrompterDisplay(displays) !== null')
		expect(tick).toContain('placementAfterPrompterLost(')
		expect(tick).toContain('floatingController.moveTo(')
		expect(functionBody('beginFloating')).toContain('syncFloatingDisplay()')
	})

	test('language menu: three choices, and a saved en-US becomes Automatic once', () => {
		const settings = readFileSync(join(root, 'settings.ts'), 'utf8')
		expect(settings).toContain("{ value: 'auto', label: 'Automatic' }")
		expect(settings).toContain("{ value: 'pt-BR', label: 'Portuguese (Brazil)' }")
		expect(main).toContain('migrateVoiceLanguageSetting(this.settings)')
		expect(app).toContain('language: scriptVoiceLanguage(),')
	})

	test('outline: the text outline exists only under the floating class', () => {
		const shadows = app.split('\n').filter(line => line.includes('text-shadow: -1px -1px 0 #000'))
		expect(shadows).toHaveLength(1)
		const at = app.indexOf('text-shadow: -1px -1px 0 #000')
		expect(app.slice(at - 60, at)).toContain('.tp-floating .content-area')
		expect(app).toContain('class:tp-floating={isFloating}')
	})
})

describe('closing the floating window', () => {
	test('one command closes through the leaf, because pop-outs ignore window.close', () => {
		const app = readFileSync(join(import.meta.dir, '..', 'TeleprompterApp.svelte'), 'utf8')
		expect(app).toContain('closeOwnLeaf,')
		expect(app).not.toContain('() => win.close()')
		expect(app).toContain('plugin.floatingSession.claim(customEvent)')
	})
})

describe('commands while floating', () => {
	test('every view hears a command, and the floating script receives it once', () => {
		const app = readFileSync(join(import.meta.dir, '..', 'TeleprompterApp.svelte'), 'utf8')
		const route = app.slice(app.indexOf('Commands arrive at the main window'), app.indexOf("switch (customEvent.type) {"))
		expect(route.indexOf('floatingSession.claim(customEvent)')).toBeLessThan(route.indexOf('floatingSession.forward('))
		expect(route).toContain('floatingSession.claim(customEvent)')
	})
})
