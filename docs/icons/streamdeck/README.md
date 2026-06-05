# Teleprompter Plus (T+) — Stream Deck icon set

40 cohesive Stream Deck button icons for the Teleprompter Plus Obsidian plugin.
Open **`Teleprompter Plus Icons.html`** for the live contact sheet.

## Design system
- **Grid:** 72-unit optical grid, ~14% safe padding, glyph ≈ 64–72% of canvas, a little extra room at the bottom for Elgato's title overlay.
- **Grammar:** Lucide-adjacent line style. **4.5px** stroke (the brand mark's 2px scaled up), round line-caps and joins. Fills only on primary transport glyphs (play / pause / record / stop) and small accent marks.
- **Background:** solid **`#16161c`** baked into every icon.
- **Signature:** the brand "reading line" motif — a brighter middle line + the left-pointing eyeline caret — recurs across `open-teleprompter`, `eyeline`, `focus-mode`, `tts-toggle`, `nav-panel`, `minimap`.

### Semantic colour roles (colour encodes meaning)
| Role | Hex | Meaning |
|---|---|---|
| green  | `#4ade80` | start · connect · recording-on |
| red    | `#f87171` | stop · pause · disconnect |
| purple | `#a78bfa` | speed · size · countdown · open (T+ accent) |
| blue   | `#60a5fa` | navigation · sections · flip · sync · spatial |
| neutral| `#cbd5e1` | plain toggles · info · misc |

## Files
- `icons/tp-*.svg` — 40 source SVGs (72×72, background baked).
- `icons/png-288/` — 288×288 PNG masters (**use these** — 4×, Elgato downscales crisply).
- `icons/png-144/` — 144×144 PNG (@2×).
- `icons-data.js` — single source of truth (paths + colours + notes). Edit here, then re-run the contact sheet / exporter to regenerate.

## Re-exporting
All geometry lives in `icons-data.js`. To tweak an icon, edit its `inner` path string (72-grid coords) or `color`, then regenerate the SVGs and PNGs. PNGs are produced by rasterising each SVG at 288 and 144.

## Icon index (metaphor · colour role)

**Playback**
- `tp-play` — solid play triangle · green (start)
- `tp-pause` — two solid bars · red
- `tp-play-pause` — triangle + bars combined · neutral (toggle)
- `tp-reset-to-top` — up-arrow to a top bar · blue (nav)
- `tp-open-teleprompter` — the brand mark: screen + 3 lines (bright middle) + eyeline caret · purple

**Speed**
- `tp-faster` — double chevron up · purple
- `tp-slower` — double chevron down · purple

**Font size**
- `tp-font-up` — "A" + up arrow · purple
- `tp-font-down` — "A" + down arrow · purple
- `tp-font-reset` — "A" + circular reset arrow · purple

**Navigation**
- `tp-next-section` — down arrow onto a section line · blue
- `tp-previous-section` — up arrow off a section line · blue
- `tp-toggle-nav-panel` — screen + left sidebar column · blue
- `tp-toggle-minimap` — screen + right line-stack · blue

**Display / View**
- `tp-toggle-eyeline` — dim screen + one bright line + caret · blue
- `tp-toggle-focus-mode` — dim lines, bright middle, framing brackets · blue
- `tp-toggle-fullscreen` — four corner brackets · blue
- `tp-flip-horizontal` — dashed vertical axis + outward triangles · blue
- `tp-flip-vertical` — dashed horizontal axis + outward triangles · blue
- `tp-toggle-keep-awake` — open eye · neutral
- `tp-toggle-pin-window` — pushpin · neutral

**Countdown**
- `tp-countdown-increase` — clock + plus · purple
- `tp-countdown-decrease` — clock + minus · purple

**Text-to-speech**
- `tp-tts-toggle` — speech bubble holding reading lines · neutral
- `tp-tts-stop` — speech bubble + solid stop square · red
- `tp-tts-next-sentence` — skip-forward · blue
- `tp-tts-prev-sentence` — skip-back · blue
- `tp-tts-speed-up` — fast-forward · purple
- `tp-tts-speed-down` — rewind · purple

**Sync / Utility**
- `tp-toggle-scroll-sync` — two curved sync arrows · blue
- `tp-refresh-pinned` — refresh ring around a pinned dot · neutral
- `tp-websocket-info` — info circle · neutral

**OBS**
- `tp-obs-connect` — joined chain link · green
- `tp-obs-disconnect` — broken chain link · red
- `tp-record-start` — solid disc · green
- `tp-record-stop` — solid square · red
- `tp-record-toggle` — ringed dot · neutral
- `tp-stream-start` — broadcast waves from a dot · green
- `tp-stream-stop` — broadcast waves + stop square · red
- `tp-stream-toggle` — broadcast waves · neutral
