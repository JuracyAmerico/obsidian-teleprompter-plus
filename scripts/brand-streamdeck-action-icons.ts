/**
 * Re-skin the Stream Deck PLUGIN action-list icons (the small glyphs in the
 * right-hand action picker) to match the bespoke T+ deck set.
 *
 * Action-list icons follow Elgato's TEMPLATE convention: a monochrome WHITE
 * glyph on a TRANSPARENT background, 20×20 (1×) + 40×40 (@2×). So we take each
 * mapped `docs/icons/streamdeck/tp-<id>.svg`, strip its baked #16161c key
 * background, recolour every palette hex to #ffffff, and rasterise to PNG.
 *
 * This ONLY touches `<name>.png` / `<name>@2x.png` per action (the picker icon).
 * It deliberately leaves on/off/key STATE images (the deck-key art) alone.
 *
 * Run:  bun scripts/brand-streamdeck-action-icons.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SVG_DIR = join(ROOT, 'docs', 'icons', 'streamdeck')
const PLUGIN = join(
  process.env.HOME!,
  'Library/Application Support/com.elgato.StreamDeck/Plugins',
  'com.americo.obsidian-teleprompter.sdPlugin',
)
const ACTIONS = join(PLUGIN, 'imgs', 'actions')

// action folder → bespoke tp-id. Base actions (no ± suffix) map to their primary glyph.
const MAP: Record<string, string> = {
  'align-center': 'tp-align-center', 'align-left': 'tp-align-left', 'align-right': 'tp-align-right',
  'auto-pause': 'tp-toggle-auto-pause',
  'color-amber': 'tp-theme-amber-retro', 'color-black': 'tp-theme-pure-black', 'color-dark': 'tp-theme-dark',
  'color-green': 'tp-theme-green-terminal', 'color-light': 'tp-theme-light', 'color-sepia': 'tp-theme-sepia',
  'countdown': 'tp-countdown-increase', 'countdown-down': 'tp-countdown-decrease', 'countdown-up': 'tp-countdown-increase',
  'cycle-alignment': 'tp-cycle-text-alignment', 'cycle-progress': 'tp-cycle-progress-indicator',
  'detach': 'tp-detach-window', 'eyeline': 'tp-toggle-eyeline',
  'flip-horizontal': 'tp-flip-horizontal', 'flip-vertical': 'tp-flip-vertical',
  'focus-mode': 'tp-toggle-focus-mode',
  'font-mono': 'tp-font-mono', 'font-readable': 'tp-font-readable', 'font-sans': 'tp-font-sans',
  'font-serif': 'tp-font-serif', 'font-slab': 'tp-font-slab', 'font-system': 'tp-font-system',
  'fontsize': 'tp-font-reset', 'fontsize-down': 'tp-font-down', 'fontsize-up': 'tp-font-up',
  'fullscreen': 'tp-toggle-fullscreen', 'keepawake': 'tp-toggle-keep-awake',
  'letterspacing-down': 'tp-letter-spacing-down', 'letterspacing-up': 'tp-letter-spacing-up',
  'lineheight': 'tp-line-height-up', 'lineheight-down': 'tp-line-height-down', 'lineheight-up': 'tp-line-height-up',
  'minimap': 'tp-toggle-minimap',
  'obs-record': 'tp-record-toggle', 'obs-record-new': 'tp-record-toggle',
  'obs-stream': 'tp-stream-toggle', 'obs-stream-new': 'tp-stream-toggle',
  'opacity-down': 'tp-opacity-down', 'opacity-up': 'tp-opacity-up',
  'open-file': 'tp-open-teleprompter',
  'padding-horizontal': 'tp-padding-horizontal-up', 'padding-horizontal-down': 'tp-padding-horizontal-down',
  'padding-horizontal-up': 'tp-padding-horizontal-up',
  'padding-vertical': 'tp-padding-vertical-up', 'padding-vertical-down': 'tp-padding-vertical-down',
  'padding-vertical-up': 'tp-padding-vertical-up',
  'pin': 'tp-toggle-pin-window', 'playpause': 'tp-play-pause',
  'progress-bar': 'tp-progress-bar', 'progress-time': 'tp-progress-time',
  'reset': 'tp-reset-to-top',
  'scroll-down': 'tp-scroll-down', 'scroll-sync': 'tp-toggle-scroll-sync', 'scroll-up': 'tp-scroll-up',
  'section-next': 'tp-next-section', 'section-previous': 'tp-previous-section',
  'speed-down': 'tp-slower', 'speed-preset': 'tp-cycle-speed-preset',
  'speed-preset-next': 'tp-next-speed-preset', 'speed-preset-prev': 'tp-previous-speed-preset',
  'speed-up': 'tp-faster', 'theme': 'tp-cycle-theme', 'view-mode': 'tp-toggle-view-mode',
}

const PALETTE = ['#4ade80', '#f87171', '#a78bfa', '#60a5fa', '#cbd5e1']

/** Strip the baked key background and force every glyph colour to white. */
function toMonochrome(svg: string): string {
  let out = svg.replace(/<rect[^>]*fill="#16161c"[^>]*><\/rect>/g, '')
  out = out.replace(/<rect[^>]*width="72"[^>]*height="72"[^>]*fill="#16161c"[^>]*\/?>/g, '')
  for (const hex of PALETTE) out = out.split(hex).join('#ffffff')
  return out
}

function rasterise(svgPath: string, pngPath: string, size: number) {
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', pngPath, svgPath])
}

function main() {
  const stamp = '20260605-action-icons'
  const backup = join(PLUGIN, 'imgs', `actions.backup.${stamp}`)
  if (!existsSync(backup)) {
    cpSync(ACTIONS, backup, { recursive: true })
    console.warn(`[brand] backed up actions/ → ${backup}`)
  }
  const tmp = join(ROOT, '.tmp-mono')
  mkdirSync(tmp, { recursive: true })

  let done = 0
  const missing: string[] = []
  for (const [folder, id] of Object.entries(MAP)) {
    const src = join(SVG_DIR, `${id}.svg`)
    const dir = join(ACTIONS, folder)
    if (!existsSync(src)) { missing.push(`${folder} → ${id}.svg (no source)`); continue }
    if (!existsSync(dir)) { missing.push(`${folder} (no action folder)`); continue }
    const mono = join(tmp, `${id}.svg`)
    writeFileSync(mono, toMonochrome(readFileSync(src, 'utf8')))
    rasterise(mono, join(dir, `${folder}.png`), 20)
    rasterise(mono, join(dir, `${folder}@2x.png`), 40)
    done++
  }
  console.warn(`[brand] re-skinned ${done}/${Object.keys(MAP).length} action-list icons`)
  if (missing.length) { console.warn('[brand] UNMAPPED:'); for (const m of missing) console.warn('  - ' + m) }
}

main()
