import { describe, expect, mock, test } from 'bun:test'
import {
	COMMAND_EVENTS,
	LISTENED_COMMAND_EVENTS,
	MAX_COUNTDOWN_SECONDS,
	SCRIPT_HOTKEY_ACTIONS,
	VOICE_PRESET_NAMES,
	commandScope,
	dispatchCommand,
	dormantReason,
	isCommandEvent,
	ownsScript,
	parseAppearancePatch,
	parseCommand,
	parseSectionTarget,
	routeCommand,
	runIntent,
	speakerNotesTitle,
	type CommandEvent,
	type CommandHandlers,
	type CommandSession,
	type CommandView,
	type Intent,
} from './commands'
import { FloatingSession } from './floating/floating-window'
import { obsidianStub } from './test-support/obsidian-stub'

void mock.module('obsidian', () => obsidianStub)
const { VOICE_TRACKING_PRESETS } = await import('./settings')

/** A desktop view with nothing floating. */
const MAIN: CommandView = { isFloating: false, floatingActive: false, canFloat: true }
/** The main view while a script floats in another window. */
const MAIN_WHILE_FLOATING: CommandView = { isFloating: false, floatingActive: true, canFloat: true }
/** The floating view itself. */
const FLOATING: CommandView = { isFloating: true, floatingActive: true, canFloat: true }
/** A phone or tablet: Obsidian mobile cannot open a floating window. */
const PHONE: CommandView = { isFloating: false, floatingActive: false, canFloat: false }

/** Every command event, the detail a sender gives it, and the intent it must become. */
const EXPECTED: Record<CommandEvent, { detail?: unknown; intent: Intent }> = {
	'teleprompter:toggle-play': { intent: { kind: 'togglePlay' } },
	'teleprompter:play': { intent: { kind: 'play' } },
	'teleprompter:pause': { intent: { kind: 'pause' } },
	'teleprompter:increase-speed': { intent: { kind: 'stepSpeed', direction: 1 } },
	'teleprompter:decrease-speed': { intent: { kind: 'stepSpeed', direction: -1 } },
	'teleprompter:set-speed': { detail: { speed: 0.5 }, intent: { kind: 'setSpeed', speed: 0.5 } },
	'teleprompter:cycle-speed-preset': { intent: { kind: 'cycleSpeedPreset' } },
	'teleprompter:next-speed-preset': { intent: { kind: 'stepSpeedPreset', direction: 1 } },
	'teleprompter:prev-speed-preset': { intent: { kind: 'stepSpeedPreset', direction: -1 } },
	'teleprompter:set-speed-preset': { detail: { speed: 1.5 }, intent: { kind: 'setSpeedPreset', speed: 1.5 } },
	'teleprompter:speed-preset-0.5': { intent: { kind: 'setSpeedPreset', speed: 0.5 } },
	'teleprompter:speed-preset-1': { intent: { kind: 'setSpeedPreset', speed: 1 } },
	'teleprompter:speed-preset-1.5': { intent: { kind: 'setSpeedPreset', speed: 1.5 } },
	'teleprompter:speed-preset-2': { intent: { kind: 'setSpeedPreset', speed: 2 } },
	'teleprompter:speed-preset-3': { intent: { kind: 'setSpeedPreset', speed: 3 } },
	'teleprompter:speed-preset-5': { intent: { kind: 'setSpeedPreset', speed: 5 } },
	'teleprompter:reset-to-top': { intent: { kind: 'resetToTop' } },
	'teleprompter:fit-speed-to-target': { intent: { kind: 'fitSpeedToTarget' } },
	'teleprompter:apply-voice-preset': { detail: { preset: 'rehearsal' }, intent: { kind: 'applyVoicePreset', preset: 'rehearsal' } },
	'teleprompter:hotkey-action': { detail: { action: 'pageDown' }, intent: { kind: 'hotkeyAction', action: 'pageDown' } },
	'teleprompter:scroll': { detail: { amount: -100 }, intent: { kind: 'scrollBy', amount: -100 } },
	'teleprompter:set-scroll-position': { detail: { position: 640 }, intent: { kind: 'setScrollPosition', position: 640 } },
	'teleprompter:set-scroll-percentage': { detail: { percentage: 25, seek: true }, intent: { kind: 'seekToFraction', fraction: 0.25 } },
	'teleprompter:jump-to-header': { detail: { index: 2 }, intent: { kind: 'jumpToHeaderIndex', index: 2 } },
	'teleprompter:jump-to-header-by-id': {
		detail: { headerId: 'header-3', section: { line: 12, text: 'Situation', occurrence: 1 } },
		intent: { kind: 'jumpToSection', target: { headerId: 'header-3', section: { line: 12, text: 'Situation', occurrence: 1 } } },
	},
	'teleprompter:toggle-navigation': { intent: { kind: 'toggleNavigation' } },
	'teleprompter:show-navigation': { intent: { kind: 'setNavigation', visible: true } },
	'teleprompter:hide-navigation': { intent: { kind: 'setNavigation', visible: false } },
	'teleprompter:next-section': { intent: { kind: 'stepSection', direction: 1 } },
	'teleprompter:previous-section': { intent: { kind: 'stepSection', direction: -1 } },
	'teleprompter:broadcast-state': { intent: { kind: 'broadcastState' } },
	'teleprompter:set-font-size': { detail: { fontSize: 32 }, intent: { kind: 'setFontSize', fontSize: 32 } },
	'teleprompter:apply-all-settings': {
		detail: { fontSize: 30, textColor: '#fff', paddingVertical: 0, enableBackgroundTransparency: false },
		intent: { kind: 'applyAppearance', patch: { fontSize: 30, textColor: '#fff', paddingVertical: 0, enableBackgroundTransparency: false } },
	},
	'teleprompter:font-size-up': { intent: { kind: 'stepFontSize', direction: 1 } },
	'teleprompter:font-size-down': { intent: { kind: 'stepFontSize', direction: -1 } },
	'teleprompter:toggle-eyeline': { intent: { kind: 'toggleEyeline' } },
	'teleprompter:show-eyeline': { intent: { kind: 'setEyeline', visible: true } },
	'teleprompter:hide-eyeline': { intent: { kind: 'setEyeline', visible: false } },
	'teleprompter:toggle-focus-mode': { intent: { kind: 'toggleFocusMode' } },
	'teleprompter:enable-focus-mode': { intent: { kind: 'setFocusMode', enabled: true } },
	'teleprompter:disable-focus-mode': { intent: { kind: 'setFocusMode', enabled: false } },
	'teleprompter:countdown-increase': { intent: { kind: 'stepCountdown', direction: 1 } },
	'teleprompter:countdown-decrease': { intent: { kind: 'stepCountdown', direction: -1 } },
	'teleprompter:set-countdown': { detail: { seconds: 5 }, intent: { kind: 'setCountdown', seconds: 5 } },
	'teleprompter:start-countdown': { intent: { kind: 'startCountdown' } },
	'teleprompter:toggle-pin': { intent: { kind: 'togglePin' } },
	'teleprompter:pin-note': { intent: { kind: 'setPinned', pinned: true } },
	'teleprompter:unpin-note': { intent: { kind: 'setPinned', pinned: false } },
	'teleprompter:refresh-pinned': { intent: { kind: 'refreshPinned' } },
	'teleprompter:toggle-keep-awake': { intent: { kind: 'toggleKeepAwake' } },
	'teleprompter:enable-keep-awake': { intent: { kind: 'setKeepAwake', enabled: true } },
	'teleprompter:disable-keep-awake': { intent: { kind: 'setKeepAwake', enabled: false } },
	'teleprompter:toggle-auto-pause': { intent: { kind: 'toggleAutoPause' } },
	'teleprompter:enable-auto-pause': { intent: { kind: 'setAutoPause', enabled: true } },
	'teleprompter:disable-auto-pause': { intent: { kind: 'setAutoPause', enabled: false } },
	'teleprompter:toggle-double-click-edit': { intent: { kind: 'toggleDoubleClickEdit' } },
	'teleprompter:enable-double-click-edit': { intent: { kind: 'setDoubleClickEdit', enabled: true } },
	'teleprompter:disable-double-click-edit': { intent: { kind: 'setDoubleClickEdit', enabled: false } },
	'teleprompter:toggle-fullscreen': { intent: { kind: 'toggleFullScreen' } },
	'teleprompter:enable-fullscreen': { intent: { kind: 'setFullScreen', enabled: true } },
	'teleprompter:disable-fullscreen': { intent: { kind: 'setFullScreen', enabled: false } },
	'teleprompter:line-height-increase': { intent: { kind: 'stepLineHeight', direction: 1 } },
	'teleprompter:line-height-decrease': { intent: { kind: 'stepLineHeight', direction: -1 } },
	'teleprompter:padding-vertical-increase': { intent: { kind: 'stepPaddingVertical', direction: 1 } },
	'teleprompter:padding-vertical-decrease': { intent: { kind: 'stepPaddingVertical', direction: -1 } },
	'teleprompter:padding-horizontal-increase': { intent: { kind: 'stepPaddingHorizontal', direction: 1 } },
	'teleprompter:padding-horizontal-decrease': { intent: { kind: 'stepPaddingHorizontal', direction: -1 } },
	'teleprompter:color-preset': { detail: { preset: 'high-contrast' }, intent: { kind: 'applyColorPreset', preset: 'high-contrast' } },
	'teleprompter:color-preset-dark': { intent: { kind: 'applyColorPreset', preset: 'dark' } },
	'teleprompter:color-preset-light': { intent: { kind: 'applyColorPreset', preset: 'light' } },
	'teleprompter:color-preset-black': { intent: { kind: 'applyColorPreset', preset: 'black' } },
	'teleprompter:color-preset-sepia': { intent: { kind: 'applyColorPreset', preset: 'sepia' } },
	'teleprompter:color-preset-green': { intent: { kind: 'applyColorPreset', preset: 'green-on-black' } },
	'teleprompter:color-preset-amber': { intent: { kind: 'applyColorPreset', preset: 'amber-on-black' } },
	'teleprompter:set-text-color': { detail: { color: '#33ff33' }, intent: { kind: 'setTextColor', color: '#33ff33' } },
	'teleprompter:set-background-color': { detail: { color: '#000000' }, intent: { kind: 'setBackgroundColor', color: '#000000' } },
	'teleprompter:font-preset': { detail: { preset: 'mono' }, intent: { kind: 'applyFontPreset', preset: 'mono' } },
	'teleprompter:font-preset-system': { intent: { kind: 'applyFontPreset', preset: 'system' } },
	'teleprompter:font-preset-sans': { intent: { kind: 'applyFontPreset', preset: 'sans' } },
	'teleprompter:font-preset-serif': { intent: { kind: 'applyFontPreset', preset: 'serif' } },
	'teleprompter:font-preset-mono': { intent: { kind: 'applyFontPreset', preset: 'mono' } },
	'teleprompter:font-preset-readable': { intent: { kind: 'applyFontPreset', preset: 'readable' } },
	'teleprompter:font-preset-slab': { intent: { kind: 'applyFontPreset', preset: 'slab' } },
	'teleprompter:set-font-family': { detail: { family: 'Georgia, serif' }, intent: { kind: 'setFontFamily', family: 'Georgia, serif' } },
	'teleprompter:toggle-flip-horizontal': { intent: { kind: 'toggleFlipHorizontal' } },
	'teleprompter:enable-flip-horizontal': { intent: { kind: 'setFlipHorizontal', enabled: true } },
	'teleprompter:disable-flip-horizontal': { intent: { kind: 'setFlipHorizontal', enabled: false } },
	'teleprompter:toggle-flip-vertical': { intent: { kind: 'toggleFlipVertical' } },
	'teleprompter:enable-flip-vertical': { intent: { kind: 'setFlipVertical', enabled: true } },
	'teleprompter:disable-flip-vertical': { intent: { kind: 'setFlipVertical', enabled: false } },
	'teleprompter:cycle-alignment': { intent: { kind: 'cycleAlignment' } },
	'teleprompter:align-left': { intent: { kind: 'setAlignment', alignment: 'left' } },
	'teleprompter:align-center': { intent: { kind: 'setAlignment', alignment: 'center' } },
	'teleprompter:align-right': { intent: { kind: 'setAlignment', alignment: 'right' } },
	'teleprompter:align-rtl': { intent: { kind: 'setAlignment', alignment: 'rtl' } },
	'teleprompter:toggle-scroll-sync': { intent: { kind: 'toggleScrollSync' } },
	'teleprompter:enable-scroll-sync': { intent: { kind: 'setScrollSync', enabled: true } },
	'teleprompter:disable-scroll-sync': { intent: { kind: 'setScrollSync', enabled: false } },
	'teleprompter:toggle-minimap': { intent: { kind: 'toggleMinimap' } },
	'teleprompter:show-minimap': { intent: { kind: 'setMinimap', visible: true } },
	'teleprompter:hide-minimap': { intent: { kind: 'setMinimap', visible: false } },
	'teleprompter:cycle-progress-indicator': { intent: { kind: 'cycleProgressIndicator' } },
	'teleprompter:progress-indicator-bar': { intent: { kind: 'setProgressIndicator', style: 'progress-bar' } },
	'teleprompter:progress-indicator-scrollbar': { intent: { kind: 'setProgressIndicator', style: 'scrollbar' } },
	'teleprompter:progress-indicator-none': { intent: { kind: 'setProgressIndicator', style: 'none' } },
	'teleprompter:letter-spacing-increase': { intent: { kind: 'stepLetterSpacing', direction: 1 } },
	'teleprompter:letter-spacing-decrease': { intent: { kind: 'stepLetterSpacing', direction: -1 } },
	'teleprompter:opacity-increase': { intent: { kind: 'stepOpacity', direction: 1 } },
	'teleprompter:opacity-decrease': { intent: { kind: 'stepOpacity', direction: -1 } },
	'teleprompter:toggle-view-mode': { intent: { kind: 'toggleViewMode' } },
	'teleprompter:set-view-mode-rendered': { intent: { kind: 'setViewMode', mode: 'rendered' } },
	'teleprompter:set-view-mode-plain': { intent: { kind: 'setViewMode', mode: 'plain' } },
	'teleprompter:toggle-floating': { intent: { kind: 'toggleFloating' } },
	'teleprompter:detach-window': { intent: { kind: 'toggleFloating' } },
	'teleprompter:open-file': { detail: { path: 'Scripts/Talk.md' }, intent: { kind: 'openFile', path: 'Scripts/Talk.md' } },
	'teleprompter:voice-start': { intent: { kind: 'setVoice', on: true } },
	'teleprompter:voice-stop': { intent: { kind: 'setVoice', on: false } },
	'teleprompter:voice-toggle': { intent: { kind: 'toggleVoice' } },
	'teleprompter:voice-resync': { intent: { kind: 'voiceResync' } },
	'teleprompter:get-voice-status': { intent: { kind: 'reportVoiceStatus' } },
	'teleprompter:tts-toggle': { intent: { kind: 'toggleTTS' } },
	'teleprompter:tts-stop': { intent: { kind: 'stopTTS' } },
	'teleprompter:tts-from-section': {
		detail: { headerId: 'header-1', section: { line: 4, text: 'Opening', occurrence: 0 } },
		intent: { kind: 'readFromSection', target: { headerId: 'header-1', section: { line: 4, text: 'Opening', occurrence: 0 } } },
	},
	'teleprompter:tts-next-sentence': { intent: { kind: 'stepTTSSentence', direction: 1 } },
	'teleprompter:tts-prev-sentence': { intent: { kind: 'stepTTSSentence', direction: -1 } },
	'teleprompter:tts-repeat': { intent: { kind: 'repeatTTSSentence' } },
	'teleprompter:tts-loop-toggle': { intent: { kind: 'toggleTTSLoop' } },
	'teleprompter:tts-speed-up': { intent: { kind: 'stepTTSRate', direction: 1 } },
	'teleprompter:tts-speed-down': { intent: { kind: 'stepTTSRate', direction: -1 } },
	'teleprompter:load-speaker-notes': {
		detail: { content: 'Say hello.', slide: 3, totalSlides: 12 },
		intent: { kind: 'loadSpeakerNotes', content: 'Say hello.', title: 'Slide 3/12' },
	},
	'teleprompter:toggleTTS': { intent: { kind: 'toggleTTS' } },
	'teleprompter:startTTS': { intent: { kind: 'startTTS' } },
	'teleprompter:stopTTS': { intent: { kind: 'stopTTS' } },
}

/** Details that must be dropped, per event that takes parameters. */
const MALFORMED: Partial<Record<CommandEvent, unknown[]>> = {
	'teleprompter:set-speed': [undefined, null, {}, { speed: 0 }, { speed: -1 }, { speed: 'fast' }, { speed: NaN }],
	'teleprompter:set-speed-preset': [undefined, {}, { speed: 0 }, { speed: '2' }, { speed: Infinity }],
	'teleprompter:apply-voice-preset': [undefined, {}, { preset: 'custom' }, { preset: 'toString' }, { preset: 2 }],
	'teleprompter:hotkey-action': [undefined, {}, { action: 7 }],
	'teleprompter:scroll': [undefined, {}, { amount: 0 }, { amount: 'down' }, { amount: NaN }],
	'teleprompter:set-scroll-position': [undefined, {}, { position: null }, { position: 'top' }, { position: Infinity }],
	'teleprompter:set-scroll-percentage': [undefined, {}, { percentage: 'half' }, { seek: true }, { seek: true, percentage: NaN }],
	'teleprompter:jump-to-header': [undefined, {}, { index: -1 }, { index: 1.5 }, { index: 'two' }],
	'teleprompter:jump-to-header-by-id': [undefined, null, {}, { headerId: '' }, { headerId: 3 }, { section: 'Opening' }],
	'teleprompter:set-font-size': [undefined, {}, { fontSize: 0 }, { fontSize: 'big' }],
	'teleprompter:apply-all-settings': [undefined, null, 'dark'],
	'teleprompter:set-countdown': [undefined, {}, { seconds: 'soon' }],
	'teleprompter:color-preset': [undefined, {}, { preset: '' }, { preset: 1 }],
	'teleprompter:set-text-color': [undefined, {}, { color: '' }],
	'teleprompter:set-background-color': [undefined, {}, { color: 0 }],
	'teleprompter:font-preset': [undefined, {}, { preset: '' }],
	'teleprompter:set-font-family': [undefined, {}, { family: null }],
	'teleprompter:open-file': [undefined, {}, { path: '' }, { path: 'data.json' }, { path: 'plugins/teleprompter-plus/data.json' }, { path: 'photo.png' }],
	'teleprompter:tts-from-section': [undefined, {}, { headerId: '' }],
	'teleprompter:load-speaker-notes': [undefined, {}, { content: '' }, { content: 42 }],
}

/** The events the view listened for before commands.ts, word for word from the old wsEvents list. */
/** Sent by main.ts (Stream Deck, URI handler) but never listened for until 0.12.14. */
const TURNED_ON_0_12_14 = [
	'teleprompter:letter-spacing-increase', 'teleprompter:letter-spacing-decrease',
	'teleprompter:opacity-increase', 'teleprompter:opacity-decrease',
	'teleprompter:toggle-view-mode', 'teleprompter:set-view-mode-rendered', 'teleprompter:set-view-mode-plain',
	'teleprompter:detach-window', 'teleprompter:open-file',
]

const LISTENED_BEFORE = [
	'toggle-play', 'play', 'pause', 'increase-speed', 'decrease-speed', 'set-speed', 'cycle-speed-preset',
	'next-speed-preset', 'prev-speed-preset', 'set-speed-preset', 'speed-preset-0.5', 'speed-preset-1',
	'speed-preset-1.5', 'speed-preset-2', 'speed-preset-3', 'speed-preset-5', 'reset-to-top', 'fit-speed-to-target',
	'scroll', 'hotkey-action', 'apply-voice-preset', 'set-scroll-position', 'set-scroll-percentage', 'jump-to-header',
	'jump-to-header-by-id', 'next-section', 'previous-section', 'toggle-navigation', 'show-navigation',
	'hide-navigation', 'broadcast-state', 'apply-all-settings', 'set-font-size', 'font-size-up', 'font-size-down',
	'toggle-eyeline', 'show-eyeline', 'hide-eyeline', 'toggle-focus-mode', 'enable-focus-mode', 'disable-focus-mode',
	'toggle-pin', 'toggle-floating', 'pin-note', 'unpin-note', 'refresh-pinned', 'toggle-keep-awake',
	'enable-keep-awake', 'disable-keep-awake', 'toggle-fullscreen', 'enable-fullscreen', 'disable-fullscreen',
	'line-height-increase', 'line-height-decrease', 'padding-vertical-increase', 'padding-vertical-decrease',
	'padding-horizontal-increase', 'padding-horizontal-decrease', 'color-preset', 'color-preset-dark',
	'color-preset-light', 'color-preset-black', 'color-preset-sepia', 'color-preset-green', 'color-preset-amber',
	'set-text-color', 'set-background-color', 'font-preset', 'font-preset-system', 'font-preset-sans',
	'font-preset-serif', 'font-preset-mono', 'font-preset-readable', 'font-preset-slab', 'set-font-family',
	'toggle-flip-horizontal', 'enable-flip-horizontal', 'disable-flip-horizontal', 'toggle-flip-vertical',
	'enable-flip-vertical', 'disable-flip-vertical', 'toggle-scroll-sync', 'enable-scroll-sync',
	'disable-scroll-sync', 'toggle-minimap', 'show-minimap', 'hide-minimap', 'cycle-progress-indicator',
	'progress-indicator-bar', 'progress-indicator-scrollbar', 'progress-indicator-none', 'toggle-auto-pause',
	'enable-auto-pause', 'disable-auto-pause', 'toggle-double-click-edit', 'enable-double-click-edit',
	'disable-double-click-edit', 'cycle-alignment', 'voice-start', 'voice-stop', 'voice-toggle', 'get-voice-status',
	'tts-toggle', 'tts-stop', 'tts-from-section', 'tts-next-sentence', 'tts-prev-sentence', 'tts-repeat',
	'tts-loop-toggle', 'tts-speed-up', 'tts-speed-down', 'countdown-increase', 'countdown-decrease', 'set-countdown',
	'start-countdown', 'load-speaker-notes', 'toggleTTS', 'startTTS', 'stopTTS',
].map(name => `teleprompter:${name}`)

/** A session that claims each event once, like FloatingSession, and records what it forwards. */
function fakeSession(): CommandSession & { forwarded: { type: string; detail: unknown }[] } {
	const claimed = new WeakSet<Event>()
	const forwarded: { type: string; detail: unknown }[] = []
	return {
		forwarded,
		claim: (event: Event) => {
			if (claimed.has(event)) return false
			claimed.add(event)
			return true
		},
		forward: (type: string, detail?: unknown) => { forwarded.push({ type, detail }) },
	}
}

function command(type: string, detail?: unknown): CustomEvent {
	return new CustomEvent(type, { detail })
}

function recordingHandlers(): { handlers: CommandHandlers; calls: Intent[] } {
	const calls: Intent[] = []
	const handlers = new Proxy({}, { get: () => (intent: Intent) => { calls.push(intent) } }) as CommandHandlers
	return { handlers, calls }
}

describe('the command table', () => {
	test('every event in the table is specified here, and nothing more', () => {
		expect<string[]>([...COMMAND_EVENTS].sort()).toEqual(Object.keys(EXPECTED).sort())
		expect(new Set(COMMAND_EVENTS).size).toBe(COMMAND_EVENTS.length)
	})

	for (const type of Object.keys(EXPECTED) as CommandEvent[]) {
		test(`${type} becomes its intent`, () => {
			const { detail, intent } = EXPECTED[type]
			expect(parseCommand(type, detail)).toEqual(intent)
		})
	}

	test('a fixed intent is a fresh object each time, so a handler cannot change the table', () => {
		const first = parseCommand('teleprompter:speed-preset-2', undefined) as { kind: 'setSpeedPreset'; speed: number }
		first.speed = 99
		expect(parseCommand('teleprompter:speed-preset-2', undefined)).toEqual({ kind: 'setSpeedPreset', speed: 2 })
	})

	test('every event that takes parameters rejects a malformed detail', () => {
		for (const [type, details] of Object.entries(MALFORMED) as [CommandEvent, unknown[]][]) {
			for (const detail of details) {
				expect({ type, detail, intent: parseCommand(type, detail) }).toEqual({ type, detail, intent: null })
			}
		}
	})

	test('unknown events are not commands', () => {
		for (const type of ['teleprompter:nope', 'toggle-play', 'teleprompter:', '', 'teleprompter:play ', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
			expect(isCommandEvent(type)).toBe(false)
			expect(parseCommand(type, {})).toBeNull()
		}
	})

	test('the view listens for exactly what it listened for before', () => {
		expect<string[]>([...LISTENED_COMMAND_EVENTS].sort()).toEqual([...new Set([...LISTENED_BEFORE, ...TURNED_ON_0_12_14])].sort())
	})

	test('dormant commands are the ones the view never listened for, each with its reason', () => {
		const dormant = COMMAND_EVENTS.filter(type => dormantReason(type) !== undefined)
		expect(dormant.sort()).toEqual([
			'teleprompter:align-center', 'teleprompter:align-left', 'teleprompter:align-right', 'teleprompter:align-rtl',
			'teleprompter:voice-resync',
		])
		for (const type of dormant) expect(dormantReason(type)?.length ?? 0).toBeGreaterThan(20)
	})

	test('voice preset names are the settings presets other than custom', () => {
		expect<string[]>([...VOICE_PRESET_NAMES].sort()).toEqual(Object.keys(VOICE_TRACKING_PRESETS).sort())
	})

	test('remote speeds: any positive speed, numeric strings from WebSocket clients', () => {
		expect(parseCommand('teleprompter:set-speed', { speed: '2.5' })).toEqual({ kind: 'setSpeed', speed: 2.5 })
		expect(parseCommand('teleprompter:set-speed', { speed: 50 })).toEqual({ kind: 'setSpeed', speed: 50 })
	})

	test('scroll percentages: a seek pauses, a follower only keeps up', () => {
		expect(parseCommand('teleprompter:set-scroll-percentage', { percentage: 40 })).toEqual({ kind: 'followScrollPercentage', percentage: 40 })
		expect(parseCommand('teleprompter:set-scroll-percentage', { percentage: '40', seek: true })).toEqual({ kind: 'followScrollPercentage', percentage: 40 })
		expect(parseCommand('teleprompter:set-scroll-percentage', { percentage: 40, seek: 'yes' })).toEqual({ kind: 'followScrollPercentage', percentage: 40 })
	})

	test('numbers a phone may send as text are read as numbers', () => {
		expect(parseCommand('teleprompter:scroll', { amount: '50' })).toEqual({ kind: 'scrollBy', amount: 50 })
		expect(parseCommand('teleprompter:jump-to-header', { index: '0' })).toEqual({ kind: 'jumpToHeaderIndex', index: 0 })
		expect(parseCommand('teleprompter:set-scroll-position', { position: '120' })).toEqual({ kind: 'setScrollPosition', position: 120 })
	})

	test('the countdown is held between 0 and 30 seconds', () => {
		expect(MAX_COUNTDOWN_SECONDS).toBe(30)
		expect(parseCommand('teleprompter:set-countdown', { seconds: 90 })).toEqual({ kind: 'setCountdown', seconds: 30 })
		expect(parseCommand('teleprompter:set-countdown', { seconds: -4 })).toEqual({ kind: 'setCountdown', seconds: 0 })
		expect(parseCommand('teleprompter:set-countdown', { seconds: '10' })).toEqual({ kind: 'setCountdown', seconds: 10 })
	})

	test('a section is named by its id, its line and title, or both', () => {
		expect(parseSectionTarget({ headerId: 'header-2' })).toEqual({ headerId: 'header-2' })
		expect(parseSectionTarget({ section: { line: 9 } })).toEqual({ section: { line: 9 } })
		expect(parseSectionTarget({ headerId: 'header-2', section: null })).toEqual({ headerId: 'header-2' })
		expect(parseSectionTarget({ text: 'Opening' })).toBeNull()
	})

	test('a settings preset applies only well-typed fields; a falsy size, color or family is left alone', () => {
		expect(parseAppearancePatch({})).toEqual({})
		expect(parseAppearancePatch({ fontSize: 0, textColor: '', fontFamily: '', lineHeight: 0, paddingHorizontal: 0, backgroundOpacity: 0 }))
			.toEqual({ paddingHorizontal: 0, backgroundOpacity: 0 })
		expect(parseAppearancePatch({ fontSize: '30', backgroundColor: 3, enableBackgroundTransparency: 'yes' })).toEqual({})
		expect(parseAppearancePatch({ backgroundColor: '#111', lineHeight: 1.6, backgroundOpacity: 80, enableBackgroundTransparency: true }))
			.toEqual({ backgroundColor: '#111', lineHeight: 1.6, backgroundOpacity: 80, enableBackgroundTransparency: true })
	})

	test('speaker notes are titled by slide when a slide is sent', () => {
		expect(speakerNotesTitle(undefined, 9)).toBe('Speaker Notes')
		expect(speakerNotesTitle(2, undefined)).toBe('Slide 2/?')
		expect(speakerNotesTitle(2, 9)).toBe('Slide 2/9')
		expect(parseCommand('teleprompter:load-speaker-notes', { content: 'Hi' })).toEqual({ kind: 'loadSpeakerNotes', content: 'Hi', title: 'Speaker Notes' })
	})
})

describe('the routing rule', () => {
	test('the script belongs to the floating view while one is open, otherwise to the view itself', () => {
		expect(ownsScript(MAIN)).toBe(true)
		expect(ownsScript(PHONE)).toBe(true)
		expect(ownsScript(FLOATING)).toBe(true)
		expect(ownsScript(MAIN_WHILE_FLOATING)).toBe(false)
	})

	test('only toggle-floating and its old alias detach-window are main-window-only', () => {
		const mainOnly = COMMAND_EVENTS.filter(type => commandScope(type) === 'main-window')
		expect(mainOnly).toEqual(['teleprompter:toggle-floating', 'teleprompter:detach-window'])
	})

	for (const type of COMMAND_EVENTS.filter(t => commandScope(t) === 'script')) {
		test(`${type}: runs here, or in the floating view while a script floats`, () => {
			expect(routeCommand(type, MAIN)).toBe('local')
			expect(routeCommand(type, PHONE)).toBe('local')
			expect(routeCommand(type, FLOATING)).toBe('local')
			expect(routeCommand(type, MAIN_WHILE_FLOATING)).toBe('forward')
		})
	}

	test('toggle-floating runs in the view that heard it, and nowhere on a phone', () => {
		expect(routeCommand('teleprompter:toggle-floating', MAIN)).toBe('local')
		expect(routeCommand('teleprompter:toggle-floating', MAIN_WHILE_FLOATING)).toBe('local')
		expect(routeCommand('teleprompter:toggle-floating', FLOATING)).toBe('local')
		expect(routeCommand('teleprompter:toggle-floating', PHONE)).toBe('ignore')
		// A float that some other path left open can still be closed from a view that cannot open one.
		expect(routeCommand('teleprompter:toggle-floating', { ...PHONE, floatingActive: true })).toBe('local')
	})

	test('script hotkeys go to the floating view; the rest stay in the view that pressed them', () => {
		expect([...SCRIPT_HOTKEY_ACTIONS].sort()).toEqual([
			'cycleSpeedPreset', 'nextSection', 'pageDown', 'pageUp', 'prevSection', 'resetToTop', 'scrollDown', 'scrollUp',
			'speedDown', 'speedUp', 'togglePlay', 'voiceResync',
		])
		for (const local of ['toggleEyeline', 'toggleNavigation', 'fontSizeUp', 'toggleFocusMode']) expect(SCRIPT_HOTKEY_ACTIONS.has(local)).toBe(false)
	})
})

describe('dispatching a command in a view', () => {
	test('a view with no floating script runs the intent itself, every view that hears it', () => {
		const session = fakeSession()
		const event = command('teleprompter:set-speed', { speed: 3 })
		const ran: Intent[] = []
		expect(dispatchCommand(event, MAIN, session, intent => ran.push(intent))).toEqual({ outcome: 'handled', intent: { kind: 'setSpeed', speed: 3 } })
		expect(dispatchCommand(event, MAIN, session, intent => ran.push(intent)).outcome).toBe('handled')
		expect(ran).toHaveLength(2)
		expect(session.forwarded).toEqual([])
	})

	test('while a script floats, the main view forwards the command as sent, once however many views hear it', () => {
		const session = fakeSession()
		const detail = { headerId: 'header-4', section: { line: 30, text: 'Close', occurrence: 0 } }
		const event = command('teleprompter:jump-to-header-by-id', detail)
		const ran: Intent[] = []
		expect(dispatchCommand(event, MAIN_WHILE_FLOATING, session, intent => ran.push(intent))).toEqual({ outcome: 'forwarded' })
		expect(dispatchCommand(event, MAIN_WHILE_FLOATING, session, intent => ran.push(intent))).toEqual({ outcome: 'ignored', reason: 'claimed' })
		expect(ran).toEqual([])
		expect(session.forwarded).toEqual([{ type: 'teleprompter:jump-to-header-by-id', detail }])
	})

	test('the floating view runs what it is forwarded', () => {
		const ran: Intent[] = []
		const result = dispatchCommand(command('teleprompter:tts-repeat'), FLOATING, fakeSession(), intent => ran.push(intent))
		expect(result).toEqual({ outcome: 'handled', intent: { kind: 'repeatTTSSentence' } })
		expect(ran).toEqual([{ kind: 'repeatTTSSentence' }])
	})

	test('a malformed command is dropped in every view and never forwarded', () => {
		for (const view of [MAIN, MAIN_WHILE_FLOATING, FLOATING, PHONE]) {
			const session = fakeSession()
			const ran: Intent[] = []
			expect(dispatchCommand(command('teleprompter:set-speed', { speed: 'fast' }), view, session, intent => ran.push(intent)))
				.toEqual({ outcome: 'ignored', reason: 'malformed' })
			expect(ran).toEqual([])
			expect(session.forwarded).toEqual([])
		}
	})

	test('an unknown or dormant event does nothing', () => {
		const session = fakeSession()
		const ran: Intent[] = []
		expect(dispatchCommand(command('teleprompter:nope'), MAIN, session, intent => ran.push(intent))).toEqual({ outcome: 'ignored', reason: 'unknown' })
		expect(dispatchCommand(command('teleprompter:align-left'), MAIN_WHILE_FLOATING, session, intent => ran.push(intent))).toEqual({ outcome: 'ignored', reason: 'dormant' })
		expect(ran).toEqual([])
		expect(session.forwarded).toEqual([])
	})

	test('toggle-floating is never forwarded, and only the first view to hear it acts', () => {
		const session = fakeSession()
		const event = command('teleprompter:toggle-floating')
		const ran: Intent[] = []
		expect(dispatchCommand(event, MAIN_WHILE_FLOATING, session, intent => ran.push(intent)).outcome).toBe('handled')
		expect(dispatchCommand(event, MAIN_WHILE_FLOATING, session, intent => ran.push(intent))).toEqual({ outcome: 'ignored', reason: 'claimed' })
		expect(ran).toEqual([{ kind: 'toggleFloating' }])
		expect(session.forwarded).toEqual([])
	})

	test('toggle-floating on a phone does nothing and claims nothing', () => {
		const session = fakeSession()
		const event = command('teleprompter:toggle-floating')
		expect(dispatchCommand(event, PHONE, session, () => {})).toEqual({ outcome: 'ignored', reason: 'not-here' })
		expect(session.claim(event)).toBe(true)
	})

	test('the real FloatingSession: two main views, one floating script, one delivery', () => {
		const session = new FloatingSession()
		const delivered: { type: string; detail: unknown }[] = []
		const controller = { isLocked: false, unlock: () => {} } as unknown as Parameters<FloatingSession['attach']>[0]
		session.attach(controller, () => {}, (type, detail) => delivered.push({ type, detail }))
		const view: CommandView = { isFloating: false, floatingActive: session.active, canFloat: true }
		const event = command('teleprompter:scroll', { amount: 100 })
		dispatchCommand(event, view, session, () => { throw new Error('the main view must not scroll its own copy') })
		dispatchCommand(event, view, session, () => { throw new Error('the main view must not scroll its own copy') })
		expect(delivered).toEqual([{ type: 'teleprompter:scroll', detail: { amount: 100 } }])
	})

	test('runIntent calls the handler named by the intent, with the intent', () => {
		const { handlers, calls } = recordingHandlers()
		const seen: string[] = []
		const named = new Proxy({}, { get: (_target, kind: string) => (intent: Intent) => { seen.push(kind); calls.push(intent) } }) as CommandHandlers
		runIntent(named, { kind: 'setFontSize', fontSize: 40 })
		runIntent(handlers, { kind: 'stepTTSRate', direction: -1 })
		expect(seen).toEqual(['setFontSize'])
		expect(calls).toEqual([{ kind: 'setFontSize', fontSize: 40 }, { kind: 'stepTTSRate', direction: -1 }])
	})
})
