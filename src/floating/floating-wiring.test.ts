import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LISTENED_COMMAND_EVENTS, SCRIPT_HOTKEY_ACTIONS, dispatchCommand, ownsScript, parseCommand } from '../commands'
import { commandHandlerSource } from '../test-support/command-handler-source'
import { FloatingSession } from './floating-window'

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
		// Whether a command runs here or is forwarded is commands.ts's rule, tested as behaviour there and
		// with the real FloatingSession below; the view hands it this view and the plugin's session.
		expect(functionBody('handleCommandEvent')).toContain('dispatchCommand(event, commandView(), plugin.floatingSession, intent => runIntent(commandHandlers, intent))')
		expect(app).toContain('LISTENED_COMMAND_EVENTS.forEach(eventType => {\n      actualWin.addEventListener(eventType, handleCommandEvent)')
		expect(app).toContain('LISTENED_COMMAND_EVENTS.forEach(eventType => {\n        actualWin.removeEventListener(eventType, handleCommandEvent)')
		const voice = functionBody('toggleVoiceTracking')
		expect(voice.slice(0, 300)).toContain("plugin.floatingSession.forward('teleprompter:voice-toggle')")
		expect(functionBody('beginFloating')).toContain('new (win as Window & typeof globalThis).CustomEvent(type, { detail })')
	})

	test('prompter chrome: hidden only under the Prompter class', () => {
		expect(app).toContain('class:tp-floating-prompter={floatingOnPrompter}')
		expect(app).toMatch(/\.tp-floating-prompter \.controls,\s*\.tp-floating-prompter \.tp-readout-row,\s*\.tp-floating-prompter \.navigation-panel \{\s*display: none;/)
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
		expect(app).toMatch(/function ownsVoice\(\): boolean \{\s*return ownsScript\(commandView\(\)\)/)
		expect(app).toMatch(/function commandView\(\): CommandView \{\s*return \{ isFloating, floatingActive: plugin\.floatingSession\.active, canFloat: floatSupported \}/)
		expect(ownsScript({ isFloating: false, floatingActive: true, canFloat: true })).toBe(false)
		expect(ownsScript({ isFloating: true, floatingActive: true, canFloat: true })).toBe(true)
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
		expect(app).toContain('() => (capturedLeaf ? capturedLeaf.detach() : closeOwnLeaf()),')
		expect(app).not.toContain('() => win.close()')
		// One toggle-floating heard by every open view toggles once: the first view claims it.
		const session = new FloatingSession()
		const event = new CustomEvent('teleprompter:toggle-floating')
		const toggled: string[] = []
		const main = { isFloating: false, floatingActive: false, canFloat: true }
		dispatchCommand(event, main, session, intent => toggled.push(intent.kind))
		dispatchCommand(event, main, session, intent => toggled.push(intent.kind))
		expect(toggled).toEqual(['toggleFloating'])
		expect(app).toContain('toggleFloating: () => { void toggleFloating() },')
	})
})

describe('commands while floating', () => {
	test('every view hears a command, and the floating script receives it once', () => {
		const session = new FloatingSession()
		const delivered: { type: string; detail: unknown }[] = []
		session.attach({} as Parameters<FloatingSession['attach']>[0], () => {}, (type, detail) => delivered.push({ type, detail }))
		const main = { isFloating: false, floatingActive: session.active, canFloat: true }
		const event = new CustomEvent('teleprompter:next-section')
		const ranHere: string[] = []
		for (let view = 0; view < 3; view++) dispatchCommand(event, main, session, intent => ranHere.push(intent.kind))
		expect(ranHere).toEqual([])
		expect(delivered).toEqual([{ type: 'teleprompter:next-section', detail: null }])
	})

	test('ISC-138: a Jump to Section click in the main view also moves the floating script', () => {
		const app = readFileSync(join(import.meta.dir, '..', 'TeleprompterApp.svelte'), 'utf8')
		expect(app).toContain('onclick={() => jumpFromNavigation(header.id)}')
		const body = app.slice(app.indexOf('function jumpFromNavigation('), app.indexOf('function jumpToHeader('))
		expect(body).toContain("forwardToFloating('teleprompter:jump-to-header-by-id', { headerId, section: sectionOfHeader(headerId) })")
		expect(app.includes('h.text === customEvent.detail.text')).toBe(false)
		// The floating view receives the section reference intact and resolves it by line and title.
		const section = { line: 40, text: 'Situation', occurrence: 2 }
		expect(parseCommand('teleprompter:jump-to-header-by-id', { headerId: 'header-16', section }))
			.toEqual({ kind: 'jumpToSection', target: { headerId: 'header-16', section } })
		expect(commandHandlerSource(app, 'jump-to-header-by-id', { headerId: 'header-16', section })).toContain('const id = headerIdForSection(target)')
		expect(body).toContain('jumpToHeader(headerId)')
		// The header map must fill in a pop-out too: a main-window instanceof drops pop-out headings.
		const fill = app.slice(app.indexOf("contentArea.querySelectorAll<HTMLElement>('[data-header-id]')"), app.indexOf('headerElements = newHeaderElements'))
		expect(fill.length).toBeGreaterThan(0)
		expect(fill).not.toMatch(/\binstanceof HTMLElement/)
	})

	test('ISC-141/142: the main script glides with the floating reader in word space, never by jumpToHeader', () => {
		const app = readFileSync(join(import.meta.dir, '..', 'TeleprompterApp.svelte'), 'utf8')
		const slice = (from: string, to: string): string => {
			const start = app.indexOf(from)
			expect(start).toBeGreaterThan(-1)
			return app.slice(start, app.indexOf(to, start))
		}
		const section = slice('function followFloatingSection(', 'function reportFloatingPosition(')
		expect(section).not.toContain('contentArea.scrollTop =')

		// Floating side: every scroll event reports a fractional position, no throttle, no trailing timer.
		const scroll = slice('const handleScroll = () => {', 'if (scrollTimeout) clearTimeout(scrollTimeout)')
		expect(scroll).toContain('if (isFloating) reportFloatingPosition()')
		expect(app).not.toContain('lastPositionReport')
		expect(app).not.toContain('positionReportTimer')
		const report = slice('function reportFloatingPosition(', 'const MIRROR_SHARE')
		expect(report).toContain('positionAtY(layout.table, contentArea.scrollTop + readingOffset())')
		expect(report).toContain('plugin.floatingSession.reportPosition(makeAnchor(layout.values, word), position - word)')

		// Main side: a report only moves the target; frames on this view's own window move the script.
		const follow = slice('function followFloatingPosition(', 'function stepMirror(')
		expect(follow).toContain('if (isFloating || !contentArea) return')
		expect(follow).toContain('resolveAnchor(anchor, layout.values) + within')
		expect(follow).toContain('yAtPosition(layout.table, position) - readingOffset()')
		expect(follow).toContain('mirrorWindow = getActualWindow()')
		expect(follow).toContain('mirrorWindow.requestAnimationFrame(stepMirror)')
		expect(follow).not.toContain('contentArea.scrollTop =')
		const step = slice('function stepMirror(', 'function stopMirror(')
		expect(step).toContain('mirrorPosition += gap * followShare(MIRROR_SHARE, elapsed)')
		expect(step).toContain('contentArea.scrollTop = mirrorPosition')
		expect(step).not.toContain('mirrorPosition = contentArea.scrollTop')
		expect(step).toContain('scrollPercentage = ')
		for (const body of [follow, step]) {
			expect(body).not.toContain('jumpToHeader(')
			expect(body).not.toContain('isProgrammaticJump')
		}
		expect(app).toContain('plugin.floatingSession.onPosition(followFloatingPosition)')

		// Stops: session end, unmount, the reader's own wheel or swipe, and a Jump to Section click.
		expect(slice('const syncFloatingSession = () => {', 'syncFloatingSession()')).toContain('if (!plugin.floatingSession.active) stopMirror()')
		expect(slice('stopPositionFollow()', 'stateChannel.close()')).toContain('stopMirror()')
		expect(app).toContain("contentArea.addEventListener('wheel', holdMirror, { passive: true })")
		expect(app).toContain("contentArea.addEventListener('touchmove', holdMirror, { passive: true })")
		expect(slice('function holdMirror(', 'function jumpFromNavigation(')).toContain('mirrorHeldUntil = Date.now() + MIRROR_HOLD_MS')
		expect(slice('function jumpFromNavigation(', 'function jumpToHeader(')).toContain("forwardToFloating('teleprompter:jump-to-header-by-id'")
		expect(slice('function forwardToFloating(', 'function turnPage(')).toContain('stopMirror()')

		// The main view's own scroll never recomputes the section while it mirrors.
		const visible = slice('function updateCurrentVisibleHeader(', 'function resolveMarkdownViewForCurrentNote(')
		expect(visible).toContain('const mirroringFloating = !isFloating && plugin.floatingSession.active')
		expect(visible).toContain('if (!isProgrammaticJump && !mirroringFloating) {')

		// The cached line table is measured again after a render and whenever voice starts or stops.
		expect(app.split('passageEpoch++').length - 1).toBeGreaterThanOrEqual(4)
		expect(slice('await voiceTrackingService.start()', "debugLog('[Voice] Voice tracking start requested')")).toContain('passageEpoch++')
		expect(slice('calculateEyelinePixelPosition()\n          placeAfterRender', 'placeAfterRender = null').length).toBeGreaterThan(0)
	})
})

describe('floating view loads the same files as the main view (ISC-143)', () => {
	test('openFile (floating view and Stream Deck) reads through readScript, with no .md-only filter', () => {
		const open = functionBody('openFile')
		expect(open).toContain('readScript(file as TFile)')
		expect(open).not.toContain("extension === 'md'")
		expect(functionBody('beginFloating')).toContain('await openFile(request.notePath)')
	})

	test('the main view reads through the same readScript', () => {
		expect(functionBody('loadActiveNote')).toContain('readScript(activeFile)')
		const read = functionBody('readScript')
		expect(read).toContain("file.extension === 'pdf'")
		expect(read).toContain('removeYAMLFrontmatter')
	})
})

describe('read-aloud runs in the floating view while a script floats (ISC-144)', () => {
	test('every main-view read-aloud entry point sends itself to the floating view first', () => {
		expect(functionBody('toggleTTS')).toContain("sendTTSToFloating('teleprompter:tts-toggle')")
		expect(functionBody('ttsNextSentence')).toContain("sendTTSToFloating('teleprompter:tts-next-sentence')")
		expect(functionBody('ttsPrevSentence')).toContain("sendTTSToFloating('teleprompter:tts-prev-sentence')")
		expect(functionBody('startTTSFromSection')).toContain("sendTTSToFloating('teleprompter:tts-from-section', { headerId, section: sectionOfHeader(headerId) })")
		expect(functionBody('stopTTS')).toContain("plugin.floatingSession.forward('teleprompter:tts-stop')")
	})

	test('only the main view forwards, and the floating view resolves a section by its line and title', () => {
		const send = functionBody('sendTTSToFloating')
		expect(send).toContain('if (ownsTTS()) return false')
		// A forwarded stop would reset the floating reading before pause or next arrives
		expect(send).not.toContain('stopTTS()')
		expect(send).toContain('ttsService.getState().playbackState')
		const section = { line: 12, text: 'Situation', occurrence: 1 }
		expect(LISTENED_COMMAND_EVENTS).toContain('teleprompter:tts-from-section')
		expect(parseCommand('teleprompter:tts-from-section', { headerId: 'header-3', section }))
			.toEqual({ kind: 'readFromSection', target: { headerId: 'header-3', section } })
		expect(commandHandlerSource(app, 'tts-from-section', { headerId: 'header-3', section })).toContain('const id = headerIdForSection(target)')
	})

	test('ISC-148: the main view stays on the floating note and catches up when floating closes', () => {
		const load = functionBody('loadActiveNote')
		expect(load).toContain('plugin.floatingSession.notePath')
		expect(load.indexOf('floatingSession.notePath')).toBeLessThan(load.indexOf('resetSession()'))
		expect(functionBody('beginFloating')).toContain('plugin.floatingSession.setNote(request.notePath)')
		expect(app).toContain('if (wasFloating && !plugin.floatingSession.active && !isFloating) loadActiveNote()')
		expect(app).toContain('if (!wasFloating && plugin.floatingSession.active && !isFloating) loadActiveNote()')
		expect(app).toContain('plugin.floatingSession.renamed(oldPath, file.path)')
	})

	test('ISC-149: an edit pause comes back with the next words heard or the next sentence read', () => {
		const blur = functionBody('handleTeleprompterBlur')
		expect(blur).toContain("pausedForEdit = sessionState === 'running' && (voiceTrackingActive || ttsPlaybackState === 'playing')")
		expect(blur.indexOf('pausedForEdit =')).toBeLessThan(blur.indexOf('pauseSession()'))
		const resume = functionBody('resumeAfterEditPause')
		expect(resume).toContain('if (!pausedForEdit) return')
		expect(resume).toContain("if (sessionState === 'paused') startSession()")
		expect(app).toMatch(/onRecognizedText = \(text: string, isFinal: boolean\) => \{\s+lastRecognizedText = text\s+resumeAfterEditPause\(\)/)
		expect(app).toMatch(/onSentenceStartEvent\(\(\{ index \}\) => \{\s+ttsCurrentSentence = index\s+resumeAfterEditPause\(\)/)
		expect(app).toContain("if (state.playbackState !== 'playing') pausedForEdit = false")
		expect(functionBody('startSession')).toContain('pausedForEdit = false')
	})

	test('ISC-150: toolbar review: one Appearance panel, clock on the bar while it fits, English labels, no emoji', () => {
		expect(app).toContain("{#if group.zone === 'display' && !showsMobileInterface()}")
		expect(app).toContain('class="popup-panel tp-appearance-panel"')
		expect(app).toContain("if (except !== 'appearance' && !exceptInAppearance) showAppearance = false")
		expect(functionBody('fitReadout')).toContain('readoutInBar = false')
		expect(functionBody('fitReadout')).toContain('barWidth >= readoutReturnWidth')
		expect(app).toContain("&& (!readoutInBar || showsMobileInterface())}")
		expect(app).toContain("use:setIconAction={'alarm-clock-plus'}")
		for (const pt of ['atrasado', 'adiantado', 'Tempo alvo', 'Definir tempo', '>Fechar<', 'Voltar ao da nota']) expect(app).not.toContain(pt)
		expect(app).not.toContain('⏱')
		expect(app).toMatch(/\.controls \{[^}]*z-index: 250;/)
	})

	test('ISC-151: while a script floats, the main window keys and buttons drive the floating script', () => {
		const fwd = functionBody('forwardToFloating')
		expect(fwd).toContain('if (ownsScript(commandView())) return false')
		expect(fwd).toContain('plugin.floatingSession.forward(type, detail)')
		expect(functionBody('executeHotkeyAction')).toContain("if (SCRIPT_HOTKEY_ACTIONS.has(action) && forwardToFloating('teleprompter:hotkey-action', { action })) return true")
		for (const [fn, type] of [['togglePlay', 'toggle-play'], ['resetToTop', 'reset-to-top'], ['jumpToNextSection', 'next-section'], ['jumpToPreviousSection', 'previous-section']]) {
			expect(functionBody(fn)).toContain(`if (forwardToFloating('teleprompter:${type}')) return`)
		}
		expect(functionBody('handleProgressBarClick')).toContain("forwardToFloating('teleprompter:set-scroll-percentage'")
		expect(functionBody('handleMinimapClick')).toContain("forwardToFloating('teleprompter:set-scroll-percentage'")
		expect(functionBody('handleKeyPress')).toContain('jumpFromNavigation(headerList[index].id)')
		// The floating view runs a forwarded hotkey through its own executeHotkeyAction.
		expect(LISTENED_COMMAND_EVENTS).toContain('teleprompter:hotkey-action')
		expect(parseCommand('teleprompter:hotkey-action', { action: 'pageDown' })).toEqual({ kind: 'hotkeyAction', action: 'pageDown' })
		expect(commandHandlerSource(app, 'hotkey-action', { action: 'pageDown' })).toContain('executeHotkeyAction(action)')
		expect(SCRIPT_HOTKEY_ACTIONS.has('pageDown')).toBe(true)
		expect(app).toContain('const mirroring = !isFloating && floatingSessionActive')
		expect(app).toContain('if (isPlaying && contentArea && !mirroring) {')
	})

	test('ISC-152: read-aloud rate and voice from one window reach the speech in the other window', () => {
		expect(app).toContain('ttsService?.setRate(data.ttsRate)')
		expect(app).toContain('ttsService?.setVoice(data.ttsVoice)')
		expect(functionBody('setTTSVoice')).toContain('broadcastState({ ttsVoice: voiceId })')
		expect(functionBody('onTTSRateChange')).toContain('broadcastState({ ttsRate })')
	})

	test('ISC-154: small items: read-aloud state cleared on close, voices load, presets reach the floating voice, left popups', () => {
		expect(app).toContain('(ttsService?.getState().playbackState ?? "idle") === "idle") {')
		expect(functionBody('toggleTTSControls')).toContain('if (showTTSControls) void initTTS()')
		expect(functionBody('applyVoicePreset')).toContain("forwardToFloating('teleprompter:apply-voice-preset', { preset: presetName })")
		expect(LISTENED_COMMAND_EVENTS).toContain('teleprompter:apply-voice-preset')
		expect(parseCommand('teleprompter:apply-voice-preset', { preset: 'responsive' })).toEqual({ kind: 'applyVoicePreset', preset: 'responsive' })
		expect(commandHandlerSource(app, 'apply-voice-preset', { preset: 'responsive' })).toContain('applyVoicePreset(preset)')
		expect(app).toContain('.tp-zone[data-zone="playback"] :global(.popup-slider),')
	})

	test('ISC-155: only the floating view reports to the Stream Deck; a reload closes the floating window', () => {
		expect(functionBody('broadcastStateToWebSocket')).toContain('if (!isFloating && plugin.floatingSession.active) return')
		expect(app).toContain('if (wasFloating && !plugin.floatingSession.active && !isFloating) broadcastStateToWebSocket()')
		expect(app).toContain('() => (capturedLeaf ? capturedLeaf.detach() : closeOwnLeaf()),')
		expect(main).toContain('this.floatingSession.closeOnUnload()')
	})

	test('ISC-156: keyboard shortcut state is a bar button, nothing over the script', () => {
		expect(app).toContain('class="tp-keys-btn icon-btn"')
		expect(app).toContain('class:tp-keys-off={!isTeleprompterFocused}')
		expect(app).toContain('onclick={() => focusTeleprompter()}')
		expect(app).not.toContain('Click here to enable keyboard shortcuts')
		expect(app).not.toContain('<div class="shortcuts-active-badge">')
	})

	test('ISC-157: the prompter has no status bar of its own under the Obsidian one', () => {
		expect(app).not.toContain('<div class="status-bar">')
		expect(app).not.toMatch(/\n {2}\.status-bar \{/)
	})
})
