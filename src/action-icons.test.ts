import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ACTION_ICONS, CONTROL_ICONS, actionIcon, type ActionIcon } from './action-icons'
import { CUSTOM_TO_LUCIDE, resolveControlIcon, resolveToggleIcon, toggleIcon } from './icon-vocabulary'

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
		const control = (CONTROL_ICONS as Record<string, ActionIcon>)[fromMap[1]]
		return control?.[fromMap[2] as 'lucide' | 'on'] ?? `unknown CONTROL_ICONS.${fromMap[1]}`
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

/** Toolbar buttons: the icon expression, the click handler and the `class:active` expression of every `use:setIconAction` button. */
function toolbarButtons(): Array<{ icon: string; handler: string; active: string | null }> {
	const out: Array<{ icon: string; handler: string; active: string | null }> = []
	const re = /use:setIconAction=\{([^}]*)\}/g
	let m: RegExpExecArray | null
	while ((m = re.exec(app))) {
		const start = app.lastIndexOf('<', m.index)
		const end = app.indexOf('>', m.index)
		const tag = app.slice(start, end + 1)
		const handler = /onclick=\{(\w+)\}/.exec(tag)?.[1] ?? ''
		out.push({ icon: m[1], handler, active: /class:active=\{([^}]*)\}/.exec(tag)?.[1] ?? null })
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

	test('every toggle has an "on" symbol that is a different picture from its "off" symbol', () => {
		for (const [key, icon] of Object.entries(CONTROL_ICONS as Record<string, ActionIcon>)) {
			if (!icon.on) continue
			expect(icon.on !== icon.lucide || icon.onSolid === true, `${key}: on is the off symbol, not drawn solid`).toBe(true)
		}
		for (const command of ['toggle-scroll-sync', 'toggle-flip-horizontal', 'toggle-flip-vertical', 'toggle-minimap', 'detach-window', 'toggle-navigation']) {
			expect(actionIcon(command)?.on, command).toBeDefined()
		}
	})

	test('every toolbar toggle that lights up shows the control\'s on symbol while it is lit', () => {
		// Buttons lit while their popover is open adjust a value; they are not on/off settings.
		const opensPopover = /Slider|Sliders|List|Picker|Menu|Settings|Appearance/
		const toggles = toolbarButtons().filter(b => b.active !== null && !opensPopover.test(b.handler) && b.handler !== 'toggleVoiceTracking')
		expect(toggles.map(b => b.handler).sort()).toEqual([
			'toggleAutoPauseOnEdit', 'toggleEyeline', 'toggleFlipHorizontal', 'toggleFlipVertical', 'toggleFloating',
			'toggleFocusMode', 'toggleFullScreen', 'toggleKeepAwake', 'toggleMinimap', 'toggleNavigation', 'togglePin',
		])
		for (const b of toggles) {
			const control: ActionIcon = CONTROL_ICONS[TOOLBAR_TWINS[b.handler]]
			expect(control.on, `${b.handler}: no on symbol`).toBeDefined()
			const m = /^toggleIcon\((.+), (.+)\)$/.exec(b.icon.trim())
			expect(m, `${b.handler} draws ${b.icon}, not toggleIcon(name, its lit state)`).not.toBeNull()
			expect(m?.[2], `${b.handler}: the icon follows a different state than the lit style`).toBe(b.active ?? undefined)
			const name = shownIcon(m?.[1] ?? '')
			expect(name, b.handler).toBe(control.lucide)
			// The name it passes resolves to the on symbol when lit.
			const base = /^'([^']+)'$/.exec(m?.[1] ?? '')?.[1] ?? control.lucide
			const lit = resolveToggleIcon(toggleIcon(base, true))
			expect(lit.name, b.handler).toBe(control.on ?? '')
			expect(lit.solid, b.handler).toBe(control.onSolid === true)
		}
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

describe('toggle icons (icon-vocabulary.ts)', () => {
	test('a name marked on resolves to the control\'s on symbol, solid where the map says so', () => {
		expect(resolveToggleIcon(toggleIcon('tp-pin', true))).toEqual({ name: 'pin', solid: true })
		expect(resolveToggleIcon(toggleIcon('tp-fullscreen', true))).toEqual({ name: 'minimize', solid: false })
		expect(resolveToggleIcon(toggleIcon('tp-pin', false))).toEqual({ name: 'pin', solid: false })
	})

	test('the custom icon style keeps its one picture per control, marked or not', () => {
		expect(resolveToggleIcon(toggleIcon('tp-pin', true), 'custom')).toEqual({ name: 'tp-pin', solid: false })
		expect(resolveControlIcon(toggleIcon('tp-eyeline', true), 'custom')).toBe('tp-eyeline')
	})

	test('a marked name with no on form shows its own symbol', () => {
		expect(resolveToggleIcon(toggleIcon('tp-refresh', true))).toEqual({ name: CONTROL_ICONS.refreshPinned.lucide, solid: false })
	})

	test('no two controls with an on form share an off symbol, so the lookup by symbol is exact', () => {
		const offs = Object.values(CONTROL_ICONS as Record<string, ActionIcon>).filter(i => i.on).map(i => i.lucide)
		expect(new Set(offs).size).toBe(offs.length)
	})
})
