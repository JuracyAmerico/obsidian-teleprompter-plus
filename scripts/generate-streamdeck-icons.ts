/**
 * Stream Deck key icon generator for Teleprompter Plus.
 *
 * Renders one key per Obsidian command, using the SAME Lucide glyph vocabulary as the in-app
 * toolbar (so a "play" is the same symbol in Obsidian and on the deck) — composed as a dark rounded
 * key with a SEMANTICALLY coloured glyph (green = start, red = stop, purple = speed/size, blue =
 * navigate, neutral = toggle), matching the PAI Stage deck style.
 *
 * Source glyphs: `lucide-static` (devDep). Output: docs/icons/streamdeck/tp-<command>.svg
 * (rasterise to PNG afterward with rsvg-convert — see scripts note / README).
 *
 * Run:  bun scripts/generate-streamdeck-icons.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LUCIDE_DIR = join(ROOT, 'node_modules', 'lucide-static', 'icons')
const OUT_DIR = join(ROOT, 'docs', 'icons', 'streamdeck')

// Semantic palette (tuned for legibility on a dark key).
const C = {
  green: '#4ade80',   // start / connect / record-on
  red: '#f87171',     // stop / pause / disconnect
  purple: '#a78bfa',  // speed / size / countdown / open (the T+ accent family)
  blue: '#60a5fa',    // navigation / sections / flip / sync
  neutral: '#cbd5e1', // toggles / info / misc
} as const
type ColorKey = keyof typeof C

const BG = '#16161c'
const BORDER = 'rgba(255,255,255,0.07)'

// command id → [lucide glyph, color, short label]. Glyphs mirror src/icon-vocabulary.ts where the
// control overlaps; +/- pairs use distinct directional glyphs so they read at a glance on the deck.
const KEYS: Array<[string, string, ColorKey, string]> = [
  ['open-teleprompter', 'monitor-play', 'purple', 'Open'],
  ['websocket-info', 'wifi', 'neutral', 'Server'],
  ['increase-font-size', 'a-arrow-up', 'purple', 'Font +'],
  ['decrease-font-size', 'a-arrow-down', 'purple', 'Font −'],
  ['reset-font-size', 'a-large-small', 'purple', 'Font ↺'],
  ['toggle-play-pause', 'play', 'green', 'Play'],
  ['play', 'play', 'green', 'Play'],
  ['pause', 'pause', 'red', 'Pause'],
  ['reset-to-top', 'arrow-up-to-line', 'blue', 'Top'],
  ['increase-speed', 'rabbit', 'purple', 'Faster'],
  ['decrease-speed', 'turtle', 'purple', 'Slower'],
  ['next-section', 'chevron-right', 'blue', 'Next'],
  ['previous-section', 'chevron-left', 'blue', 'Prev'],
  ['toggle-navigation', 'panel-right', 'blue', 'Nav'],
  ['toggle-eyeline', 'eye', 'neutral', 'Eyeline'],
  ['toggle-focus-mode', 'focus', 'neutral', 'Focus'],
  ['toggle-fullscreen', 'maximize', 'neutral', 'Full'],
  ['toggle-minimap', 'map', 'blue', 'Minimap'],
  ['toggle-pin', 'pin', 'neutral', 'Pin'],
  ['refresh-pinned', 'refresh-cw', 'neutral', 'Refresh'],
  ['toggle-keep-awake', 'coffee', 'neutral', 'Awake'],
  ['countdown-increase', 'alarm-clock-plus', 'purple', 'Count +'],
  ['countdown-decrease', 'alarm-clock-minus', 'purple', 'Count −'],
  ['toggle-flip-horizontal', 'flip-horizontal-2', 'blue', 'Flip H'],
  ['toggle-flip-vertical', 'flip-vertical-2', 'blue', 'Flip V'],
  ['toggle-scroll-sync', 'link-2', 'blue', 'Sync'],
  ['obs-connect', 'plug', 'green', 'Connect'],
  ['obs-disconnect', 'unplug', 'red', 'Disconn'],
  ['obs-toggle-recording', 'disc', 'neutral', 'Rec'],
  ['obs-start-recording', 'circle', 'green', 'Rec ●'],
  ['obs-stop-recording', 'square', 'red', 'Rec ■'],
  ['obs-toggle-streaming', 'radio', 'neutral', 'Stream'],
  ['obs-start-streaming', 'radio', 'green', 'Live'],
  ['obs-stop-streaming', 'square', 'red', 'End'],
  ['tts-toggle', 'audio-lines', 'neutral', 'Speak'],
  ['tts-stop', 'square', 'red', 'Stop'],
  ['tts-next-sentence', 'skip-forward', 'blue', 'Next'],
  ['tts-prev-sentence', 'skip-back', 'blue', 'Prev'],
  ['tts-speed-up', 'fast-forward', 'purple', 'TTS +'],
  ['tts-speed-down', 'rewind', 'purple', 'TTS −'],
]

const FALLBACK = 'square'

/** Pull the inner markup out of a lucide-static SVG (drop the outer <svg> wrapper). */
function lucideInner(glyph: string): string | null {
  const p = join(LUCIDE_DIR, `${glyph}.svg`)
  if (!existsSync(p)) return null
  const raw = readFileSync(p, 'utf8')
  const m = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
  return m ? m[1].trim() : null
}

function keySvg(inner: string, color: string): string {
  // 144×144 key. Glyph is lucide's 24×24 coordinate space scaled ×3.5 (=84px) and centred.
  // Lucide paths use stroke="currentColor", so `color:` on the group recolours them.
  const scale = 3.5
  const size = 24 * scale
  const offset = (144 - size) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect x="1.5" y="1.5" width="141" height="141" rx="30" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" style="color:${color}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${inner}
  </g>
</svg>
`
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const missing: string[] = []
  let written = 0
  for (const [id, glyph, colorKey, label] of KEYS) {
    let inner = lucideInner(glyph)
    if (inner === null) {
      missing.push(`${id} → ${glyph}`)
      inner = lucideInner(FALLBACK) ?? '<circle cx="12" cy="12" r="9"/>'
    }
    writeFileSync(join(OUT_DIR, `tp-${id}.svg`), keySvg(inner, C[colorKey]))
    written++
    void label
  }
  console.warn(`[streamdeck-icons] wrote ${written} keys → ${OUT_DIR}`)
  if (missing.length) {
    console.warn(`[streamdeck-icons] ${missing.length} glyph(s) NOT found in lucide-static (used fallback):`)
    for (const m of missing) console.warn(`  - ${m}`)
  } else {
    console.warn('[streamdeck-icons] all glyphs resolved ✓')
  }
}

main()
