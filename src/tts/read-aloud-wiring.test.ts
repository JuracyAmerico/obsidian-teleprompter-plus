import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LISTENED_COMMAND_EVENTS, parseCommand } from '../commands'
import { commandHandlerSource } from '../test-support/command-handler-source'

/**
 * Source-text guards for the read-aloud wiring inside the Svelte component, which bun cannot
 * mount. The behaviour itself is tested on TTSService and ElevenLabsEngine directly.
 */
const root = join(import.meta.dir, '..')
const app = readFileSync(join(root, 'TeleprompterApp.svelte'), 'utf8')
const main = readFileSync(join(root, 'main.ts'), 'utf8')

function functionBody(name: string): string {
	const start = app.search(new RegExp(`(async )?function ${name}\\(`))
	expect(start).toBeGreaterThan(-1)
	const rest = app.slice(start + 1)
	const end = rest.search(/\n {2}(async )?function /)
	return rest.slice(0, end)
}

function handler(subscription: string): string {
	const start = app.indexOf(subscription)
	expect(start).toBeGreaterThan(-1)
	return app.slice(start, app.indexOf('\n    })', start))
}

describe('W1 #1: a read-aloud failure is seen in the main window and on the Elgato', () => {
	test('the service error goes to the reporter, which shares it and raises a Notice in the main window', () => {
		expect(handler('ttsService.onError(')).toContain('reportTTSError(message)')
		const report = functionBody('reportTTSError')
		expect(report).toContain('if (ownsTTS())')
		// Straight to the channel: broadcastState drops sends within 50 ms of a received update
		expect(report).toContain("stateChannel.postMessage({ type: 'state-update', data: { ttsError: message, ttsPlaybackState } })")
		expect(report).toContain('if (!isFloating) showTTSErrorNotice(message)')
		expect(functionBody('showTTSErrorNotice')).toContain('new Notice(')
	})

	test('the other view shows what it hears: a Notice only outside the floating view', () => {
		const received = app.slice(app.indexOf('if (data.ttsError !== undefined)'), app.indexOf('isReceivingBroadcast = false }, 50)'))
		expect(received).toContain('ttsError = data.ttsError')
		expect(received).toContain('} else if (!isFloating) {')
		expect(received).toContain('showTTSErrorNotice(data.ttsError)')
	})

	test('the badge shows the error, also with nothing reading', () => {
		expect(app).toContain("{#if ttsPlaybackState !== 'idle' || ttsError}")
		expect(app).toContain('<div class="tts-status-error">{ttsError}</div>')
	})

	test('reading again clears it everywhere', () => {
		expect(handler('ttsService.onSentenceStartEvent(')).toContain('clearTTSError()')
		expect(functionBody('clearTTSError')).toContain("data: { ttsError: '' }")
		expect(functionBody('toggleTTS')).toContain('clearTTSError()')
		expect(functionBody('stopTTS')).toContain('clearTTSError()')
	})

	test('a first sentence that failed does not start the rehearsal clock', () => {
		expect(functionBody('toggleTTS')).toContain("if (ttsService.getState().playbackState === 'playing') startSession()")
	})
})

describe('W1 #3: the read-aloud speed is saved', () => {
	test('a speed change writes settings, which every new service starts from', () => {
		expect(functionBody('onTTSRateChange')).toContain('rememberTTSRate(ttsRate)')
		expect(app).toContain('const rememberTTSRate = createRateMemory(settings, () => { void plugin?.saveSettings() })')
		expect(functionBody('initTTS')).toContain('rate: settings.ttsRate')
	})
})

describe('W1 #4: while a script floats, the main window only forwards read-aloud', () => {
	test('ownsTTS mirrors ownsVoice', () => {
		// Both are the one script-owner rule, tested as behaviour in commands.test.ts.
		expect(functionBody('ownsTTS')).toContain('return ownsScript(commandView())')
		expect(functionBody('ownsVoice')).toContain('return ownsScript(commandView())')
		expect(functionBody('commandView')).toContain('return { isFloating, floatingActive: plugin.floatingSession.active, canFloat: floatSupported }')
	})

	test('its own service neither shows nor shares state', () => {
		const state = handler('ttsService.onStateChange(')
		expect(state.indexOf('if (!ownsTTS()) return')).toBeGreaterThan(-1)
		expect(state.indexOf('if (!ownsTTS()) return')).toBeLessThan(state.indexOf('broadcastState('))
		const start = handler('ttsService.onSentenceStartEvent(')
		expect(start.indexOf('if (!ownsTTS()) return')).toBeLessThan(start.indexOf('highlightTTSSentence(index)'))
		expect(start.indexOf('if (!ownsTTS()) return')).toBeLessThan(start.indexOf('broadcastState('))
	})

	test('stop forwards and returns before touching shared state; a section jump leaves its service alone', () => {
		const stop = functionBody('stopTTS')
		const guard = stop.indexOf('if (!ownsTTS()) {')
		expect(guard).toBeGreaterThan(-1)
		expect(stop.indexOf("plugin.floatingSession.forward('teleprompter:tts-stop')")).toBeGreaterThan(guard)
		expect(stop.slice(guard, stop.indexOf('return', guard))).not.toMatch(/\n\s+ttsService\?\.stop\(\)/)
		expect(functionBody('jumpToHeader')).toContain("if (ownsTTS() && ttsService && ttsPlaybackState !== 'idle')")
	})
})

describe('W1 #6: repeat and loop the current sentence', () => {
	test('commands dispatch the events, the view listens and handles them', () => {
		expect(main).toContain("id: 'tts-repeat'")
		expect(main).toContain("new CustomEvent('teleprompter:tts-repeat')")
		expect(main).toContain("id: 'tts-loop-toggle'")
		expect(main).toContain("new CustomEvent('teleprompter:tts-loop-toggle')")
		expect(LISTENED_COMMAND_EVENTS).toContain('teleprompter:tts-repeat')
		expect(LISTENED_COMMAND_EVENTS).toContain('teleprompter:tts-loop-toggle')
		expect(parseCommand('teleprompter:tts-repeat', undefined)).toEqual({ kind: 'repeatTTSSentence' })
		expect(parseCommand('teleprompter:tts-loop-toggle', undefined)).toEqual({ kind: 'toggleTTSLoop' })
		expect(commandHandlerSource(app, 'tts-repeat')).toContain('void ttsRepeat()')
		expect(commandHandlerSource(app, 'tts-loop-toggle')).toContain('ttsToggleLoop()')
	})

	test('the panel buttons forward while a script floats, like the other read-aloud controls', () => {
		expect(functionBody('ttsRepeat')).toContain("sendTTSToFloating('teleprompter:tts-repeat')")
		expect(functionBody('ttsRepeat')).toContain('ttsService?.repeatCurrent()')
		expect(functionBody('ttsToggleLoop')).toContain("sendTTSToFloating('teleprompter:tts-loop-toggle')")
		expect(functionBody('ttsToggleLoop')).toContain('broadcastState({ ttsLoop })')
		expect(app).toContain('onclick={ttsRepeat}')
		expect(app).toContain('onclick={ttsToggleLoop}')
	})

	test('a loop survives an engine rebuild and reaches the other view', () => {
		expect(functionBody('initTTS')).toContain('ttsService.setLoop(ttsLoop)')
		expect(app).toContain('ttsService?.setLoop(data.ttsLoop)')
	})
})
