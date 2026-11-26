/**
 * Every `teleprompter:*` command a view hears, from hotkeys, Obsidian commands, the remote server
 * (Stream Deck, phone) and the other window, in one table: which intent each event names, with its
 * parameters checked, and one rule for whether a view runs it, hands it to the floating view, or
 * drops it. TeleprompterApp.svelte only maps each intent to its own functions, so what a command
 * means and where it runs is decided here, where bun can test it.
 */

import type { SectionRef } from './sections'
import type { VoiceTrackingPacePreset } from './settings'

export type Direction = 1 | -1
export type TextAlignment = 'left' | 'center' | 'right' | 'rtl'
export type ProgressIndicatorStyle = 'progress-bar' | 'scrollbar' | 'none'
export type ViewMode = 'rendered' | 'plain'
export type VoicePreset = Exclude<VoiceTrackingPacePreset, 'custom'>

/** The voice pace presets a command may name; commands.test.ts holds this to settings.ts. */
export const VOICE_PRESET_NAMES: readonly VoicePreset[] = ['conservative', 'balanced', 'responsive', 'rehearsal']

/** A section named by another view or a remote: its id here, and its line and title when sent. */
export interface SectionTarget {
	headerId?: string
	section?: Partial<SectionRef>
}

/** The appearance fields an "apply all settings" command may carry; a missing field is left alone. */
export interface AppearancePatch {
	fontSize?: number
	textColor?: string
	backgroundColor?: string
	fontFamily?: string
	lineHeight?: number
	paddingVertical?: number
	paddingHorizontal?: number
	backgroundOpacity?: number
	enableBackgroundTransparency?: boolean
}

/** What a command asks a view to do, with its parameters already checked. */
export type Intent =
	| { kind: 'togglePlay' }
	| { kind: 'play' }
	| { kind: 'pause' }
	| { kind: 'stepSpeed'; direction: Direction }
	| { kind: 'setSpeed'; speed: number }
	| { kind: 'cycleSpeedPreset' }
	| { kind: 'stepSpeedPreset'; direction: Direction }
	| { kind: 'setSpeedPreset'; speed: number }
	| { kind: 'resetToTop' }
	| { kind: 'fitSpeedToTarget' }
	| { kind: 'applyVoicePreset'; preset: VoicePreset }
	| { kind: 'hotkeyAction'; action: string }
	| { kind: 'scrollBy'; amount: number }
	| { kind: 'setScrollPosition'; position: number }
	| { kind: 'seekToFraction'; fraction: number }
	| { kind: 'followScrollPercentage'; percentage: number }
	| { kind: 'jumpToHeaderIndex'; index: number }
	| { kind: 'jumpToSection'; target: SectionTarget }
	| { kind: 'toggleNavigation' }
	| { kind: 'setNavigation'; visible: boolean }
	| { kind: 'stepSection'; direction: Direction }
	| { kind: 'broadcastState' }
	| { kind: 'setFontSize'; fontSize: number }
	| { kind: 'applyAppearance'; patch: AppearancePatch }
	| { kind: 'stepFontSize'; direction: Direction }
	| { kind: 'toggleEyeline' }
	| { kind: 'setEyeline'; visible: boolean }
	| { kind: 'toggleFocusMode' }
	| { kind: 'setFocusMode'; enabled: boolean }
	| { kind: 'stepCountdown'; direction: Direction }
	| { kind: 'setCountdown'; seconds: number }
	| { kind: 'startCountdown' }
	| { kind: 'togglePin' }
	| { kind: 'setPinned'; pinned: boolean }
	| { kind: 'refreshPinned' }
	| { kind: 'toggleKeepAwake' }
	| { kind: 'setKeepAwake'; enabled: boolean }
	| { kind: 'toggleAutoPause' }
	| { kind: 'setAutoPause'; enabled: boolean }
	| { kind: 'toggleDoubleClickEdit' }
	| { kind: 'setDoubleClickEdit'; enabled: boolean }
	| { kind: 'toggleFullScreen' }
	| { kind: 'setFullScreen'; enabled: boolean }
	| { kind: 'stepLineHeight'; direction: Direction }
	| { kind: 'stepPaddingVertical'; direction: Direction }
	| { kind: 'stepPaddingHorizontal'; direction: Direction }
	| { kind: 'applyColorPreset'; preset: string }
	| { kind: 'setTextColor'; color: string }
	| { kind: 'setBackgroundColor'; color: string }
	| { kind: 'applyFontPreset'; preset: string }
	| { kind: 'setFontFamily'; family: string }
	| { kind: 'toggleFlipHorizontal' }
	| { kind: 'setFlipHorizontal'; enabled: boolean }
	| { kind: 'toggleFlipVertical' }
	| { kind: 'setFlipVertical'; enabled: boolean }
	| { kind: 'cycleAlignment' }
	| { kind: 'setAlignment'; alignment: TextAlignment }
	| { kind: 'toggleScrollSync' }
	| { kind: 'setScrollSync'; enabled: boolean }
	| { kind: 'toggleMinimap' }
	| { kind: 'setMinimap'; visible: boolean }
	| { kind: 'cycleProgressIndicator' }
	| { kind: 'setProgressIndicator'; style: ProgressIndicatorStyle }
	| { kind: 'stepLetterSpacing'; direction: Direction }
	| { kind: 'stepOpacity'; direction: Direction }
	| { kind: 'toggleViewMode' }
	| { kind: 'setViewMode'; mode: ViewMode }
	| { kind: 'toggleFloating' }
	| { kind: 'detachWindow' }
	| { kind: 'openFile'; path: string }
	| { kind: 'setVoice'; on: boolean }
	| { kind: 'toggleVoice' }
	| { kind: 'voiceResync' }
	| { kind: 'reportVoiceStatus' }
	| { kind: 'toggleTTS' }
	| { kind: 'startTTS' }
	| { kind: 'stopTTS' }
	| { kind: 'readFromSection'; target: SectionTarget }
	| { kind: 'stepTTSSentence'; direction: Direction }
	| { kind: 'repeatTTSSentence' }
	| { kind: 'toggleTTSLoop' }
	| { kind: 'stepTTSRate'; direction: Direction }
	| { kind: 'loadSpeakerNotes'; content: string; title: string }

export type IntentKind = Intent['kind']

/** One function per intent: a view that leaves one out does not compile. */
export type CommandHandlers = { [K in IntentKind]: (intent: Extract<Intent, { kind: K }>) => void }

/**
 * Where a command may run. `script`: it moves or drives the script, so while a script floats the
 * floating view runs it and the main view hands it over. `main-window`: it opens or closes the
 * floating window itself, so the view that heard it runs it, once however many views heard it.
 */
export type CommandScope = 'script' | 'main-window'

interface CommandSpec {
	/** The intent for this event's detail, or null when the detail is malformed. */
	readonly parse: (detail: unknown) => Intent | null
	readonly scope: CommandScope
	/**
	 * Set when the view does not listen for this event yet, with the reason. Kept so turning one on
	 * is a deliberate one-line change with its handler and tests already in place.
	 */
	readonly dormant?: string
}

function record(detail: unknown): Record<string, unknown> | null {
	return typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : null
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A number, or a numeric string as a WebSocket client may send. */
function numeric(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null
}

/** The section a jump or a read-aloud start names; null when it names none. */
export function parseSectionTarget(detail: unknown): SectionTarget | null {
	const fields = record(detail)
	if (!fields) return null
	const target: SectionTarget = {}
	const headerId = nonEmptyString(fields.headerId)
	if (headerId) target.headerId = headerId
	const section = record(fields.section)
	if (section) target.section = section as Partial<SectionRef>
	return target.headerId !== undefined || target.section !== undefined ? target : null
}

/** Only the fields with the right type; a falsy size, color or family is left alone as before. */
export function parseAppearancePatch(detail: unknown): AppearancePatch | null {
	const fields = record(detail)
	if (!fields) return null
	const patch: AppearancePatch = {}
	const truthyNumber = (value: unknown) => {
		const n = finiteNumber(value)
		return n ? n : undefined
	}
	const truthyString = (value: unknown) => nonEmptyString(value) ?? undefined
	const anyNumber = (value: unknown) => finiteNumber(value) ?? undefined
	const fontSize = truthyNumber(fields.fontSize)
	if (fontSize !== undefined) patch.fontSize = fontSize
	const textColor = truthyString(fields.textColor)
	if (textColor !== undefined) patch.textColor = textColor
	const backgroundColor = truthyString(fields.backgroundColor)
	if (backgroundColor !== undefined) patch.backgroundColor = backgroundColor
	const fontFamily = truthyString(fields.fontFamily)
	if (fontFamily !== undefined) patch.fontFamily = fontFamily
	const lineHeight = truthyNumber(fields.lineHeight)
	if (lineHeight !== undefined) patch.lineHeight = lineHeight
	const paddingVertical = anyNumber(fields.paddingVertical)
	if (paddingVertical !== undefined) patch.paddingVertical = paddingVertical
	const paddingHorizontal = anyNumber(fields.paddingHorizontal)
	if (paddingHorizontal !== undefined) patch.paddingHorizontal = paddingHorizontal
	const backgroundOpacity = anyNumber(fields.backgroundOpacity)
	if (backgroundOpacity !== undefined) patch.backgroundOpacity = backgroundOpacity
	if (typeof fields.enableBackgroundTransparency === 'boolean') {
		patch.enableBackgroundTransparency = fields.enableBackgroundTransparency
	}
	return patch
}

/** The countdown is held between 0 and 30 seconds, as its buttons are. */
export const MAX_COUNTDOWN_SECONDS = 30

/** The title the prompter shows for speaker notes sent by a slide app. */
export function speakerNotesTitle(slide: unknown, totalSlides: unknown): string {
	const label = (value: unknown): string | null =>
		(typeof value === 'number' || typeof value === 'string') && value ? String(value) : null
	const current = label(slide)
	if (!current) return 'Speaker Notes'
	return `Slide ${current}/${label(totalSlides) ?? '?'}`
}

const always = (intent: Intent) => () => ({ ...intent }) as Intent
const script = (parse: (detail: unknown) => Intent | null): CommandSpec => ({ parse, scope: 'script' })
const fixed = (intent: Intent): CommandSpec => script(always(intent))

const NOT_LISTENED =
	'main.ts dispatches it, but the view never listened for it, so it has done nothing since it was added. Turning it on is a behaviour change to test live first.'
const NOT_SENT = 'Nothing dispatches it and the view never listened for it.'
const dormant = (spec: CommandSpec, reason: string): CommandSpec => ({ ...spec, dormant: reason })

/** Every command event, its intent and its scope. */
const COMMAND_TABLE = {
	'teleprompter:toggle-play': fixed({ kind: 'togglePlay' }),
	'teleprompter:play': fixed({ kind: 'play' }),
	'teleprompter:pause': fixed({ kind: 'pause' }),
	'teleprompter:increase-speed': fixed({ kind: 'stepSpeed', direction: 1 }),
	'teleprompter:decrease-speed': fixed({ kind: 'stepSpeed', direction: -1 }),
	// Any positive speed: the view holds it inside the slider's range (ISC-159).
	'teleprompter:set-speed': script(detail => {
		const speed = Number(record(detail)?.speed)
		return speed > 0 ? { kind: 'setSpeed', speed } : null
	}),
	'teleprompter:cycle-speed-preset': fixed({ kind: 'cycleSpeedPreset' }),
	'teleprompter:next-speed-preset': fixed({ kind: 'stepSpeedPreset', direction: 1 }),
	'teleprompter:prev-speed-preset': fixed({ kind: 'stepSpeedPreset', direction: -1 }),
	'teleprompter:set-speed-preset': script(detail => {
		const speed = finiteNumber(record(detail)?.speed)
		return speed !== null && speed > 0 ? { kind: 'setSpeedPreset', speed } : null
	}),
	'teleprompter:speed-preset-0.5': fixed({ kind: 'setSpeedPreset', speed: 0.5 }),
	'teleprompter:speed-preset-1': fixed({ kind: 'setSpeedPreset', speed: 1 }),
	'teleprompter:speed-preset-1.5': fixed({ kind: 'setSpeedPreset', speed: 1.5 }),
	'teleprompter:speed-preset-2': fixed({ kind: 'setSpeedPreset', speed: 2 }),
	'teleprompter:speed-preset-3': fixed({ kind: 'setSpeedPreset', speed: 3 }),
	'teleprompter:speed-preset-5': fixed({ kind: 'setSpeedPreset', speed: 5 }),
	'teleprompter:reset-to-top': fixed({ kind: 'resetToTop' }),
	'teleprompter:fit-speed-to-target': fixed({ kind: 'fitSpeedToTarget' }),
	'teleprompter:apply-voice-preset': script(detail => {
		const preset = record(detail)?.preset
		return typeof preset === 'string' && (VOICE_PRESET_NAMES as readonly string[]).includes(preset)
			? { kind: 'applyVoicePreset', preset: preset as VoicePreset }
			: null
	}),
	'teleprompter:hotkey-action': script(detail => {
		const action = record(detail)?.action
		return typeof action === 'string' ? { kind: 'hotkeyAction', action } : null
	}),
	'teleprompter:scroll': script(detail => {
		const amount = numeric(record(detail)?.amount)
		return amount ? { kind: 'scrollBy', amount } : null
	}),
	// Network broadcast: an absolute place in pixels, for follower devices.
	'teleprompter:set-scroll-position': script(detail => {
		const position = numeric(record(detail)?.position)
		return position !== null ? { kind: 'setScrollPosition', position } : null
	}),
	// A minimap or progress-bar click forwarded from the main window is a seek (it pauses); without
	// `seek` it is a follower device keeping up with the leader's percentage.
	'teleprompter:set-scroll-percentage': script(detail => {
		const fields = record(detail)
		if (fields?.seek === true) {
			const percentage = finiteNumber(fields.percentage)
			if (percentage !== null) return { kind: 'seekToFraction', fraction: percentage / 100 }
		}
		const percentage = numeric(fields?.percentage)
		return percentage !== null ? { kind: 'followScrollPercentage', percentage } : null
	}),
	'teleprompter:jump-to-header': script(detail => {
		const index = numeric(record(detail)?.index)
		return index !== null && Number.isInteger(index) && index >= 0 ? { kind: 'jumpToHeaderIndex', index } : null
	}),
	// Header ids are render ordinals and can differ between views, so a section reference sent along
	// wins over the id (live 2026-11-25).
	'teleprompter:jump-to-header-by-id': script(detail => {
		const target = parseSectionTarget(detail)
		return target ? { kind: 'jumpToSection', target } : null
	}),
	'teleprompter:toggle-navigation': fixed({ kind: 'toggleNavigation' }),
	'teleprompter:show-navigation': fixed({ kind: 'setNavigation', visible: true }),
	'teleprompter:hide-navigation': fixed({ kind: 'setNavigation', visible: false }),
	'teleprompter:next-section': fixed({ kind: 'stepSection', direction: 1 }),
	'teleprompter:previous-section': fixed({ kind: 'stepSection', direction: -1 }),
	'teleprompter:broadcast-state': fixed({ kind: 'broadcastState' }),
	'teleprompter:set-font-size': script(detail => {
		const fontSize = numeric(record(detail)?.fontSize)
		return fontSize ? { kind: 'setFontSize', fontSize } : null
	}),
	'teleprompter:apply-all-settings': script(detail => {
		const patch = parseAppearancePatch(detail)
		return patch ? { kind: 'applyAppearance', patch } : null
	}),
	'teleprompter:font-size-up': fixed({ kind: 'stepFontSize', direction: 1 }),
	'teleprompter:font-size-down': fixed({ kind: 'stepFontSize', direction: -1 }),
	'teleprompter:toggle-eyeline': fixed({ kind: 'toggleEyeline' }),
	'teleprompter:show-eyeline': fixed({ kind: 'setEyeline', visible: true }),
	'teleprompter:hide-eyeline': fixed({ kind: 'setEyeline', visible: false }),
	'teleprompter:toggle-focus-mode': fixed({ kind: 'toggleFocusMode' }),
	'teleprompter:enable-focus-mode': fixed({ kind: 'setFocusMode', enabled: true }),
	'teleprompter:disable-focus-mode': fixed({ kind: 'setFocusMode', enabled: false }),
	'teleprompter:countdown-increase': fixed({ kind: 'stepCountdown', direction: 1 }),
	'teleprompter:countdown-decrease': fixed({ kind: 'stepCountdown', direction: -1 }),
	'teleprompter:set-countdown': script(detail => {
		const seconds = numeric(record(detail)?.seconds)
		return seconds !== null
			? { kind: 'setCountdown', seconds: Math.max(0, Math.min(MAX_COUNTDOWN_SECONDS, seconds)) }
			: null
	}),
	'teleprompter:start-countdown': fixed({ kind: 'startCountdown' }),
	'teleprompter:toggle-pin': fixed({ kind: 'togglePin' }),
	'teleprompter:pin-note': fixed({ kind: 'setPinned', pinned: true }),
	'teleprompter:unpin-note': fixed({ kind: 'setPinned', pinned: false }),
	'teleprompter:refresh-pinned': fixed({ kind: 'refreshPinned' }),
	'teleprompter:toggle-keep-awake': fixed({ kind: 'toggleKeepAwake' }),
	'teleprompter:enable-keep-awake': fixed({ kind: 'setKeepAwake', enabled: true }),
	'teleprompter:disable-keep-awake': fixed({ kind: 'setKeepAwake', enabled: false }),
	'teleprompter:toggle-auto-pause': fixed({ kind: 'toggleAutoPause' }),
	'teleprompter:enable-auto-pause': fixed({ kind: 'setAutoPause', enabled: true }),
	'teleprompter:disable-auto-pause': fixed({ kind: 'setAutoPause', enabled: false }),
	'teleprompter:toggle-double-click-edit': fixed({ kind: 'toggleDoubleClickEdit' }),
	'teleprompter:enable-double-click-edit': fixed({ kind: 'setDoubleClickEdit', enabled: true }),
	'teleprompter:disable-double-click-edit': fixed({ kind: 'setDoubleClickEdit', enabled: false }),
	'teleprompter:toggle-fullscreen': fixed({ kind: 'toggleFullScreen' }),
	'teleprompter:enable-fullscreen': fixed({ kind: 'setFullScreen', enabled: true }),
	'teleprompter:disable-fullscreen': fixed({ kind: 'setFullScreen', enabled: false }),
	'teleprompter:line-height-increase': fixed({ kind: 'stepLineHeight', direction: 1 }),
	'teleprompter:line-height-decrease': fixed({ kind: 'stepLineHeight', direction: -1 }),
	'teleprompter:padding-vertical-increase': fixed({ kind: 'stepPaddingVertical', direction: 1 }),
	'teleprompter:padding-vertical-decrease': fixed({ kind: 'stepPaddingVertical', direction: -1 }),
	'teleprompter:padding-horizontal-increase': fixed({ kind: 'stepPaddingHorizontal', direction: 1 }),
	'teleprompter:padding-horizontal-decrease': fixed({ kind: 'stepPaddingHorizontal', direction: -1 }),
	'teleprompter:color-preset': script(detail => {
		const preset = nonEmptyString(record(detail)?.preset)
		return preset ? { kind: 'applyColorPreset', preset } : null
	}),
	'teleprompter:color-preset-dark': fixed({ kind: 'applyColorPreset', preset: 'dark' }),
	'teleprompter:color-preset-light': fixed({ kind: 'applyColorPreset', preset: 'light' }),
	'teleprompter:color-preset-black': fixed({ kind: 'applyColorPreset', preset: 'black' }),
	'teleprompter:color-preset-sepia': fixed({ kind: 'applyColorPreset', preset: 'sepia' }),
	'teleprompter:color-preset-green': fixed({ kind: 'applyColorPreset', preset: 'green-on-black' }),
	'teleprompter:color-preset-amber': fixed({ kind: 'applyColorPreset', preset: 'amber-on-black' }),
	'teleprompter:set-text-color': script(detail => {
		const color = nonEmptyString(record(detail)?.color)
		return color ? { kind: 'setTextColor', color } : null
	}),
	'teleprompter:set-background-color': script(detail => {
		const color = nonEmptyString(record(detail)?.color)
		return color ? { kind: 'setBackgroundColor', color } : null
	}),
	'teleprompter:font-preset': script(detail => {
		const preset = nonEmptyString(record(detail)?.preset)
		return preset ? { kind: 'applyFontPreset', preset } : null
	}),
	'teleprompter:font-preset-system': fixed({ kind: 'applyFontPreset', preset: 'system' }),
	'teleprompter:font-preset-sans': fixed({ kind: 'applyFontPreset', preset: 'sans' }),
	'teleprompter:font-preset-serif': fixed({ kind: 'applyFontPreset', preset: 'serif' }),
	'teleprompter:font-preset-mono': fixed({ kind: 'applyFontPreset', preset: 'mono' }),
	'teleprompter:font-preset-readable': fixed({ kind: 'applyFontPreset', preset: 'readable' }),
	'teleprompter:font-preset-slab': fixed({ kind: 'applyFontPreset', preset: 'slab' }),
	'teleprompter:set-font-family': script(detail => {
		const family = nonEmptyString(record(detail)?.family)
		return family ? { kind: 'setFontFamily', family } : null
	}),
	'teleprompter:toggle-flip-horizontal': fixed({ kind: 'toggleFlipHorizontal' }),
	'teleprompter:enable-flip-horizontal': fixed({ kind: 'setFlipHorizontal', enabled: true }),
	'teleprompter:disable-flip-horizontal': fixed({ kind: 'setFlipHorizontal', enabled: false }),
	'teleprompter:toggle-flip-vertical': fixed({ kind: 'toggleFlipVertical' }),
	'teleprompter:enable-flip-vertical': fixed({ kind: 'setFlipVertical', enabled: true }),
	'teleprompter:disable-flip-vertical': fixed({ kind: 'setFlipVertical', enabled: false }),
	'teleprompter:cycle-alignment': fixed({ kind: 'cycleAlignment' }),
	'teleprompter:align-left': dormant(fixed({ kind: 'setAlignment', alignment: 'left' }), NOT_SENT),
	'teleprompter:align-center': dormant(fixed({ kind: 'setAlignment', alignment: 'center' }), NOT_SENT),
	'teleprompter:align-right': dormant(fixed({ kind: 'setAlignment', alignment: 'right' }), NOT_SENT),
	'teleprompter:align-rtl': dormant(fixed({ kind: 'setAlignment', alignment: 'rtl' }), NOT_SENT),
	'teleprompter:toggle-scroll-sync': fixed({ kind: 'toggleScrollSync' }),
	'teleprompter:enable-scroll-sync': fixed({ kind: 'setScrollSync', enabled: true }),
	'teleprompter:disable-scroll-sync': fixed({ kind: 'setScrollSync', enabled: false }),
	'teleprompter:toggle-minimap': fixed({ kind: 'toggleMinimap' }),
	'teleprompter:show-minimap': fixed({ kind: 'setMinimap', visible: true }),
	'teleprompter:hide-minimap': fixed({ kind: 'setMinimap', visible: false }),
	'teleprompter:cycle-progress-indicator': fixed({ kind: 'cycleProgressIndicator' }),
	'teleprompter:progress-indicator-bar': fixed({ kind: 'setProgressIndicator', style: 'progress-bar' }),
	'teleprompter:progress-indicator-scrollbar': fixed({ kind: 'setProgressIndicator', style: 'scrollbar' }),
	'teleprompter:progress-indicator-none': fixed({ kind: 'setProgressIndicator', style: 'none' }),
	'teleprompter:letter-spacing-increase': dormant(fixed({ kind: 'stepLetterSpacing', direction: 1 }), NOT_LISTENED),
	'teleprompter:letter-spacing-decrease': dormant(fixed({ kind: 'stepLetterSpacing', direction: -1 }), NOT_LISTENED),
	'teleprompter:opacity-increase': dormant(fixed({ kind: 'stepOpacity', direction: 1 }), NOT_LISTENED),
	'teleprompter:opacity-decrease': dormant(fixed({ kind: 'stepOpacity', direction: -1 }), NOT_LISTENED),
	'teleprompter:toggle-view-mode': dormant(fixed({ kind: 'toggleViewMode' }), NOT_LISTENED),
	'teleprompter:set-view-mode-rendered': dormant(fixed({ kind: 'setViewMode', mode: 'rendered' }), NOT_LISTENED),
	'teleprompter:set-view-mode-plain': dormant(fixed({ kind: 'setViewMode', mode: 'plain' }), NOT_LISTENED),
	// Opens or closes the floating window: the view that heard it runs it, never the floating view.
	'teleprompter:toggle-floating': { parse: always({ kind: 'toggleFloating' }), scope: 'main-window' },
	'teleprompter:detach-window': dormant(fixed({ kind: 'detachWindow' }), NOT_LISTENED),
	'teleprompter:open-file': dormant(
		script(detail => {
			const path = nonEmptyString(record(detail)?.path)
			return path ? { kind: 'openFile', path } : null
		}),
		NOT_LISTENED
	),
	'teleprompter:voice-start': fixed({ kind: 'setVoice', on: true }),
	'teleprompter:voice-stop': fixed({ kind: 'setVoice', on: false }),
	'teleprompter:voice-toggle': fixed({ kind: 'toggleVoice' }),
	'teleprompter:voice-resync': dormant(fixed({ kind: 'voiceResync' }), NOT_SENT),
	'teleprompter:get-voice-status': fixed({ kind: 'reportVoiceStatus' }),
	'teleprompter:tts-toggle': fixed({ kind: 'toggleTTS' }),
	'teleprompter:tts-stop': fixed({ kind: 'stopTTS' }),
	'teleprompter:tts-from-section': script(detail => {
		const target = parseSectionTarget(detail)
		return target ? { kind: 'readFromSection', target } : null
	}),
	'teleprompter:tts-next-sentence': fixed({ kind: 'stepTTSSentence', direction: 1 }),
	'teleprompter:tts-prev-sentence': fixed({ kind: 'stepTTSSentence', direction: -1 }),
	'teleprompter:tts-repeat': fixed({ kind: 'repeatTTSSentence' }),
	'teleprompter:tts-loop-toggle': fixed({ kind: 'toggleTTSLoop' }),
	'teleprompter:tts-speed-up': fixed({ kind: 'stepTTSRate', direction: 1 }),
	'teleprompter:tts-speed-down': fixed({ kind: 'stepTTSRate', direction: -1 }),
	// LifeOS Stage: a slide app sends the current slide's speaker notes as the script.
	'teleprompter:load-speaker-notes': script(detail => {
		const fields = record(detail)
		const content = nonEmptyString(fields?.content)
		return content && fields
			? { kind: 'loadSpeakerNotes', content, title: speakerNotesTitle(fields.slide, fields.totalSlides) }
			: null
	}),
	'teleprompter:toggleTTS': fixed({ kind: 'toggleTTS' }),
	'teleprompter:startTTS': fixed({ kind: 'startTTS' }),
	'teleprompter:stopTTS': fixed({ kind: 'stopTTS' }),
} satisfies Record<`teleprompter:${string}`, CommandSpec>

export type CommandEvent = keyof typeof COMMAND_TABLE

const COMMANDS: Readonly<Record<string, CommandSpec>> = COMMAND_TABLE

export const COMMAND_EVENTS: readonly CommandEvent[] = Object.keys(COMMAND_TABLE) as CommandEvent[]

/** The events a view listens for: every command that is not dormant. */
export const LISTENED_COMMAND_EVENTS: readonly CommandEvent[] = COMMAND_EVENTS.filter(type => !COMMANDS[type].dormant)

export function isCommandEvent(type: string): type is CommandEvent {
	return Object.prototype.hasOwnProperty.call(COMMANDS, type)
}

export function commandScope(type: CommandEvent): CommandScope {
	return COMMANDS[type].scope
}

export function dormantReason(type: CommandEvent): string | undefined {
	return COMMANDS[type].dormant
}

/** The intent an event names, or null for an unknown event or a malformed detail. */
export function parseCommand(type: string, detail: unknown): Intent | null {
	if (!isCommandEvent(type)) return null
	return COMMANDS[type].parse(detail)
}

/** What a view is, for routing: the floating view, or a view with a floating script open elsewhere. */
export interface CommandView {
	/** This view is the floating window's. */
	isFloating: boolean
	/** A floating window is open (this one or another). */
	floatingActive: boolean
	/** This platform can open a floating window (desktop, not Linux; never a phone). */
	canFloat: boolean
}

/**
 * The one rule for who owns the script: the floating view while a script floats, otherwise the
 * view itself. Voice and read-aloud follow the script, so they share it: the view that does not own
 * the script forwards to the one that does.
 */
export function ownsScript(view: CommandView): boolean {
	return view.isFloating || !view.floatingActive
}

export type Route = 'local' | 'forward' | 'ignore'

/** Whether a view runs a command, hands it to the floating view, or drops it. */
export function routeCommand(type: CommandEvent, view: CommandView): Route {
	if (commandScope(type) === 'main-window') {
		// Only a view that could open a floating window, or close one, has anything to do.
		return view.canFloat || view.isFloating || view.floatingActive ? 'local' : 'ignore'
	}
	return ownsScript(view) ? 'local' : 'forward'
}

/** The part of FloatingSession the dispatcher needs. */
export interface CommandSession {
	/** True only for the first view to claim this event: every open view hears each command. */
	claim(event: Event): boolean
	forward(type: string, detail?: unknown): void
}

export type DispatchResult =
	| { outcome: 'handled'; intent: Intent }
	| { outcome: 'forwarded' }
	| { outcome: 'ignored'; reason: 'unknown' | 'dormant' | 'malformed' | 'not-here' | 'claimed' }

/**
 * Runs one command event in one view: the intent is checked first, so a malformed command is
 * dropped everywhere; a command for the floating script is forwarded once, by the first view to
 * claim it; a main-window command runs in the first view that claims it.
 */
export function dispatchCommand(
	event: Event,
	view: CommandView,
	session: CommandSession,
	handle: (intent: Intent) => void
): DispatchResult {
	const type = event.type
	if (!isCommandEvent(type)) return { outcome: 'ignored', reason: 'unknown' }
	if (COMMANDS[type].dormant) return { outcome: 'ignored', reason: 'dormant' }
	const detail: unknown = (event as CustomEvent<unknown>).detail
	const intent = parseCommand(type, detail)
	if (!intent) return { outcome: 'ignored', reason: 'malformed' }
	const route = routeCommand(type, view)
	if (route === 'ignore') return { outcome: 'ignored', reason: 'not-here' }
	if (route === 'forward') {
		if (!session.claim(event)) return { outcome: 'ignored', reason: 'claimed' }
		session.forward(type, detail)
		return { outcome: 'forwarded' }
	}
	if (commandScope(type) === 'main-window' && !session.claim(event)) return { outcome: 'ignored', reason: 'claimed' }
	handle(intent)
	return { outcome: 'handled', intent }
}

/** Calls the view's function for an intent. */
export function runIntent(handlers: CommandHandlers, intent: Intent): void {
	const handler = handlers[intent.kind] as (intent: Intent) => void
	handler(intent)
}

/** Hotkey actions that move or drive the script, so the floating view runs them while it floats. */
export const SCRIPT_HOTKEY_ACTIONS: ReadonlySet<string> = new Set([
	'togglePlay', 'speedUp', 'speedDown', 'scrollUp', 'scrollDown', 'pageDown', 'pageUp',
	'resetToTop', 'nextSection', 'prevSection', 'cycleSpeedPreset', 'voiceResync',
])
