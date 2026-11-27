import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ACTION_ICONS, CONTROL_ICONS } from './action-icons'
import { CUSTOM_TO_LUCIDE, resolveControlIcon } from './icon-vocabulary'

const root = path.resolve(import.meta.dir, '..')
const app = readFileSync(path.join(root, 'src/TeleprompterApp.svelte'), 'utf8')
const remote = readFileSync(path.join(root, 'src/remote-interface.ts'), 'utf8')
const settings = readFileSync(path.join(root, 'src/settings.ts'), 'utf8')

/**
 * The Lucide name an icon expression shows: a quoted name goes through the toolbar resolver,
 * `CONTROL_ICONS.x.lucide` (or `.on`) reads the map. For a conditional expression, the last name.
 */
function shownIcon(expression: string): string {
	const fromMap = [...expression.matchAll(/CONTROL_ICONS\.(\w+)\.(lucide|on)/g)].pop()
	if (fromMap) {
		const control = (CONTROL_ICONS as Record<string, Record<string, string>>)[fromMap[1]]
		return control?.[fromMap[2]] ?? `unknown CONTROL_ICONS.${fromMap[1]}`
	}
	const names = [...expression.matchAll(/'([^']+)'/g)].map(n => n[1])
	return resolveControlIcon(names[names.length - 1] ?? '')
}
const lucideDir = path.join(root, 'node_modules/lucide-static/icons')

/** The drawing inside a lucide-static icon, whitespace and self-closing slashes normalised. */
function lucideDrawing(name: string): string {
	const svg = readFileSync(path.join(lucideDir, `${name}.svg`), 'utf8')
	return normalise(/<svg[^>]*>([\s\S]*?)<\/svg>/.exec(svg)?.[1] ?? '')
}
const normalise = (s: string): string => s.replace(/\s+/g, ' ').replace(/\s*\/>/g, '/>').replace(/>\s+</g, '><').trim()

/** Toolbar buttons: the icon expression and the click handler of every `use:setIconAction` button. */
function toolbarButtons(): Array<{ icon: string; handler: string }> {
	const out: Array<{ icon: string; handler: string }> = []
	const re = /use:setIconAction=\{([^}]*)\}/g
	let m: RegExpExecArray | null
	while ((m = re.exec(app))) {
		const start = app.lastIndexOf('<', m.index)
		const end = app.indexOf('>', m.index)
		const tag = app.slice(start, end + 1)
		const handler = /onclick=\{(\w+)\}/.exec(tag)?.[1] ?? ''
		out.push({ icon: m[1], handler })
	}
	return out
}

/** The toolbar button that runs each action, by its click handler, and the control symbol it must show. */
const TOOLBAR_TWINS: Record<string, keyof typeof CONTROL_ICONS> = {
	resetToTop: 'resetToTop',
	toggleSpeedSlider: 'speed',
	toggleCountdownSlider: 'countdown',
	toggleFontSizeSlider: 'fontSize',
	toggleLineHeightSlider: 'lineHeight',
	toggleLetterSpacingSlider: 'letterSpacing',
	toggleOpacitySlider: 'opacity',
	togglePaddingSliders: 'padding',
	toggleFlipHorizontal: 'flipHorizontal',
	toggleFlipVertical: 'flipVertical',
	toggleMinimap: 'minimap',
	toggleFloating: 'float',
	detachWindow: 'openInWindow',
	toggleAutoPauseOnEdit: 'autoPause',
	refreshPinnedNote: 'refreshPinned',
	toggleFullScreen: 'fullscreen',
	toggleNavigation: 'navigationPanel',
	toggleEyeline: 'eyeline',
	toggleFocusMode: 'focusMode',
	togglePin: 'pin',
	toggleKeepAwake: 'keepAwake',
}

describe('one symbol per action', () => {
	test('every symbol, state and badge exists in lucide-static', () => {
		for (const [key, icon] of Object.entries(ACTION_ICONS)) {
			for (const name of [icon.lucide, 'on' in icon ? icon.on : undefined, 'badge' in icon ? icon.badge : undefined]) {
				if (name) expect(existsSync(path.join(lucideDir, `${name}.svg`)), `${key}: ${name}`).toBe(true)
			}
		}
	})

	test('each toolbar button with a twin shows the shared symbol', () => {
		const buttons = toolbarButtons()
		for (const [handler, control] of Object.entries(TOOLBAR_TWINS)) {
			const button = buttons.find(b => b.handler === handler)
			expect(button, `toolbar button with onclick={${handler}}`).toBeDefined()
			// The icon expression may switch on state (`isInPopoutWindow() ? 'x' : 'tp-detach'`); the action's own symbol is the last name.
			const shown = shownIcon(button?.icon ?? '')
			expect(shown, `${handler} shows ${shown}, the shared symbol is ${CONTROL_ICONS[control].lucide}`).toBe(CONTROL_ICONS[control].lucide)
		}
	})

	test('play/pause and voice show the shared symbols in both states', () => {
		expect(CUSTOM_TO_LUCIDE['tp-play']).toBe(CONTROL_ICONS.play.lucide)
		expect(CUSTOM_TO_LUCIDE['tp-pause']).toBe(CONTROL_ICONS.play.on)
		expect(app).toContain("isPlaying ? 'tp-pause' : isCountingDown ? 'x' : 'tp-play'")
		expect(app).toContain(`use:setIconAction={voiceTrackingActive ? '${CONTROL_ICONS.voice.on}' : '${CONTROL_ICONS.voice.lucide}'}`)
	})

	test('the settings screen (Toolbar preview, Primary controls) shows the shared symbol for each control', () => {
		// TOOLBAR_CONTROLS in settings.ts feeds both the Toolbar preview grid and the Primary controls list.
		const SETTINGS_TWINS: Record<string, keyof typeof CONTROL_ICONS | 'voiceOn'> = {
			'play-pause': 'play', speed: 'speed', countdown: 'countdown', reset: 'resetToTop', 'font-size': 'fontSize',
			'line-height': 'lineHeight', 'letter-spacing': 'letterSpacing', opacity: 'opacity', padding: 'padding',
			eyeline: 'eyeline', 'focus-mode': 'focusMode', navigation: 'navigationPanel', fullscreen: 'fullscreen',
			'flip-h': 'flipHorizontal', 'flip-v': 'flipVertical', minimap: 'minimap', 'auto-pause': 'autoPause',
			'progress-indicator': 'progressIndicator', alignment: 'alignment', 'keep-awake': 'keepAwake', pin: 'pin',
			detach: 'openInWindow', float: 'float', 'time-display': 'timeDisplay', 'voice-tracking': 'voiceOn',
		}
		const rows = new Map([...settings.matchAll(/\{ id: '([^']+)', name: '[^']+', icon: ([^,}]+)/g)].map(m => [m[1], m[2].trim()]))
		for (const [id, control] of Object.entries(SETTINGS_TWINS)) {
			expect(rows.has(id), `settings control ${id}`).toBe(true)
			const want = control === 'voiceOn' ? CONTROL_ICONS.voice.on : CONTROL_ICONS[control].lucide
			expect(shownIcon(rows.get(id) ?? ''), `settings control ${id}`).toBe(want)
		}
	})

	test('the settings feature cards show the shared symbol', () => {
		const CARDS: Record<string, keyof typeof CONTROL_ICONS> = {
			'Countdown timer': 'countdown', 'Speed control': 'speed', 'Eyeline indicator': 'eyeline', 'Focus mode': 'focusMode',
			Minimap: 'minimap', Fullscreen: 'fullscreen', 'Time display': 'timeDisplay',
		}
		const cards = new Map([...settings.matchAll(/name: '([^']+)',\s*\n\s*icon: ([^,\n]+),/g)].map(m => [m[1], m[2].trim()]))
		for (const [name, control] of Object.entries(CARDS)) {
			expect(cards.has(name), `feature card ${name}`).toBe(true)
			expect(shownIcon(cards.get(name) ?? ''), `feature card ${name}`).toBe(CONTROL_ICONS[control].lucide)
		}
	})

	test('the phone remote draws Reset and Countdown with the shared symbols', () => {
		const drawing = (id: string): string => {
			const at = remote.indexOf(`id="${id}"`)
			expect(at, id).toBeGreaterThan(0)
			const svg = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(remote.slice(at))
			return normalise(svg?.[1] ?? '')
		}
		expect(drawing('resetButton')).toBe(lucideDrawing(ACTION_ICONS['reset-to-top'].lucide))
		expect(drawing('countdownButton')).toBe(lucideDrawing(ACTION_ICONS['start-countdown'].lucide))
	})

	test('step keys share the symbol of the toolbar control they adjust', () => {
		expect(ACTION_ICONS['increase-speed'].lucide).toBe(CONTROL_ICONS.speed.lucide)
		expect(ACTION_ICONS['countdown-increase'].lucide).toBe(CONTROL_ICONS.countdown.lucide)
		expect(ACTION_ICONS['font-size-down'].lucide).toBe(CONTROL_ICONS.fontSize.lucide)
		expect(ACTION_ICONS['padding-horizontal-increase'].lucide).toBe(CONTROL_ICONS.padding.lucide)
	})
})
