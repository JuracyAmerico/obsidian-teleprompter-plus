/**
 * Icon vocabulary — single source of truth for toolbar glyphs.
 *
 * Teleprompter Plus historically shipped a bespoke `tp-*` icon set (hand-drawn SVGs registered via
 * `addIcon`, on a 100×100 grid with heavy strokes). That set reads inconsistently next to native
 * Obsidian UI, which is Lucide (24px, ~2px stroke), and it's also what we render onto Stream Deck
 * keys — so we want ONE vocabulary.
 *
 * This module maps each `tp-*` custom icon to its Lucide equivalent. The toolbar resolves an icon
 * through `resolveControlIcon(name, style)`:
 *   - style 'native' (default) → the Lucide name (consistent with Obsidian + Stream Deck)
 *   - style 'custom'           → the original `tp-*` name (the bespoke set, kept as opt-in)
 *
 * The same map is the source the Stream Deck key generator reads, so a "play" is the same glyph
 * everywhere — rendered monochrome-native in Obsidian, as an accent key on Stream Deck.
 */

import { CONTROL_ICONS as C, type ActionIcon } from './action-icons'

export type IconStyle = 'native' | 'custom'

/**
 * `tp-*` custom icon name → Lucide icon name. Lucide is Obsidian's built-in set (theme-aware). Controls
 * that have a twin on the phone remote or the Stream Deck take their symbol from CONTROL_ICONS in
 * action-icons.ts, the one map every surface reads.
 */
export const CUSTOM_TO_LUCIDE: Record<string, string> = {
  // Playback
  'tp-play': C.play.lucide,
  'tp-pause': C.play.on,
  'tp-play-pause': C.play.lucide,
  'tp-reset-top': C.resetToTop.lucide,
  'tp-speed-up': C.speed.lucide,
  'tp-speed-down': C.speed.lucide,
  'tp-countdown-up': C.countdown.lucide,
  // Typography / display
  'tp-font-up': C.fontSize.lucide,
  'tp-font-down': C.fontSize.lucide,
  'tp-font-reset': C.fontSize.lucide,
  'tp-font-system': 'type',
  'tp-line-height': C.lineHeight.lucide,
  'tp-letter-spacing': C.letterSpacing.lucide,
  'tp-opacity': C.opacity.lucide,
  'tp-padding': C.padding.lucide,
  'tp-text-color': 'baseline',
  'tp-bg-color': 'paint-bucket',
  'tp-align-center': C.alignment.lucide,
  // View
  'tp-fullscreen': C.fullscreen.lucide,
  'tp-eyeline': C.eyeline.lucide,
  'tp-flip-h': C.flipHorizontal.lucide,
  'tp-flip-v': C.flipVertical.lucide,
  'tp-minimap': C.minimap.lucide,
  'tp-navigation': C.navigationPanel.lucide,
  'tp-nav-panel': C.navigationPanel.lucide,
  'tp-next-section': C.nextSection.lucide,
  'tp-prev-section': C.previousSection.lucide,
  'tp-progress-bar': C.progressIndicator.lucide,
  // System / utility
  'tp-pin': C.pin.lucide,
  'tp-detach': C.openInWindow.lucide,
  'tp-float': C.float.lucide,
  'tp-keep-awake': C.keepAwake.lucide,
  'tp-auto-pause': C.autoPause.lucide,
  'tp-quick-presets': 'layout-grid',
  'tp-refresh': C.refreshPinned.lucide,
  // Capture / TTS
  'tp-tts': 'audio-lines',
  'tp-tts-playing': 'audio-lines',
  'tp-tts-paused': 'circle-pause',
  'tp-tts-stop': 'square',
}

/**
 * Resolve a toolbar icon name for the active icon style.
 * In 'native' mode a `tp-*` name maps to its Lucide equivalent (falling through unchanged if it has
 * no mapping); in 'custom' mode the original `tp-*` name is used. Non-`tp-*` names pass through.
 */
export function resolveControlIcon(name: string, style: IconStyle = 'native'): string {
  return resolveToggleIcon(name, style).name
}

/** Marks a toolbar icon name as the control's second state: `toggleIcon('tp-pin', true)`. */
const ON_MARK = '+on'

/**
 * The icon name a toggle button shows: its own name while off, the name marked as its second
 * state while on. resolveToggleIcon turns the mark into the control's `on` symbol.
 */
export function toggleIcon(name: string, on: boolean): string {
  return on ? `${name}${ON_MARK}` : name
}

/** The `on` form of every control symbol that has one, by the symbol's Lucide name. */
const ON_FORMS: ReadonlyMap<string, ActionIcon> = new Map(
  Object.values(C as Record<string, ActionIcon>).filter(icon => icon.on).map(icon => [icon.lucide, icon]),
)

export interface ResolvedIcon {
  /** Icon name for Obsidian's setIcon. */
  readonly name: string
  /** Draw it solid (src/solid-icon.ts): the control is on and its on form is its own symbol filled. */
  readonly solid: boolean
}

/**
 * Resolve a toolbar icon name, with or without the second-state mark, for the active icon style.
 * Native: the Lucide symbol, and for a marked name the control's `on` symbol (CONTROL_ICONS), solid
 * where the map says so. Custom: the bespoke `tp-*` picture has one form per control, so a marked
 * name shows the same picture; the button's active style still says it is on.
 */
export function resolveToggleIcon(name: string, style: IconStyle = 'native'): ResolvedIcon {
  const on = name.endsWith(ON_MARK)
  const base = on ? name.slice(0, -ON_MARK.length) : name
  if (style === 'custom') return { name: base, solid: false }
  const lucide = CUSTOM_TO_LUCIDE[base] ?? base
  const form = on ? ON_FORMS.get(lucide) : undefined
  if (!form?.on) return { name: lucide, solid: false }
  return { name: form.on, solid: form.onSolid === true }
}
