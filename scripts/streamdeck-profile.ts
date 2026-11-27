/**
 * Teleprompter Plus on a Stream Deck XL: the key layout, the icon exports, the page previews,
 * the layout tables in docs/stream-deck-profile.md and the deck-plugin overlay, all from one place.
 *
 * The icon geometry lives in docs/icons/streamdeck/icons-data.js (the same file the contact sheet
 * reads). This script owns everything derived from it:
 *
 *   docs/icons/streamdeck/tp-<id>.svg            key master, 72-unit grid, background baked
 *   docs/icons/streamdeck/tp-<id>-on.svg         "on" state of a two-state key (lit ring + dot)
 *   docs/icons/streamdeck/png-72|png-144|png-288 key PNGs (Elgato: 72 px and 144 px @2x)
 *   docs/icons/streamdeck/action-list/           action-list icons: white on transparent,
 *                                                tp-<id>.svg + .png (20 px) + @2x.png (40 px)
 *   docs/icons/streamdeck/profile/*.png          previews of the two XL pages and the key states
 *   docs/stream-deck-profile.md                  the block between the layout markers
 *
 * Usage:
 *   bun scripts/streamdeck-profile.ts                       everything above
 *   bun scripts/streamdeck-profile.ts --check-manifest <deck plugin manifest.json>
 *   bun scripts/streamdeck-profile.ts --plugin-overlay <deck plugin source dir> [--profile <name>]
 *   bun scripts/streamdeck-profile.ts --personal-preview <dir outside the repo> [--prefix <p>] --chrome home=<png> ...
 *
 * --plugin-overlay writes the T+ key art into <dir>/imgs/themes/tplus/ and points the manifest's
 * action-list icons and state images at it. It refuses the installed copy under the Stream Deck
 * app's Plugins folder: the overlay goes to a source checkout, which is then built and installed.
 * --profile adds the manifest "Profiles" entry for an app-exported <dir>/<name>.streamDeckProfile
 * and refuses when that file is missing.
 *
 * Needs rsvg-convert on PATH (Homebrew librsvg). ImageMagick is not used: its SVG path drops
 * stroked paths on some installs.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { actionIcon, type ActionIcon } from '../src/action-icons'
import { parseParts, solidRoles } from '../src/solid-icon'

export const ROOT = path.resolve(import.meta.dir, '..')
export const ICON_DIR = path.join(ROOT, 'docs', 'icons', 'streamdeck')
export const ICONS_DATA = path.join(ICON_DIR, 'icons-data.js')
export const PROFILE_DOC = path.join(ROOT, 'docs', 'stream-deck-profile.md')
export const PREVIEW_DIR = path.join(ICON_DIR, 'profile')
export const LIST_DIR = path.join(ICON_DIR, 'action-list')

/** T+ brand accent, the remote UI's --accent. Marks a lit (on) key. */
export const BRAND = '#7c6cf6'
const ON_BG = '#221d42'
const ON_DOT = '#4ade80'
const KEY_BG = '#16161c'
export const KEY_SIZES = [72, 144, 288] as const
export const LIST_SIZES = { x1: 20, x2: 40 } as const
export const UUID_PREFIX = 'com.americo.teleprompter.'

// ---------------------------------------------------------------------------------------------
// Icon set
// ---------------------------------------------------------------------------------------------

export interface GlyphIcon { id: string; color: string; note: string; inner: string }
export interface TextIcon {
	id: string; color: string; note: string; bg: string; text: string
	font: string; fontSize: number; fontWeight: number; textY: number
}
export type IconDef = GlyphIcon | TextIcon
export interface IconSet { icons: Map<string, IconDef>; build: (icon: IconDef) => string }

function isTextIcon(icon: IconDef): icon is TextIcon {
	return 'text' in icon
}

export const LUCIDE_DIR = path.join(ROOT, 'node_modules', 'lucide-static', 'icons')

/**
 * Names whose drawing lucide-static (1.79) swapped against the Lucide that Obsidian bundles: in
 * Obsidian, flip-horizontal-2 is the mirror (vertical axis, triangles left and right); lucide-static
 * draws that under flip-vertical-2. The toolbar shows Obsidian's drawing, so the deck draws the
 * lucide-static file holding the same picture. scripts/streamdeck-profile.test.ts compares every
 * shared name with Obsidian's bundle when Obsidian is installed.
 */
export const OBSIDIAN_DRAWING: Readonly<Record<string, string>> = {
	'flip-horizontal-2': 'flip-vertical-2',
	'flip-vertical-2': 'flip-horizontal-2',
}

/** The drawing inside a lucide-static icon (24-unit grid, stroked with currentColor), as Obsidian shows that name. */
export function lucideInner(name: string): string {
	const file = path.join(LUCIDE_DIR, `${OBSIDIAN_DRAWING[name] ?? name}.svg`)
	if (!existsSync(file)) throw new Error(`lucide-static has no icon "${name}" (${file})`)
	const svg = readFileSync(file, 'utf8')
	const m = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(svg)
	const inner = m?.[1].trim().replace(/\s*\n\s*/g, '')
	if (!inner) throw new Error(`${file}: no drawing inside <svg>`)
	return inner
}

/** The family stroke on a key: 4.5 units of the 72-unit grid, whatever the scale. */
const KEY_STROKE = 4.5

/**
 * A Lucide drawing placed in a box of the 72 grid. The stroke is the family weight (4.5 units of
 * the key) plus `extraStroke`, whatever the scale; `attrs` go on the group.
 */
function placedLucide(name: string, x: number, y: number, size: number, attrs = '', extraStroke = 0): string {
	const scale = size / 24
	const width = (KEY_STROKE + extraStroke) / scale
	return `<g transform="translate(${x} ${y}) scale(${+scale.toFixed(4)})" stroke-width="${+width.toFixed(3)}"${attrs}>${lucideInner(name)}</g>`
}

/**
 * A key picture from the shared symbol map: the Lucide symbol in the family's grid, stroke and
 * colour. With a badge, the symbol moves left and down and the badge sits top-right on a knockout
 * of the key colour, the way the family's ± keys carry their arrow. Play and pause are filled, as
 * the family fills its transport glyphs.
 */
export function sharedSymbolInner(symbol: string, badge: string | undefined, filled: boolean, color: string): string {
	const fill = filled ? ` fill="${color}"` : ''
	if (!badge) return placedLucide(symbol, 11, 11, 50, fill)
	const knockout = placedLucide(badge, 46, 7, 22, ` stroke="${KEY_BG}" data-knockout="1"`, 5)
	return placedLucide(symbol, 5, 20, 40, fill) + knockout + placedLucide(badge, 46, 7, 22)
}

/**
 * The solid form of a Lucide drawing (src/solid-icon.ts, the rule the toolbar applies too): areas
 * filled with `color`, strokes inside them cut out in the key colour, marked as knockouts so the
 * lit state cuts them in its own tint.
 */
export function solidLucideInner(name: string, color: string): string {
	const parts = parseParts(lucideInner(name))
	const roles = solidRoles(parts)
	return parts.map((part, i) => {
		const attrs = Object.entries(part.attrs).map(([k, v]) => ` ${k}="${v}"`).join('')
		const role = roles[i] === 'fill' ? ` fill="${color}"` : roles[i] === 'cut' ? ` stroke="${KEY_BG}" data-knockout="1"` : ''
		return `<${part.tag}${attrs}${role}/>`
	}).join('')
}

/** A solid Lucide symbol placed like an unbadged shared symbol. */
function solidSymbolInner(symbol: string, color: string): string {
	const scale = 50 / 24
	return `<g transform="translate(11 11) scale(${+scale.toFixed(4)})" stroke-width="${+(KEY_STROKE / scale).toFixed(3)}">${solidLucideInner(symbol, color)}</g>`
}

const FILLED_SYMBOLS = new Set(['play', 'pause'])

/** A toggle's "on" symbol is green: the family's colour for start, connect and recording-on. */
export const ON_COLOR = ON_DOT

/** Adds the key pictures drawn from src/action-icons.ts, in the colour role of the family picture they replace. */
function addSharedSymbols(icons: Map<string, IconDef>): void {
	for (const a of ACTIONS) {
		if (!a.command || !a.icon.startsWith('tp-l-')) continue
		const shared: ActionIcon | undefined = actionIcon(a.command)
		const family = icons.get(a.familyIcon)
		if (!shared || !family) throw new Error(`${a.id}: no shared symbol or no family picture ${a.familyIcon}`)
		// Play/pause state 1 keeps the colour of the family's own state-1 picture (pause is red, play green).
		const family1 = icons.get(FAMILY_ACTIONS.find(f => f.id === a.id)?.icon1 ?? '') ?? family
		const add = (id: string, symbol: string, color: string, solid: boolean): void => {
			const filled = FILLED_SYMBOLS.has(symbol) && !shared.badge
			icons.set(id, {
				id, color,
				note: `Lucide "${symbol}"${solid ? ' drawn solid' : ''}${shared.badge ? ` with "${shared.badge}"` : ''}, from src/action-icons.ts (${a.command}).`,
				inner: solid ? solidSymbolInner(symbol, color) : sharedSymbolInner(symbol, shared.badge, filled, color),
			})
		}
		add(lucideIconId(a.command), shared.lucide, family.color, false)
		if (!shared.on) continue
		if (shared.badge) throw new Error(`${a.id}: a two-state symbol with a badge has no drawing rule`)
		add(lucideIconId(a.command, true), shared.on, a.state === 'playback' ? family1.color : ON_COLOR, shared.onSolid === true)
	}
}

/** Loads icons-data.js (a browser script) in a sandbox and checks the shape of what it defines. */
export function loadIconSet(file: string = ICONS_DATA): IconSet {
	const context: Record<string, unknown> = {}
	vm.runInNewContext(readFileSync(file, 'utf8'), context, { filename: file, timeout: 2000 })
	const groups = context.TP_GROUPS
	const build = context.TP_BUILD
	if (!Array.isArray(groups)) throw new Error(`${file}: TP_GROUPS is not an array`)
	if (typeof build !== 'function') throw new Error(`${file}: TP_BUILD is not a function`)
	const icons = new Map<string, IconDef>()
	for (const group of groups as Array<{ name?: unknown; icons?: unknown }>) {
		if (!Array.isArray(group.icons)) throw new Error(`${file}: group ${String(group.name)} has no icons array`)
		for (const raw of group.icons as Array<Record<string, unknown>>) {
			const id = raw.id
			if (typeof id !== 'string' || !id.startsWith('tp-')) throw new Error(`${file}: icon without a tp- id in ${String(group.name)}`)
			if (typeof raw.color !== 'string') throw new Error(`${file}: ${id} has no color`)
			if (typeof raw.inner !== 'string' && typeof raw.text !== 'string') throw new Error(`${file}: ${id} has neither inner nor text`)
			if (icons.has(id)) throw new Error(`${file}: duplicate icon id ${id}`)
			icons.set(id, raw as unknown as IconDef)
		}
	}
	addSharedSymbols(icons)
	return { icons, build: (icon) => String((build as (i: IconDef, o: object) => unknown)(icon, {})) }
}

/** The "on" picture of a two-state key: the same glyph on a brand tint, a brand ring, a green dot. */
export function onStateSvg(set: IconSet, icon: IconDef): string {
	const base = set.build(icon)
	const tinted = base.replace(`<rect width="72" height="72" fill="${KEY_BG}"/>`, `<rect width="72" height="72" fill="${ON_BG}"/>`)
	if (tinted === base) throw new Error(`${icon.id}: no baked ${KEY_BG} background to tint`)
	const knocked = tinted.split(`stroke="${KEY_BG}" data-knockout`).join(`stroke="${ON_BG}" data-knockout`)
	const lit = `<rect x="2.5" y="2.5" width="67" height="67" rx="11" fill="none" stroke="${BRAND}" stroke-width="3"/>`
		+ `<circle cx="60" cy="12" r="4.5" fill="${ON_DOT}"/>`
	return knocked.replace('</svg>', `${lit}</svg>`)
}

const PALETTE_HEX = /#(4ade80|f87171|a78bfa|60a5fa|cbd5e1|16161c)\b/gi

/**
 * Action-list icon: Elgato asks for a monochrome #FFFFFF glyph on a transparent background.
 * The stroke is thicker than on the key (5.5 against 4.5) so it survives 20 px.
 * Colour and font presets are choice tiles on the key; in the list they become a swatch and an "Aa".
 */
export function actionListSvg(icon: IconDef): string {
	const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72">'
	if (isTextIcon(icon)) {
		if (icon.id.startsWith('tp-theme-')) {
			return `${open}<g fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linejoin="round">`
				+ '<rect x="13" y="13" width="46" height="46" rx="9"/></g>'
				+ '<path d="M13 22 a9 9 0 0 1 9 -9 H59 L13 59 Z" fill="#FFFFFF"/></svg>'
		}
		return `${open}<text x="36" y="49" text-anchor="middle" font-family='${icon.font}' font-size="40" `
			+ `font-weight="${icon.fontWeight}" fill="#FFFFFF">${icon.text}</text></svg>`
	}
	// A knockout only separates a badge from the key colour; on a transparent list icon it would show as a white blot.
	const inner = icon.inner
		.replace(/<g [^>]*data-knockout="1"[^>]*>[\s\S]*?<\/g>/g, '')
		.replace(/<\w+ [^>]*data-knockout="1"[^>]*\/>/g, '')
		.replace(PALETTE_HEX, '#FFFFFF')
	return `${open}<g fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`
}

function rasterise(svgFile: string, pngFile: string, size: number): void {
	mkdirSync(path.dirname(pngFile), { recursive: true })
	execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', pngFile, svgFile], { timeout: 20_000 })
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(file: string): { width: number; height: number } {
	const head = readFileSync(file).subarray(0, 24)
	if (head.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`${file} is not a PNG`)
	return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}

// ---------------------------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------------------------

export type Group = 'transport' | 'sections' | 'navigation' | 'speed' | 'takes' | 'voice' | 'recording' | 'appearance' | 'windows' | 'deck'

export const GROUP_LABEL: Record<Group, string> = {
	transport: 'Transport',
	sections: 'Sections',
	navigation: 'Navigation',
	speed: 'Speed',
	takes: 'Takes and clock',
	voice: 'Voice',
	recording: 'Recording (OBS)',
	appearance: 'Appearance',
	windows: 'Windows and note',
	deck: 'Deck',
}

/** How the key's picture behaves. Each value is one sentence of the layout table. */
export const STATES = {
	press: 'One state; a press sends the command',
	playback: 'Two states: play while paused, pause while playing; follows playback',
	follows: 'Two states, lit when on; follows the teleprompter',
	flips: 'Two states, lit when on; flips on each press (the deck cannot read it back)',
	viewMode: 'Two states: rendered, then plain text (lit); flips on each press (the server does not report the view mode)',
	voice: 'Live picture: off, starting, listening or error, from the teleprompter',
	clock: 'Live: time left against the target (or elapsed) as its title, coloured by pace',
	theme: 'Deck only: switches the key art between T+, PAI Tron and Editorial',
	system: 'Stream Deck key, not a T+ action',
} as const
export type StateKind = keyof typeof STATES

export interface ActionKey {
	kind: 'action'
	/** UUID suffix after com.americo.teleprompter. */
	id: string
	/** Action name exactly as the deck plugin's manifest and docs/stream-deck-actions.md show it. */
	name: string
	/** Short label for previews. */
	label: string
	/** WebSocket command the key sends, or null for the deck-only Cycle Theme key. */
	command: string | null
	/** Action folder the deck plugin uses for its images (ACTION_FOLDER in src/plugin.ts). */
	folder: string
	group: Group
	state: StateKind
	icon: string
	/** Picture of state 1 when it is not the lit version of `icon`. */
	icon1?: string
	/** The family picture the key had before it took the shared Lucide symbol; its colour role stays. */
	familyIcon: string
}

export type SystemKeyId = 'home' | 'snagit' | 'snagit-scroll' | 'lights' | 'km' | 'page-next' | 'page-prev' | 'page-first'

/** A key that is not a T+ action: the principal's own keys and the app's page keys. */
export interface SystemKey {
	kind: 'system'
	id: SystemKeyId
	name: string
	label: string
	/** Picture from the T+ family; you set it on the key in the app, the action stays as it is. */
	icon: string
	/** Where the key comes from in the Stream Deck app. */
	source: string
}

/** A key left empty. */
export const EMPTY = '-'

export type Key = ActionKey | SystemKey

const A = (id: string, name: string, label: string, command: string | null, folder: string, group: Group, state: StateKind, icon: string, icon1?: string): ActionKey =>
	({ kind: 'action', id, name, label, command, folder, group, state, icon, familyIcon: icon, ...(icon1 ? { icon1 } : {}) })

const FAMILY_ACTIONS: readonly ActionKey[] = [
	A('playpause', 'Play/Pause', 'Play / Pause', 'toggle-play', 'playpause', 'transport', 'playback', 'tp-play', 'tp-pause'),
	A('reset', 'Reset to Top', 'Top', 'reset-to-top', 'reset', 'transport', 'press', 'tp-reset-to-top'),
	A('startcountdown', 'Start Countdown', 'Countdown', 'start-countdown', 'start-countdown', 'takes', 'press', 'tp-start-countdown'),
	A('countdownincrease', 'Countdown Increase', 'Countdown +', 'countdown-increase', 'countdown-up', 'takes', 'press', 'tp-countdown-increase'),
	A('countdowndecrease', 'Countdown Decrease', 'Countdown −', 'countdown-decrease', 'countdown-down', 'takes', 'press', 'tp-countdown-decrease'),
	A('clock', 'Clock', 'Clock', 'get-state', 'clock', 'takes', 'clock', 'tp-clock'),
	A('voicetoggle', 'Voice Tracking', 'Voice', 'voice-toggle', 'voice-toggle', 'voice', 'voice', 'tp-voice'),
	A('obsrecord', 'OBS Toggle Recording', 'Record', 'obs-toggle-recording', 'obs-record', 'recording', 'flips', 'tp-record-toggle', 'tp-record-start'),
	A('obsstream', 'OBS Toggle Streaming', 'Stream', 'obs-toggle-streaming', 'obs-stream', 'recording', 'flips', 'tp-stream-toggle', 'tp-stream-live'),
	A('previoussection', 'Previous Section', 'Prev section', 'previous-section', 'section-previous', 'sections', 'press', 'tp-previous-section'),
	A('nextsection', 'Next Section', 'Next section', 'next-section', 'section-next', 'sections', 'press', 'tp-next-section'),
	A('togglenavigation', 'Toggle Navigation', 'Sections', 'toggle-navigation', 'toggle-navigation', 'sections', 'follows', 'tp-toggle-nav-panel'),
	A('minimap', 'Minimap', 'Minimap', 'toggle-minimap', 'minimap', 'navigation', 'flips', 'tp-toggle-minimap'),
	A('scrollup', 'Scroll Up', 'Scroll up', 'scroll-up', 'scroll-up', 'navigation', 'press', 'tp-scroll-up'),
	A('scrolldown', 'Scroll Down', 'Scroll down', 'scroll-down', 'scroll-down', 'navigation', 'press', 'tp-scroll-down'),
	A('speedup', 'Speed Up', 'Faster', 'increase-speed', 'speed-up', 'speed', 'press', 'tp-faster'),
	A('speeddown', 'Speed Down', 'Slower', 'decrease-speed', 'speed-down', 'speed', 'press', 'tp-slower'),
	A('cyclespeedpreset', 'Cycle Speed Preset', 'Speed preset', 'cycle-speed-preset', 'speed-preset', 'speed', 'press', 'tp-cycle-speed-preset'),
	A('nextspeedpreset', 'Next Speed Preset', 'Preset ›', 'next-speed-preset', 'speed-preset-next', 'speed', 'press', 'tp-next-speed-preset'),
	A('prevspeedpreset', 'Previous Speed Preset', '‹ Preset', 'prev-speed-preset', 'speed-preset-prev', 'speed', 'press', 'tp-previous-speed-preset'),
	A('fontsizeup', 'Font Size Up', 'Text +', 'font-size-up', 'fontsize-up', 'appearance', 'press', 'tp-font-up'),
	A('fontsizedown', 'Font Size Down', 'Text −', 'font-size-down', 'fontsize-down', 'appearance', 'press', 'tp-font-down'),
	A('lineheightincrease', 'Line Height Increase', 'Lines +', 'line-height-increase', 'lineheight-up', 'appearance', 'press', 'tp-line-height-up'),
	A('lineheightdecrease', 'Line Height Decrease', 'Lines −', 'line-height-decrease', 'lineheight-down', 'appearance', 'press', 'tp-line-height-down'),
	A('letterspacingup', 'Letter Spacing Up', 'Letters +', 'letter-spacing-increase', 'letterspacing-up', 'appearance', 'press', 'tp-letter-spacing-up'),
	A('letterspacingdown', 'Letter Spacing Down', 'Letters −', 'letter-spacing-decrease', 'letterspacing-down', 'appearance', 'press', 'tp-letter-spacing-down'),
	A('paddingverticalincrease', 'Padding Vertical Increase', 'Pad ↕ +', 'padding-vertical-increase', 'padding-vertical-up', 'appearance', 'press', 'tp-padding-vertical-up'),
	A('paddingverticaldecrease', 'Padding Vertical Decrease', 'Pad ↕ −', 'padding-vertical-decrease', 'padding-vertical-down', 'appearance', 'press', 'tp-padding-vertical-down'),
	A('paddinghorizontalincrease', 'Padding Horizontal Increase', 'Pad ↔ +', 'padding-horizontal-increase', 'padding-horizontal-up', 'appearance', 'press', 'tp-padding-horizontal-up'),
	A('paddinghorizontaldecrease', 'Padding Horizontal Decrease', 'Pad ↔ −', 'padding-horizontal-decrease', 'padding-horizontal-down', 'appearance', 'press', 'tp-padding-horizontal-down'),
	A('opacityup', 'Opacity Up', 'Opacity +', 'opacity-increase', 'opacity-up', 'appearance', 'press', 'tp-opacity-up'),
	A('opacitydown', 'Opacity Down', 'Opacity −', 'opacity-decrease', 'opacity-down', 'appearance', 'press', 'tp-opacity-down'),
	A('color-dark', 'Color: Dark Mode', 'Dark', 'color-preset-dark', 'color-dark', 'appearance', 'press', 'tp-theme-dark'),
	A('color-light', 'Color: Light Mode', 'Light', 'color-preset-light', 'color-light', 'appearance', 'press', 'tp-theme-light'),
	A('color-black', 'Color: Pure Black', 'Black', 'color-preset-black', 'color-black', 'appearance', 'press', 'tp-theme-pure-black'),
	A('color-sepia', 'Color: Sepia', 'Sepia', 'color-preset-sepia', 'color-sepia', 'appearance', 'press', 'tp-theme-sepia'),
	A('color-green', 'Color: Green Terminal', 'Terminal', 'color-preset-green', 'color-green', 'appearance', 'press', 'tp-theme-green-terminal'),
	A('color-amber', 'Color: Amber Retro', 'Amber', 'color-preset-amber', 'color-amber', 'appearance', 'press', 'tp-theme-amber-retro'),
	A('font-system', 'Font: System Default', 'System', 'font-preset-system', 'font-system', 'appearance', 'press', 'tp-font-system'),
	A('font-sans', 'Font: Sans-serif', 'Sans', 'font-preset-sans', 'font-sans', 'appearance', 'press', 'tp-font-sans'),
	A('font-serif', 'Font: Serif', 'Serif', 'font-preset-serif', 'font-serif', 'appearance', 'press', 'tp-font-serif'),
	A('font-mono', 'Font: Monospace', 'Mono', 'font-preset-mono', 'font-mono', 'appearance', 'press', 'tp-font-mono'),
	A('font-readable', 'Font: Readable', 'Readable', 'font-preset-readable', 'font-readable', 'appearance', 'press', 'tp-font-readable'),
	A('font-slab', 'Font: Slab Serif', 'Slab', 'font-preset-slab', 'font-slab', 'appearance', 'press', 'tp-font-slab'),
	A('toggleeyeline', 'Toggle Eyeline', 'Eyeline', 'toggle-eyeline', 'eyeline', 'appearance', 'follows', 'tp-toggle-eyeline'),
	A('togglefocusmode', 'Toggle Focus Mode', 'Focus', 'toggle-focus-mode', 'focus-mode', 'appearance', 'follows', 'tp-toggle-focus-mode'),
	A('toggleviewmode', 'Toggle View Mode', 'View mode', 'toggle-view-mode', 'view-mode', 'appearance', 'viewMode', 'tp-toggle-view-mode', 'tp-toggle-view-mode-plain'),
	A('cyclealignment', 'Cycle Text Alignment', 'Align', 'cycle-alignment', 'cycle-alignment', 'appearance', 'press', 'tp-cycle-text-alignment'),
	A('cycleprogressindicator', 'Cycle Progress Indicator', 'Progress', 'cycle-progress-indicator', 'cycle-progress', 'appearance', 'press', 'tp-cycle-progress-indicator'),
	A('flip-horizontal', 'Flip: Horizontal (Mirror)', 'Mirror', 'toggle-flip-horizontal', 'flip-horizontal', 'appearance', 'flips', 'tp-flip-horizontal'),
	A('flip-vertical', 'Flip: Vertical (Upside Down)', 'Upside down', 'toggle-flip-vertical', 'flip-vertical', 'appearance', 'flips', 'tp-flip-vertical'),
	A('togglefullscreen', 'Toggle Full-Screen', 'Full screen', 'toggle-fullscreen', 'fullscreen', 'windows', 'follows', 'tp-toggle-fullscreen'),
	A('togglekeepawake', 'Toggle Keep Awake', 'Keep awake', 'toggle-keep-awake', 'keepawake', 'windows', 'follows', 'tp-toggle-keep-awake'),
	A('detachwindow', 'Detach Window', 'Float', 'detach-window', 'detach', 'windows', 'flips', 'tp-detach-window'),
	A('openactivefile', 'Open Active File', 'Open note', 'open-active-file', 'open-file', 'windows', 'press', 'tp-open-active-file'),
	A('togglepin', 'Toggle Pin Note', 'Pin note', 'toggle-pin', 'pin', 'windows', 'follows', 'tp-toggle-pin-window'),
	A('refreshpinned', 'Refresh Pinned Note', 'Refresh', 'refresh-pinned', 'refresh-pinned', 'windows', 'press', 'tp-refresh-pinned'),
	A('scroll-sync', 'Scroll Sync', 'Scroll sync', 'toggle-scroll-sync', 'scroll-sync', 'windows', 'flips', 'tp-toggle-scroll-sync'),
	A('toggleautopause', 'Toggle Auto-Pause', 'Auto-pause', 'toggle-auto-pause', 'auto-pause', 'transport', 'follows', 'tp-toggle-auto-pause'),
	A('cycletheme', 'Cycle Theme', 'Key theme', null, 'theme', 'deck', 'theme', 'tp-cycle-theme'),
]

/** Picture id of an action drawn from the shared symbol map (src/action-icons.ts). */
export const lucideIconId = (command: string, on = false): string => `tp-l-${command}${on ? '-on' : ''}`

/**
 * The deck's actions. A key whose action has a toolbar or remote twin takes the shared symbol from
 * src/action-icons.ts, drawn in the family style; a key without a twin keeps its family picture.
 * A toggle's second picture is the map's `on` symbol (green, solid where the map says so).
 */
export const ACTIONS: readonly ActionKey[] = FAMILY_ACTIONS.map((a) => {
	const shared = a.command ? actionIcon(a.command) : undefined
	if (!a.command || !shared) return a
	return { ...a, icon: lucideIconId(a.command), icon1: shared.on ? lucideIconId(a.command, true) : undefined }
})

export const SYSTEM_KEYS: Record<SystemKeyId, SystemKey> = {
	home: { kind: 'system', id: 'home', name: 'Home (your key)', label: 'Home', icon: 'tp-home', source: 'Your key 1: Switch Profile to Stage; picture tp-home' },
	snagit: { kind: 'system', id: 'snagit', name: 'Snagit (your key)', label: 'Snagit', icon: 'tp-capture', source: 'Copied from Stage R4 C1: Hotkey ⌃⇧C (Snagit); picture tp-capture' },
	'snagit-scroll': { kind: 'system', id: 'snagit-scroll', name: 'Snagit Scrolling (your key)', label: 'Scrolling', icon: 'tp-capture-scroll', source: 'Hotkey ⌃⌥⇧S: the shortcut you give your Scrolling Capture preset; picture tp-capture-scroll' },
	lights: { kind: 'system', id: 'lights', name: 'Lights (your key)', label: 'Lights', icon: 'tp-light', source: 'Copied from Stage R4 C2: Open light-toggle.sh; picture tp-light' },
	km: { kind: 'system', id: 'km', name: '⌘ Keyboard Maestro (your key)', label: '⌘ KM', icon: 'tp-command', source: 'Copied from Stage R4 C3: Switch Profile to KeyboardMaestro; picture tp-command' },
	'page-next': { kind: 'system', id: 'page-next', name: 'Next Page', label: 'Next page ›', icon: 'tp-page-next', source: 'Navigation: Next Page (the app places it); picture tp-page-next' },
	'page-prev': { kind: 'system', id: 'page-prev', name: 'Previous Page', label: '‹ Previous page', icon: 'tp-page-prev', source: 'Navigation: Previous Page (the app places it); picture tp-page-prev' },
	'page-first': { kind: 'system', id: 'page-first', name: 'Go To Page 1', label: '« Page 1', icon: 'tp-page-first', source: 'Navigation: Go To Page, page 1; picture tp-page-first' },
}

export const ROWS = 4
export const COLS = 8

/**
 * The keys that sit in the same place on every page, as on the principal's Stage profile:
 * Home at R1 C1; Snagit, Snagit Scrolling, Lights and ⌘ at R4 C1 to C4 (approved 2026-11-27); the page key at R4 C8 (next page, or back to
 * page 1 on the last page); previous page at R4 C7 on every page after the first.
 */
export const CHROME: ReadonlyArray<{ row: number; col: number; id: (page: number, pages: number) => SystemKeyId | null }> = [
	{ row: 0, col: 0, id: () => 'home' },
	{ row: 3, col: 0, id: () => 'snagit' },
	{ row: 3, col: 1, id: () => 'snagit-scroll' },
	{ row: 3, col: 2, id: () => 'lights' },
	{ row: 3, col: 3, id: () => 'km' },
	{ row: 3, col: 6, id: (page) => (page > 1 ? 'page-prev' : null) },
	{ row: 3, col: 7, id: (page, pages) => (page < pages ? 'page-next' : 'page-first') },
]

export interface Page { number: 1 | 2 | 3; title: string; purpose: string; grid: readonly (readonly string[])[] }

/**
 * Key ids, row by row, as the XL shows them (row 1 at the top, column 1 on the left); `-` is an
 * empty key. Page 1 is what you press while you rehearse and record, page 2 is set-up, page 3 the
 * colour themes and fonts, the least used. Pairs that go up and down sit in one column, up above
 * down. CHROME fixes the keys every page shares.
 */
export const PAGES: readonly Page[] = [
	{
		number: 1,
		title: 'Live',
		purpose: 'Rehearse and record: transport, sections, scrolling, speed, text size, countdown, clock, voice, OBS, window',
		grid: [
			['home', 'playpause', 'startcountdown', 'reset', 'previoussection', 'scrollup', 'speedup', 'fontsizeup'],
			['voicetoggle', 'clock', 'countdownincrease', 'togglenavigation', 'nextsection', 'scrolldown', 'speeddown', 'fontsizedown'],
			['obsrecord', 'obsstream', 'countdowndecrease', 'detachwindow', 'prevspeedpreset', 'cyclespeedpreset', 'nextspeedpreset', 'togglekeepawake'],
			['snagit', 'snagit-scroll', 'lights', 'km', 'openactivefile', 'togglepin', 'togglefullscreen', 'page-next'],
		],
	},
	{
		number: 2,
		title: 'Set-up',
		purpose: 'Look and behaviour of the script: spacing, opacity, view, mirror, alignment, eyeline, focus, sync, minimap, progress, auto-pause',
		grid: [
			['home', 'lineheightincrease', 'letterspacingup', 'paddingverticalincrease', 'paddinghorizontalincrease', 'opacityup', 'toggleviewmode', EMPTY],
			['cyclealignment', 'lineheightdecrease', 'letterspacingdown', 'paddingverticaldecrease', 'paddinghorizontaldecrease', 'opacitydown', 'flip-horizontal', 'flip-vertical'],
			['toggleeyeline', 'togglefocusmode', 'scroll-sync', 'refreshpinned', 'minimap', EMPTY, 'cycleprogressindicator', 'toggleautopause'],
			['snagit', 'snagit-scroll', 'lights', 'km', EMPTY, EMPTY, 'page-prev', 'page-next'],
		],
	},
	{
		number: 3,
		title: 'Themes',
		purpose: 'Colour themes and fonts of the script, and the key art theme',
		grid: [
			['home', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, 'cycletheme'],
			['color-dark', 'color-light', 'color-black', 'color-sepia', 'color-green', 'color-amber', EMPTY, EMPTY],
			['font-system', 'font-sans', 'font-serif', 'font-mono', 'font-readable', 'font-slab', EMPTY, EMPTY],
			['snagit', 'snagit-scroll', 'lights', 'km', EMPTY, EMPTY, 'page-prev', 'page-first'],
		],
	},
]

const ACTION_BY_ID = new Map(ACTIONS.map(a => [a.id, a]))

export function keyFor(id: string): Key {
	const action = ACTION_BY_ID.get(id)
	if (action) return action
	if (Object.hasOwn(SYSTEM_KEYS, id)) return SYSTEM_KEYS[id as SystemKeyId]
	throw new Error(`layout names an unknown key: ${id}`)
}

/** The keys of a page that are not empty, with their position. */
export function placedKeys(page: Page): Array<{ row: number; col: number; id: string; key: Key }> {
	const out: Array<{ row: number; col: number; id: string; key: Key }> = []
	page.grid.forEach((row, r) => row.forEach((id, c) => { if (id !== EMPTY) out.push({ row: r, col: c, id, key: keyFor(id) }) }))
	return out
}

/** Picture of state 0 and, for two-state keys, state 1 (an icon id, or `<id>@on` for its lit version). */
export function stateIcons(key: Key): string[] {
	if (key.kind === 'system') return [key.icon]
	if (key.state === 'playback') return [key.icon, key.icon1 ?? key.icon]
	if (key.state === 'follows' || key.state === 'flips' || key.state === 'viewMode') return [key.icon, `${key.icon1 ?? key.icon}@on`]
	return [key.icon]
}

/**
 * Off and on pictures of every toggle: the two states of a two-state key, and for the Voice key,
 * whose live pictures the plugin paints, its resting symbol and the map's `on` symbol.
 */
export function togglePictures(key: ActionKey): [string, string] | null {
	if (key.state === 'voice') {
		if (!key.icon1) throw new Error(`${key.id}: a toggle without an on symbol in src/action-icons.ts`)
		return [key.icon, key.icon1]
	}
	const states = stateIcons(key)
	return states.length === 2 ? [states[0], states[1]] : null
}

/** Every key picture the layout uses, base icons and lit versions, and the Voice key's on symbol. */
export function pictures(): string[] {
	const out = new Set<string>()
	for (const page of PAGES) {
		for (const { key } of placedKeys(page)) {
			for (const p of stateIcons(key)) out.add(p)
			if (key.kind === 'action') for (const p of togglePictures(key) ?? []) out.add(p)
		}
	}
	return [...out]
}

const fileId = (picture: string): string => picture.replace('@on', '-on')

// ---------------------------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------------------------

/**
 * SVG markup reduced to what renders: the first masters were serialised by a browser
 * (`<rect ...></rect>`, double quotes), this script writes `<rect .../>`.
 */
export function canonicalSvg(svg: string): string {
	return svg.trim().replace(/<(\w+)([^<>]*?)\s*\/>/g, '<$1$2></$1>').replace(/&#34;|&quot;/g, '"').replace(/'/g, '"')
}

/** Writes a master only when it renders differently from the one on disk, so unchanged icons keep their bytes. */
function writeMaster(file: string, svg: string): void {
	if (existsSync(file) && canonicalSvg(readFileSync(file, 'utf8')) === canonicalSvg(svg)) return
	writeFileSync(file, `${svg}\n`)
}

/** Writes every key master SVG (and lit versions), the key PNGs and the action-list icons. */
export function exportIcons(set: IconSet): { keys: number; lit: number; list: number } {
	for (const icon of set.icons.values()) {
		const svgFile = path.join(ICON_DIR, `${icon.id}.svg`)
		writeMaster(svgFile, set.build(icon))
		for (const size of KEY_SIZES) rasterise(svgFile, path.join(ICON_DIR, `png-${size}`, `${icon.id}.png`), size)
	}
	const litIds = pictures().filter(p => p.endsWith('@on')).map(p => p.slice(0, -3))
	for (const id of litIds) {
		const icon = set.icons.get(id)
		if (!icon) throw new Error(`lit picture for unknown icon ${id}`)
		const svgFile = path.join(ICON_DIR, `${id}-on.svg`)
		writeFileSync(svgFile, `${onStateSvg(set, icon)}\n`)
		for (const size of KEY_SIZES) rasterise(svgFile, path.join(ICON_DIR, `png-${size}`, `${id}-on.png`), size)
	}
	mkdirSync(LIST_DIR, { recursive: true })
	for (const icon of set.icons.values()) {
		const svgFile = path.join(LIST_DIR, `${icon.id}.svg`)
		writeFileSync(svgFile, `${actionListSvg(icon)}\n`)
		rasterise(svgFile, path.join(LIST_DIR, `${icon.id}.png`), LIST_SIZES.x1)
		rasterise(svgFile, path.join(LIST_DIR, `${icon.id}@2x.png`), LIST_SIZES.x2)
	}
	return { keys: set.icons.size, lit: litIds.length, list: set.icons.size }
}

const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One key picture as an SVG fragment placed at (x, y), size s, with the XL's rounded key corners. */
function placed(set: IconSet, picture: string, x: number, y: number, s: number, clip: string): string {
	const id = picture.endsWith('@on') ? picture.slice(0, -3) : picture
	const icon = set.icons.get(id)
	if (!icon) throw new Error(`no icon ${id}`)
	const svg = picture.endsWith('@on') ? onStateSvg(set, icon) : set.build(icon)
	const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
	return `<g clip-path="url(#${clip})"><svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 72 72">${inner}</svg></g>`
}

const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif'

/** Your own key pictures for a personal preview: system key id to a PNG file. */
export type ChromeImages = ReadonlyMap<string, string>

function embeddedPng(file: string, x: number, y: number, s: number, clip: string): string {
	const data = readFileSync(file)
	if (data.toString('latin1', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`)
	return `<g clip-path="url(#${clip})"><rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#000"/>`
		+ `<image x="${x}" y="${y}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data.toString('base64')}"/></g>`
}

/**
 * A whole XL page: 4 x 8 keys on the device face, each with its label under it. Your own keys get a
 * dashed accent edge, page keys a solid one. With `chrome`, your own keys show your pictures.
 */
export function pageSvg(set: IconSet, page: Page, chrome: ChromeImages = new Map()): string {
	const key = 112, gapX = 30, cellW = key + gapX, cellH = key + 44, padX = 46, top = 104
	const width = padX * 2 + COLS * cellW - gapX
	const height = top + ROWS * cellH + 28
	const parts: string[] = []
	const clips: string[] = []
	page.grid.forEach((row, r) => row.forEach((id, c) => {
		const x = padX + c * cellW, y = top + r * cellH
		if (id === EMPTY) {
			parts.push(`<rect x="${x + 0.75}" y="${y + 0.75}" width="${key - 1.5}" height="${key - 1.5}" rx="15.5" fill="#141419" stroke="#26262e" stroke-width="1.5"/>`)
			return
		}
		const k = keyFor(id)
		const clip = `k${r}${c}`
		clips.push(`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${key}" height="${key}" rx="16"/></clipPath>`)
		const own = chrome.get(id)
		parts.push(own ? embeddedPng(own, x, y, key, clip) : placed(set, stateIcons(k)[0], x, y, key, clip))
		const yours = k.kind === 'system' && !k.id.startsWith('page-')
		const edge = k.kind === 'system' ? BRAND : '#3a3a46'
		const dash = yours ? ' stroke-dasharray="7 5"' : ''
		parts.push(`<rect x="${x + 0.75}" y="${y + 0.75}" width="${key - 1.5}" height="${key - 1.5}" rx="15.5" fill="none" stroke="${edge}" stroke-width="${k.kind === 'system' ? 2 : 1.5}"${dash}/>`)
		parts.push(`<text x="${x + key / 2}" y="${y + key + 24}" text-anchor="middle" font-family="${FONT}" font-size="15" fill="#c9c9d6">${escapeXml(k.label)}</text>`)
	}))
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
		+ `<defs>${clips.join('')}</defs>`
		+ `<rect width="${width}" height="${height}" rx="28" fill="#0c0c10"/>`
		+ `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="27" fill="none" stroke="#2a2a33" stroke-width="2"/>`
		+ `<text x="${padX}" y="52" font-family="${FONT}" font-size="26" font-weight="600" fill="#ffffff">Teleprompter Plus · Stream Deck XL · Page ${page.number} of ${PAGES.length}: ${escapeXml(page.title)}</text>`
		+ `<text x="${padX}" y="80" font-family="${FONT}" font-size="16" fill="${'#a78bfa'}">${escapeXml(page.purpose)}</text>`
		+ parts.join('') + '</svg>'
}

/** A note under a toggle on the states sheet, for a key whose deck behaviour differs from the rest. */
const STATE_NOTE: Partial<Record<StateKind, string>> = { voice: ' (deck: live)' }

/** Every toggle, off and on side by side, so the on picture can be judged at key size. */
export function statesSvg(set: IconSet): string {
	const toggles = ACTIONS.flatMap(a => { const p = togglePictures(a); return p ? [{ a, p }] : [] })
	const key = 96, pairW = 2 * key + 16, cellW = pairW + 40, cellH = key + 50, pad = 40, top = 84, perRow = 4
	const rows = Math.ceil(toggles.length / perRow)
	const width = pad * 2 + perRow * cellW - 40, height = top + rows * cellH + 16
	const clips: string[] = [], parts: string[] = []
	toggles.forEach(({ a, p: pair }, i) => {
		const x0 = pad + (i % perRow) * cellW, y = top + Math.floor(i / perRow) * cellH
		pair.forEach((p, s) => {
			const x = x0 + s * (key + 16), clip = `s${i}${s}`
			clips.push(`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${key}" height="${key}" rx="14"/></clipPath>`)
			parts.push(placed(set, p, x, y, key, clip))
		})
		parts.push(`<text x="${x0 + pairW / 2}" y="${y + key + 24}" text-anchor="middle" font-family="${FONT}" font-size="15" fill="#c9c9d6">${escapeXml(a.label)}: off · on${STATE_NOTE[a.state] ?? ''}</text>`)
	})
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
		+ `<defs>${clips.join('')}</defs><rect width="${width}" height="${height}" rx="24" fill="#0c0c10"/>`
		+ `<text x="${pad}" y="50" font-family="${FONT}" font-size="24" font-weight="600" fill="#ffffff">Toggles: off and on</text>`
		+ parts.join('') + '</svg>'
}

/** Writes the page previews and the states sheet as PNGs into `dir`, names prefixed by `prefix`. */
export function exportPreviews(set: IconSet, dir: string = PREVIEW_DIR, chrome: ChromeImages = new Map(), prefix = ''): string[] {
	mkdirSync(dir, { recursive: true })
	// The composed SVG is only a step to the PNG: it names system fonts, so it is not kept.
	const work = mkdtempSync(path.join(os.tmpdir(), 'tp-deck-preview-'))
	const out: string[] = []
	const write = (name: string, svg: string): void => {
		const svgFile = path.join(work, `${name}.svg`)
		writeFileSync(svgFile, svg)
		const png = path.join(dir, `${prefix}${name}.png`)
		const width = /width="(\d+)"/.exec(svg)?.[1]
		if (!width) throw new Error(`${name}: no width`)
		execFileSync('rsvg-convert', ['-w', String(Number(width) * 2), '-o', png, svgFile], { timeout: 30_000 })
		out.push(png)
	}
	try {
		for (const page of PAGES) write(`streamdeck-xl-page-${page.number}`, pageSvg(set, page, chrome))
		write('streamdeck-xl-states', statesSvg(set))
	} finally {
		rmSync(work, { recursive: true, force: true })
	}
	return out
}

// ---------------------------------------------------------------------------------------------
// The doc block
// ---------------------------------------------------------------------------------------------

export const DOC_START = '<!-- layout:start (generated by scripts/streamdeck-profile.ts, do not edit by hand) -->'
export const DOC_END = '<!-- layout:end -->'

function keyCell(k: Key): string {
	return k.kind === 'system' ? `*${k.name}*` : k.name
}

/** The generated part of docs/stream-deck-profile.md. */
export function layoutMarkdown(): string {
	const lines: string[] = [DOC_START, '']
	for (const page of PAGES) {
		lines.push(`### Page ${page.number}: ${page.title}`, '', page.purpose + '.', '')
		lines.push('| Row | ' + Array.from({ length: COLS }, (_, c) => `Col ${c + 1}`).join(' | ') + ' |')
		lines.push('|---|' + '---|'.repeat(COLS))
		page.grid.forEach((row, r) => lines.push(`| **${r + 1}** | ` + row.map(id => (id === EMPTY ? '·' : keyFor(id).label)).join(' | ') + ' |'))
		lines.push('')
		lines.push('| Key | Action | Purpose | Sends | Picture |')
		lines.push('|---|---|---|---|---|')
		placedKeys(page).forEach(({ row: r, col: c, key: k }) => {
			const where = `R${r + 1} C${c + 1}`
			if (k.kind === 'system') lines.push(`| ${where} | ${keyCell(k)} | Deck | ${k.source} | ${STATES.system} |`)
			else lines.push(`| ${where} | ${k.name} | ${GROUP_LABEL[k.group]} | ${k.command ? `\`${k.command}\`` : 'nothing (deck only)'} | ${STATES[k.state]} |`)
		})
		lines.push('')
	}
	lines.push('### Every action, by purpose', '')
	lines.push('| Purpose | Actions (page, row, column) |')
	lines.push('|---|---|')
	const where = new Map<string, string>()
	for (const page of PAGES) for (const { row, col, id } of placedKeys(page)) where.set(id, `P${page.number} R${row + 1} C${col + 1}`)
	for (const group of Object.keys(GROUP_LABEL) as Group[]) {
		const members = ACTIONS.filter(a => a.group === group)
		if (members.length === 0) continue
		lines.push(`| ${GROUP_LABEL[group]} (${members.length}) | ` + members.map(a => `${a.name} (${where.get(a.id) ?? 'not placed'})`).join(', ') + ' |')
	}
	lines.push('', DOC_END)
	return lines.join('\n')
}

export function spliceDoc(doc: string, block: string): string {
	const start = doc.indexOf(DOC_START), end = doc.indexOf(DOC_END)
	if (start < 0 || end < start) throw new Error(`${PROFILE_DOC} has no layout markers`)
	return doc.slice(0, start) + block + doc.slice(end + DOC_END.length)
}

// ---------------------------------------------------------------------------------------------
// The deck plugin's manifest
// ---------------------------------------------------------------------------------------------

interface ManifestState { Image?: unknown; Name?: unknown }
interface ManifestAction { Name?: unknown; UUID?: unknown; Icon?: unknown; States?: unknown }
interface Manifest { Actions?: unknown; Profiles?: unknown; [k: string]: unknown }

function readManifest(file: string): Manifest & { Actions: ManifestAction[] } {
	const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
	if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Manifest).Actions)) {
		throw new Error(`${file}: not a Stream Deck plugin manifest (no Actions array)`)
	}
	return parsed as Manifest & { Actions: ManifestAction[] }
}

/** Differences between the layout and a deck plugin manifest; empty when every action is placed once. */
export function compareWithManifest(file: string): string[] {
	const manifest = readManifest(file)
	const problems: string[] = []
	const seen = new Set<string>()
	for (const action of manifest.Actions) {
		const uuid = typeof action.UUID === 'string' ? action.UUID : ''
		if (!uuid.startsWith(UUID_PREFIX)) { problems.push(`manifest action with an unexpected UUID: ${String(action.UUID)}`); continue }
		const id = uuid.slice(UUID_PREFIX.length)
		seen.add(id)
		const placed = ACTION_BY_ID.get(id)
		if (!placed) problems.push(`manifest action not in the layout: ${uuid} (${String(action.Name)})`)
		else if (placed.name !== action.Name) problems.push(`${uuid}: layout calls it "${placed.name}", manifest "${String(action.Name)}"`)
	}
	for (const a of ACTIONS) if (!seen.has(a.id)) problems.push(`layout places ${UUID_PREFIX}${a.id}, which the manifest does not have`)
	return problems
}

const TPLUS = 'imgs/themes/tplus'

/** Keys whose pictures the deck plugin paints itself from live state: their state images stay as they are. */
const LIVE_PICTURES = new Set<StateKind>(['voice', 'clock', 'theme'])

function isInstalledCopy(dir: string): boolean {
	return path.resolve(dir).includes(`${path.sep}com.elgato.StreamDeck${path.sep}Plugins${path.sep}`)
}

/**
 * Writes the T+ key art into a deck plugin source checkout and points its manifest at it.
 * Returns the files written.
 */
export function writePluginOverlay(dir: string, profile: string | null): string[] {
	if (isInstalledCopy(dir)) throw new Error(`${dir} is the installed copy inside the Stream Deck app; overlay a source checkout instead`)
	const manifestFile = path.join(dir, 'manifest.json')
	const manifest = readManifest(manifestFile)
	const problems = compareWithManifest(manifestFile)
	if (problems.length) throw new Error(`layout and manifest disagree:\n  ${problems.join('\n  ')}`)
	const written: string[] = []
	const copy = (from: string, to: string): void => {
		if (!existsSync(from)) throw new Error(`missing export ${from}; run the script without flags first`)
		mkdirSync(path.dirname(to), { recursive: true })
		writeFileSync(to, readFileSync(from))
		written.push(to)
	}
	for (const a of ACTIONS) {
		const [s0, s1] = stateIcons(a).map(fileId)
		copy(path.join(ICON_DIR, 'png-72', `${s0}.png`), path.join(dir, TPLUS, `${a.folder}.png`))
		copy(path.join(ICON_DIR, 'png-144', `${s0}.png`), path.join(dir, TPLUS, `${a.folder}@2x.png`))
		if (s1) {
			copy(path.join(ICON_DIR, 'png-72', `${s1}.png`), path.join(dir, TPLUS, `${a.folder}-on.png`))
			copy(path.join(ICON_DIR, 'png-144', `${s1}.png`), path.join(dir, TPLUS, `${a.folder}-on@2x.png`))
		}
		copy(path.join(LIST_DIR, `${a.icon}.png`), path.join(dir, TPLUS, 'list', `${a.folder}.png`))
		copy(path.join(LIST_DIR, `${a.icon}@2x.png`), path.join(dir, TPLUS, 'list', `${a.folder}@2x.png`))
		const entry = manifest.Actions.find(m => m.UUID === UUID_PREFIX + a.id)
		if (!entry || !Array.isArray(entry.States)) throw new Error(`${a.id}: manifest entry has no States`)
		entry.Icon = `${TPLUS}/list/${a.folder}`
		if (!LIVE_PICTURES.has(a.state)) {
			const states = entry.States as ManifestState[]
			// A key the layout gives two states gets its second manifest state here; Stream Deck
			// then flips it on each press, and a key that follows the teleprompter sets it.
			if (s1 && states.length === 1) {
				states[0].Name ??= `${a.label} Off`
				states.push({ Name: `${a.label} On` })
			}
			if (states.length !== stateIcons(a).length) {
				throw new Error(`${a.id}: the manifest has ${states.length} states, the layout ${stateIcons(a).length}`)
			}
			states.forEach((state, i) => { state.Image = i === 0 ? `${TPLUS}/${a.folder}` : `${TPLUS}/${a.folder}-on` })
		}
	}
	if (profile !== null) {
		const profileFile = path.join(dir, `${profile}.streamDeckProfile`)
		if (!existsSync(profileFile)) throw new Error(`${profileFile} does not exist: export the profile from the Stream Deck app first`)
		manifest.Profiles = [{ Name: profile, DeviceType: 2, DontAutoSwitchWhenInstalled: true, Readonly: false, AutoInstall: true }]
	}
	writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
	written.push(manifestFile)
	return written
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function argValue(args: string[], flag: string): string | null {
	const i = args.indexOf(flag)
	if (i < 0) return null
	const v = args[i + 1]
	if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`)
	return v
}

function main(args: string[]): number {
	const manifest = argValue(args, '--check-manifest')
	if (manifest) {
		const problems = compareWithManifest(manifest)
		for (const p of problems) console.error(`  - ${p}`)
		console.log(problems.length ? `${problems.length} difference(s)` : `layout places all ${ACTIONS.length} actions of ${manifest} once`)
		return problems.length ? 1 : 0
	}
	const overlay = argValue(args, '--plugin-overlay')
	if (overlay) {
		const files = writePluginOverlay(overlay, argValue(args, '--profile'))
		console.log(`wrote ${files.length} files into ${overlay}`)
		return 0
	}
	const personal = argValue(args, '--personal-preview')
	if (personal) {
		// Previews with your own key pictures, for your notes; never written into the repository.
		const chrome = new Map<string, string>()
		args.forEach((a, i) => {
			if (a !== '--chrome') return
			const m = /^([a-z-]+)=(.+)$/.exec(args[i + 1] ?? '')
			if (!m || !Object.hasOwn(SYSTEM_KEYS, m[1])) throw new Error(`--chrome needs <system key id>=<png>, got ${String(args[i + 1])}`)
			if (!existsSync(m[2])) throw new Error(`--chrome ${m[1]}: no file ${m[2]}`)
			chrome.set(m[1], m[2])
		})
		if (path.resolve(personal).startsWith(ROOT + path.sep)) throw new Error('--personal-preview must write outside the repository')
		const prefix = argValue(args, '--prefix') ?? ''
		for (const png of exportPreviews(loadIconSet(), personal, chrome, prefix)) console.log(`preview: ${png}`)
		return 0
	}
	const set = loadIconSet()
	for (const p of pictures()) {
		const id = p.endsWith('@on') ? p.slice(0, -3) : p
		if (!set.icons.has(id)) throw new Error(`layout uses icon ${id}, which icons-data.js does not define`)
	}
	const counts = exportIcons(set)
	console.log(`icons: ${counts.keys} key masters, ${counts.lit} lit states, ${counts.list} action-list icons`)
	for (const png of exportPreviews(set)) console.log(`preview: ${path.relative(ROOT, png)}`)
	writeFileSync(PROFILE_DOC, spliceDoc(readFileSync(PROFILE_DOC, 'utf8'), layoutMarkdown()))
	console.log(`doc: ${path.relative(ROOT, PROFILE_DOC)}`)
	return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
