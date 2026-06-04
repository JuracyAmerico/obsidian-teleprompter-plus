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

export type IconStyle = 'native' | 'custom'

/** `tp-*` custom icon name → Lucide icon name. Lucide is Obsidian's built-in set (theme-aware). */
export const CUSTOM_TO_LUCIDE: Record<string, string> = {
  // Playback
  'tp-play': 'play',
  'tp-pause': 'pause',
  'tp-play-pause': 'play',
  'tp-reset-top': 'arrow-up-to-line',
  'tp-speed-up': 'gauge',
  'tp-speed-down': 'gauge',
  'tp-countdown-up': 'timer',
  // Typography / display
  'tp-font-up': 'a-large-small',
  'tp-font-down': 'a-large-small',
  'tp-font-reset': 'a-large-small',
  'tp-font-system': 'type',
  'tp-line-height': 'stretch-vertical',
  'tp-letter-spacing': 'move-horizontal',
  'tp-opacity': 'blend',
  'tp-padding': 'frame',
  'tp-text-color': 'baseline',
  'tp-bg-color': 'paint-bucket',
  'tp-align-center': 'align-center',
  // View
  'tp-fullscreen': 'maximize',
  'tp-eyeline': 'eye',
  'tp-flip-h': 'flip-horizontal-2',
  'tp-flip-v': 'flip-vertical-2',
  'tp-minimap': 'map',
  'tp-navigation': 'panel-right',
  'tp-nav-panel': 'panel-left',
  'tp-next-section': 'chevrons-right',
  'tp-prev-section': 'chevrons-left',
  'tp-progress-bar': 'loader',
  // System / utility
  'tp-pin': 'pin',
  'tp-detach': 'picture-in-picture-2',
  'tp-keep-awake': 'coffee',
  'tp-auto-pause': 'circle-pause',
  'tp-quick-presets': 'layout-grid',
  'tp-refresh': 'refresh-cw',
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
  if (style === 'custom') return name
  return CUSTOM_TO_LUCIDE[name] ?? name
}
