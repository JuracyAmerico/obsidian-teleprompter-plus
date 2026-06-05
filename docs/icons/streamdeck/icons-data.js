/* ============================================================
   Teleprompter Plus (T+) — Stream Deck icon set  (78 icons)
   Single source of truth. Loaded by the contact sheet AND read
   by the SVG exporter, so the family stays perfectly consistent.

   SYSTEM
   - 72-unit optical grid, ~14% safe padding, glyph ~64-72% of canvas.
   - Lucide-adjacent line grammar: 4.5px stroke, round caps + joins,
     fills only on primary glyphs / accent marks.
   - Background #16161c baked into every exported icon (themes/fonts
     bake their own background instead).
   - Signature: the brand "reading line" motif + eyeline caret.

   COLOUR ROLES
   - green  #4ade80 = start / connect / recording-on
   - red    #f87171 = stop / pause / disconnect
   - purple #a78bfa = speed / size / spacing / countdown / open
   - blue   #60a5fa = navigation / sections / flip / sync / cycle / spatial
   - neutral#cbd5e1 = plain toggles / info / misc

   ITEM SHAPE
   - glyph icon:  { id, color, note, inner }
   - text tile:   { id, color(=text), note, bg, text, font, fontSize, fontWeight, textY }
   ============================================================ */

var G = '#4ade80', R = '#f87171', P = '#a78bfa', B = '#60a5fa', N = '#cbd5e1';
var BG = '#16161c';

/* reusable directional arrows for the ± size/spacing family
   (identical grammar to font-up / font-down) */
var ARROW_UP   = `<path d="M52 50 L52 29"/><path d="M46 35 L52 28 L58 35"/>`;
var ARROW_DOWN = `<path d="M52 28 L52 49"/><path d="M46 43 L52 50 L58 43"/>`;

var TP_GROUPS = [
  {
    name: 'Playback',
    icons: [
      { id: 'tp-play', color: G,
        note: 'Solid play triangle — primary transport gets a filled glyph for instant read. Green = start.',
        inner: `<path d="M28 21 L28 51 L53 36 Z" fill="${G}"/>` },
      { id: 'tp-pause', color: R,
        note: 'Two solid bars. Red = pause/stop family.',
        inner: `<rect x="25" y="21" width="8" height="30" rx="4" fill="${R}"/><rect x="39" y="21" width="8" height="30" rx="4" fill="${R}"/>` },
      { id: 'tp-play-pause', color: N,
        note: 'Combined triangle + bars = play/pause toggle. Neutral = stateful toggle.',
        inner: `<path d="M21 23 L21 49 L39 36 Z" fill="${N}"/><rect x="44" y="23" width="6.5" height="26" rx="3.25" fill="${N}"/><rect x="53.5" y="23" width="6.5" height="26" rx="3.25" fill="${N}"/>` },
      { id: 'tp-reset-to-top', color: B,
        note: 'Up-arrow to a top bar = jump to the very top. Blue = navigation.',
        inner: `<line x1="22" y1="20" x2="50" y2="20"/><path d="M36 52 L36 30"/><path d="M26 39 L36 29 L46 39"/>` },
      { id: 'tp-open-teleprompter', color: P,
        note: 'THE BRAND MARK: prompter screen, three lines (middle = bright active reading line), left-pointing eyeline caret. Purple = open / T+.',
        inner: `<rect x="13" y="16" width="46" height="34" rx="7"/><line x1="22" y1="25" x2="41" y2="25" opacity="0.4"/><line x1="22" y1="33" x2="47" y2="33"/><line x1="22" y1="41" x2="37" y2="41" opacity="0.4"/><path d="M54 28 L49 33 L54 38"/>` },
    ]
  },
  {
    name: 'Speed',
    icons: [
      { id: 'tp-faster', color: P, note: 'Double chevron up = scroll faster. Purple = speed.',
        inner: `<path d="M22 41 L36 27 L50 41"/><path d="M22 52 L36 38 L50 52"/>` },
      { id: 'tp-slower', color: P, note: 'Double chevron down = scroll slower. Mirror of faster.',
        inner: `<path d="M22 27 L36 41 L50 27"/><path d="M22 38 L36 52 L50 38"/>` },
    ]
  },
  {
    name: 'Font size',
    icons: [
      { id: 'tp-font-up', color: P, note: 'Letter A + up arrow = increase font size. Purple = size.',
        inner: `<path d="M21 51 L31 23 L41 51"/><line x1="25.5" y1="42" x2="36.5" y2="42"/><path d="M52 51 L52 29"/><path d="M46 35 L52 28 L58 35"/>` },
      { id: 'tp-font-down', color: P, note: 'Letter A + down arrow = decrease font size. Mirror of font-up.',
        inner: `<path d="M21 51 L31 23 L41 51"/><line x1="25.5" y1="42" x2="36.5" y2="42"/><path d="M52 27 L52 49"/><path d="M46 43 L52 50 L58 43"/>` },
      { id: 'tp-font-reset', color: P, note: 'Letter A + circular reset arrow = reset to default size. Purple = size.',
        inner: `<path d="M20 51 L30 23 L40 51"/><line x1="24.5" y1="42" x2="35.5" y2="42"/><path d="M60 37 a9 9 0 1 1 -9 -9 c2.52 0 4.93 1 6.74 2.74 L60 33"/><path d="M60 28 v5 h-5"/>` },
    ]
  },
  {
    name: 'Spacing & Size',
    icons: [
      { id: 'tp-line-height-up', color: P, note: 'Text lines + up arrow = increase line height. Purple = size.',
        inner: `<line x1="13" y1="23" x2="39" y2="23"/><line x1="13" y1="36" x2="41" y2="36"/><line x1="13" y1="49" x2="35" y2="49"/>${ARROW_UP}` },
      { id: 'tp-line-height-down', color: P, note: 'Text lines + down arrow = decrease line height. Mirror.',
        inner: `<line x1="13" y1="23" x2="39" y2="23"/><line x1="13" y1="36" x2="41" y2="36"/><line x1="13" y1="49" x2="35" y2="49"/>${ARROW_DOWN}` },
      { id: 'tp-padding-vertical-up', color: P, note: 'Box with content + top/bottom space + up arrow = more vertical padding. Purple.',
        inner: `<rect x="12" y="16" width="31" height="40" rx="5"/><line x1="19" y1="33" x2="36" y2="33"/><line x1="19" y1="39" x2="36" y2="39"/>${ARROW_UP}` },
      { id: 'tp-padding-vertical-down', color: P, note: 'Box with content + top/bottom space + down arrow = less vertical padding. Mirror.',
        inner: `<rect x="12" y="16" width="31" height="40" rx="5"/><line x1="19" y1="33" x2="36" y2="33"/><line x1="19" y1="39" x2="36" y2="39"/>${ARROW_DOWN}` },
      { id: 'tp-padding-horizontal-up', color: P, note: 'Box with narrow content + side space + up arrow = more horizontal padding. Purple.',
        inner: `<rect x="12" y="16" width="31" height="40" rx="5"/><line x1="22" y1="24" x2="33" y2="24"/><line x1="22" y1="31" x2="33" y2="31"/><line x1="22" y1="38" x2="33" y2="38"/><line x1="22" y1="45" x2="33" y2="45"/>${ARROW_UP}` },
      { id: 'tp-padding-horizontal-down', color: P, note: 'Box with narrow content + side space + down arrow = less horizontal padding. Mirror.',
        inner: `<rect x="12" y="16" width="31" height="40" rx="5"/><line x1="22" y1="24" x2="33" y2="24"/><line x1="22" y1="31" x2="33" y2="31"/><line x1="22" y1="38" x2="33" y2="38"/><line x1="22" y1="45" x2="33" y2="45"/>${ARROW_DOWN}` },
      { id: 'tp-letter-spacing-up', color: P, note: 'Two letterforms on a baseline + up arrow = increase letter spacing. Purple.',
        inner: `<path d="M21 23 L21 47"/><path d="M35 23 L35 47"/><line x1="15" y1="51" x2="41" y2="51" opacity="0.45"/>${ARROW_UP}` },
      { id: 'tp-letter-spacing-down', color: P, note: 'Two letterforms on a baseline + down arrow = decrease letter spacing. Mirror.',
        inner: `<path d="M21 23 L21 47"/><path d="M35 23 L35 47"/><line x1="15" y1="51" x2="41" y2="51" opacity="0.45"/>${ARROW_DOWN}` },
      { id: 'tp-opacity-up', color: N, note: 'Half-filled circle (opacity) + up arrow = increase opacity. Neutral.',
        inner: `<circle cx="27" cy="36" r="15"/><path d="M27 21 A15 15 0 0 0 27 51 Z" fill="${N}"/>${ARROW_UP}` },
      { id: 'tp-opacity-down', color: N, note: 'Half-filled circle (opacity) + down arrow = decrease opacity. Mirror.',
        inner: `<circle cx="27" cy="36" r="15"/><path d="M27 21 A15 15 0 0 0 27 51 Z" fill="${N}"/>${ARROW_DOWN}` },
    ]
  },
  {
    name: 'Navigation',
    icons: [
      { id: 'tp-next-section', color: B, note: 'Down arrow landing on a section line = next section. Blue = navigation.',
        inner: `<path d="M36 20 L36 40"/><path d="M28 33 L36 41 L44 33"/><line x1="24" y1="52" x2="48" y2="52"/>` },
      { id: 'tp-previous-section', color: B, note: 'Up arrow off a section line = previous section. Mirror of next.',
        inner: `<line x1="24" y1="20" x2="48" y2="20"/><path d="M36 52 L36 32"/><path d="M28 39 L36 31 L44 39"/>` },
      { id: 'tp-scroll-up', color: B, note: 'Scrollbar thumb high + up arrow = scroll up. Blue = navigation.',
        inner: `<rect x="43" y="15" width="9" height="42" rx="4.5" opacity="0.35"/><rect x="43" y="15" width="9" height="18" rx="4.5" fill="${B}" stroke="none"/><path d="M26 50 L26 24"/><path d="M19 31 L26 24 L33 31"/>` },
      { id: 'tp-scroll-down', color: B, note: 'Scrollbar thumb low + down arrow = scroll down. Mirror of scroll-up.',
        inner: `<rect x="43" y="15" width="9" height="42" rx="4.5" opacity="0.35"/><rect x="43" y="39" width="9" height="18" rx="4.5" fill="${B}" stroke="none"/><path d="M26 24 L26 50"/><path d="M19 43 L26 50 L33 43"/>` },
      { id: 'tp-toggle-nav-panel', color: B, note: 'Screen with a left sidebar column = nav / outline panel toggle. Blue.',
        inner: `<rect x="14" y="18" width="44" height="36" rx="6"/><line x1="29" y1="18" x2="29" y2="54"/><line x1="20" y1="27" x2="24" y2="27"/><line x1="20" y1="36" x2="24" y2="36"/><line x1="20" y1="45" x2="24" y2="45"/>` },
      { id: 'tp-toggle-minimap', color: B, note: 'Screen with a stack of short lines on the right = minimap toggle. Blue.',
        inner: `<rect x="14" y="18" width="44" height="36" rx="6"/><line x1="44" y1="20" x2="44" y2="52" opacity="0.45"/><line x1="48" y1="27" x2="54" y2="27"/><line x1="48" y1="33" x2="54" y2="33"/><line x1="48" y1="39" x2="54" y2="39"/><line x1="48" y1="45" x2="54" y2="45"/><line x1="20" y1="30" x2="38" y2="30" opacity="0.35"/><line x1="20" y1="38" x2="33" y2="38" opacity="0.35"/>` },
    ]
  },
  {
    name: 'Display / View',
    icons: [
      { id: 'tp-toggle-eyeline', color: B, note: 'Dim screen + one bright reading line + eyeline caret = eyeline guide toggle. Signature T+ motif. Blue.',
        inner: `<rect x="14" y="18" width="44" height="36" rx="6" opacity="0.4"/><line x1="20" y1="36" x2="46" y2="36"/><path d="M54 31 L49 36 L54 41"/>` },
      { id: 'tp-toggle-focus-mode', color: B, note: 'Dim outer lines, one bright middle line, framing brackets = focus on the active line. T+ motif. Blue.',
        inner: `<line x1="22" y1="25" x2="46" y2="25" opacity="0.32"/><line x1="22" y1="47" x2="42" y2="47" opacity="0.32"/><line x1="22" y1="36" x2="50" y2="36"/><path d="M17 31 L13 31 L13 41 L17 41"/><path d="M55 31 L59 31 L59 41 L55 41"/>` },
      { id: 'tp-toggle-fullscreen', color: B, note: 'Four corner brackets = fullscreen / expand. Blue = spatial.',
        inner: `<path d="M24 31 L24 23 L32 23"/><path d="M48 23 L56 23 L56 31"/><path d="M56 41 L56 49 L48 49"/><path d="M32 49 L24 49 L24 41"/>` },
      { id: 'tp-detach-window', color: B, note: 'Window with an arrow shooting out the top-right = detach / pop-out window. Blue = spatial.',
        inner: `<path d="M52 22 V50 a4 4 0 0 1 -4 4 H18 a4 4 0 0 1 -4 -4 V20 a4 4 0 0 1 4 -4 H40"/><path d="M37 35 L56 16"/><path d="M44 16 H56 V28"/>` },
      { id: 'tp-flip-horizontal', color: B, note: 'Dashed vertical axis + two triangles facing outward = mirror left/right. Blue = spatial.',
        inner: `<line x1="36" y1="17" x2="36" y2="55" stroke-dasharray="2 7"/><path d="M30 26 L30 46 L18 36 Z"/><path d="M42 26 L42 46 L54 36 Z"/>` },
      { id: 'tp-flip-vertical', color: B, note: 'Dashed horizontal axis + two triangles facing outward = mirror up/down. Mirror of flip-H.',
        inner: `<line x1="17" y1="36" x2="55" y2="36" stroke-dasharray="2 7"/><path d="M26 30 L46 30 L36 18 Z"/><path d="M26 42 L46 42 L36 54 Z"/>` },
      { id: 'tp-toggle-keep-awake', color: N, note: 'Coffee cup with steam = keep display awake. Neutral = plain toggle.',
        inner: `<path d="M18 29 H45 V41 a9 9 0 0 1 -9 9 H27 a9 9 0 0 1 -9 -9 Z"/><path d="M45 32 H51 a5 5 0 0 1 0 11 H45"/><path d="M26 15 c-3 3 -3 6 0 9"/><path d="M36 15 c-3 3 -3 6 0 9"/>` },
      { id: 'tp-toggle-pin-window', color: N, note: 'Pushpin = pin window on top. Neutral = plain toggle.',
        inner: `<line x1="24" y1="20" x2="48" y2="20"/><path d="M29 20 L31 33 L41 33 L43 20"/><line x1="36" y1="33" x2="36" y2="52"/>` },
      { id: 'tp-toggle-view-mode', color: N, note: 'Two overlapping panels = switch view mode. Neutral = toggle.',
        inner: `<rect x="14" y="24" width="28" height="26" rx="5"/><rect x="30" y="16" width="28" height="26" rx="5" fill="${BG}"/>` },
      { id: 'tp-toggle-auto-pause', color: N, note: 'Pause bars inside a dashed (auto) ring = auto-pause toggle. Neutral.',
        inner: `<circle cx="36" cy="36" r="17" stroke-dasharray="2.5 5.5"/><rect x="29.5" y="27" width="5.5" height="18" rx="2.75" fill="${N}" stroke="none"/><rect x="38" y="27" width="5.5" height="18" rx="2.75" fill="${N}" stroke="none"/>` },
    ]
  },
  {
    name: 'Countdown',
    icons: [
      { id: 'tp-countdown-increase', color: P, note: 'Clock + plus badge = increase countdown. Purple = countdown.',
        inner: `<circle cx="33" cy="39" r="14"/><path d="M33 31 L33 39 L40 43"/><line x1="52" y1="17" x2="52" y2="29"/><line x1="46" y1="23" x2="58" y2="23"/>` },
      { id: 'tp-countdown-decrease', color: P, note: 'Clock + minus badge = decrease countdown. Mirror of increase.',
        inner: `<circle cx="33" cy="39" r="14"/><path d="M33 31 L33 39 L40 43"/><line x1="46" y1="23" x2="58" y2="23"/>` },
    ]
  },
  {
    name: 'Cycle',
    icons: [
      { id: 'tp-cycle-theme', color: B, note: 'Half-filled contrast circle + cycle-arrow badge = cycle colour theme. Blue = cycle.',
        inner: `<circle cx="31" cy="40" r="14"/><path d="M31 26 A14 14 0 0 0 31 54 Z" fill="${B}"/><path d="M60.5 19 a7.5 7.5 0 1 1 -7.5 -7.5 c2.1 0 4.11 0.833 5.62 2.28 L60.5 15.67"/><path d="M60.5 11.5 v4.17 h-4.17"/>` },
      { id: 'tp-cycle-speed-preset', color: B, note: 'Speed gauge + cycle-arrow badge = cycle speed preset. Blue = cycle.',
        inner: `<path d="M17 47 A16 16 0 0 1 49 47"/><circle cx="33" cy="47" r="2.5" fill="${B}"/><path d="M33 47 L44 37"/><path d="M60.5 19 a7.5 7.5 0 1 1 -7.5 -7.5 c2.1 0 4.11 0.833 5.62 2.28 L60.5 15.67"/><path d="M60.5 11.5 v4.17 h-4.17"/>` },
      { id: 'tp-next-speed-preset', color: B, note: 'Speed gauge + forward chevron = next speed preset. Blue.',
        inner: `<path d="M15 47 A16 16 0 0 1 47 47"/><circle cx="31" cy="47" r="2.5" fill="${B}"/><path d="M31 47 L42 37"/><path d="M52 13 L59 20 L52 27"/>` },
      { id: 'tp-previous-speed-preset', color: B, note: 'Speed gauge + back chevron = previous speed preset. Mirror.',
        inner: `<path d="M25 47 A16 16 0 0 1 57 47"/><circle cx="41" cy="47" r="2.5" fill="${B}"/><path d="M41 47 L52 37"/><path d="M20 13 L13 20 L20 27"/>` },
      { id: 'tp-cycle-text-alignment', color: B, note: 'Alignment lines + cycle-arrow badge = cycle text alignment. Blue = cycle.',
        inner: `<line x1="16" y1="30" x2="46" y2="30"/><line x1="22" y1="41" x2="42" y2="41"/><line x1="16" y1="52" x2="46" y2="52"/><path d="M60.5 19 a7.5 7.5 0 1 1 -7.5 -7.5 c2.1 0 4.11 0.833 5.62 2.28 L60.5 15.67"/><path d="M60.5 11.5 v4.17 h-4.17"/>` },
      { id: 'tp-cycle-progress-indicator', color: B, note: 'Progress bar + cycle-arrow badge = cycle progress indicator. Blue = cycle.',
        inner: `<rect x="14" y="40" width="40" height="11" rx="5.5"/><rect x="14" y="40" width="20" height="11" rx="5.5" fill="${B}" stroke="none"/><path d="M60.5 19 a7.5 7.5 0 1 1 -7.5 -7.5 c2.1 0 4.11 0.833 5.62 2.28 L60.5 15.67"/><path d="M60.5 11.5 v4.17 h-4.17"/>` },
    ]
  },
  {
    name: 'Text alignment',
    icons: [
      { id: 'tp-align-left', color: B, note: 'Left-ragged lines = align left. Blue.',
        inner: `<line x1="14" y1="22" x2="58" y2="22"/><line x1="14" y1="32" x2="42" y2="32"/><line x1="14" y1="42" x2="52" y2="42"/><line x1="14" y1="52" x2="38" y2="52"/>` },
      { id: 'tp-align-center', color: B, note: 'Centred lines = align centre. Blue.',
        inner: `<line x1="14" y1="22" x2="58" y2="22"/><line x1="22" y1="32" x2="50" y2="32"/><line x1="16" y1="42" x2="56" y2="42"/><line x1="26" y1="52" x2="46" y2="52"/>` },
      { id: 'tp-align-right', color: B, note: 'Right-ragged lines = align right. Blue.',
        inner: `<line x1="14" y1="22" x2="58" y2="22"/><line x1="30" y1="32" x2="58" y2="32"/><line x1="20" y1="42" x2="58" y2="42"/><line x1="34" y1="52" x2="58" y2="52"/>` },
    ]
  },
  {
    name: 'Progress',
    icons: [
      { id: 'tp-progress-bar', color: B, note: 'Track with a filled portion = progress bar indicator. Blue.',
        inner: `<rect x="13" y="30" width="46" height="12" rx="6"/><rect x="13" y="30" width="26" height="12" rx="6" fill="${B}" stroke="none"/>` },
      { id: 'tp-progress-time', color: B, note: 'Clock face = progress time indicator. Blue.',
        inner: `<circle cx="36" cy="36" r="16"/><path d="M36 26 L36 36 L44 41"/>` },
    ]
  },
  {
    name: 'Text-to-speech',
    icons: [
      { id: 'tp-tts-toggle', color: N, note: 'Speech bubble holding reading lines (middle bright) = TTS toggle. T+ motif. Neutral.',
        inner: `<path d="M16 19 H56 a4 4 0 0 1 4 4 V43 a4 4 0 0 1 -4 4 H32 L22 55 V47 H16 a4 4 0 0 1 -4 -4 V23 a4 4 0 0 1 4 -4 Z"/><line x1="22" y1="29" x2="46" y2="29" opacity="0.45"/><line x1="22" y1="37" x2="50" y2="37"/>` },
      { id: 'tp-tts-stop', color: R, note: 'Speech bubble + solid stop square = stop speaking. Red = stop.',
        inner: `<path d="M16 19 H56 a4 4 0 0 1 4 4 V43 a4 4 0 0 1 -4 4 H32 L22 55 V47 H16 a4 4 0 0 1 -4 -4 V23 a4 4 0 0 1 4 -4 Z"/><rect x="28" y="26" width="16" height="14" rx="2.5" fill="${R}"/>` },
      { id: 'tp-tts-next-sentence', color: B, note: 'Skip-forward (triangle + bar) = next sentence. Blue.',
        inner: `<path d="M25 25 L41 36 L25 47 Z"/><line x1="47" y1="25" x2="47" y2="47"/>` },
      { id: 'tp-tts-prev-sentence', color: B, note: 'Skip-back (triangle + bar) = previous sentence. Mirror.',
        inner: `<path d="M47 25 L31 36 L47 47 Z"/><line x1="25" y1="25" x2="25" y2="47"/>` },
      { id: 'tp-tts-speed-up', color: P, note: 'Fast-forward double triangle = read faster. Purple = speed.',
        inner: `<path d="M20 26 L34 36 L20 46 Z"/><path d="M36 26 L50 36 L36 46 Z"/>` },
      { id: 'tp-tts-speed-down', color: P, note: 'Rewind double triangle = read slower. Mirror.',
        inner: `<path d="M52 26 L38 36 L52 46 Z"/><path d="M36 26 L22 36 L36 46 Z"/>` },
    ]
  },
  {
    name: 'Sync / Utility',
    icons: [
      { id: 'tp-toggle-scroll-sync', color: B, note: 'Two curved arrows forming a loop = sync scrolling. Blue = sync.',
        inner: `<path d="M22 32 A15 15 0 0 1 49 28"/><path d="M49 19 L50 28.5 L41 30"/><path d="M50 40 A15 15 0 0 1 23 44"/><path d="M23 53 L22 43.5 L31 42"/>` },
      { id: 'tp-refresh-pinned', color: N, note: 'Refresh ring around a pinned dot = refresh pinned view. Neutral.',
        inner: `<path d="M50 36 a14 14 0 1 1 -14 -14 c3.92 0 7.67 1.556 10.485 4.262 L50 29.78"/><path d="M50 22 v7.778 h-7.778"/><circle cx="36" cy="36" r="3.4" fill="${N}"/>` },
      { id: 'tp-websocket-info', color: N, note: 'Info circle = connection / websocket info. Neutral = info.',
        inner: `<circle cx="36" cy="36" r="17"/><line x1="36" y1="34" x2="36" y2="46"/><circle cx="36" cy="27" r="1.8" fill="${N}"/>` },
    ]
  },
  {
    name: 'OBS',
    icons: [
      { id: 'tp-obs-connect', color: G, note: 'Linked chain (joined) = OBS connect. Green = connect.',
        inner: `<path d="M31 26 H25 a10 10 0 0 0 0 20 H31"/><path d="M41 26 H47 a10 10 0 0 0 0 20 H41"/><line x1="28" y1="36" x2="44" y2="36"/>` },
      { id: 'tp-obs-disconnect', color: R, note: 'Broken chain (gap) = OBS disconnect. Red = disconnect.',
        inner: `<path d="M31 26 H25 a10 10 0 0 0 0 20 H31"/><path d="M41 26 H47 a10 10 0 0 0 0 20 H41"/><line x1="27" y1="36" x2="32" y2="36"/><line x1="40" y1="36" x2="45" y2="36"/>` },
      { id: 'tp-record-start', color: G, note: 'Solid disc = start recording. Green = recording-on.',
        inner: `<circle cx="36" cy="36" r="13" fill="${G}"/>` },
      { id: 'tp-record-stop', color: R, note: 'Solid square = stop recording. Red = stop.',
        inner: `<rect x="23" y="23" width="26" height="26" rx="4" fill="${R}"/>` },
      { id: 'tp-record-toggle', color: N, note: 'Ringed dot = record toggle. Neutral = stateful toggle.',
        inner: `<circle cx="36" cy="36" r="14"/><circle cx="36" cy="36" r="6" fill="${N}"/>` },
      { id: 'tp-stream-start', color: G, note: 'Broadcast waves from a dot = start streaming. Green = start.',
        inner: `<circle cx="36" cy="36" r="4" fill="${G}"/><path d="M27 27 A13 13 0 0 0 27 45"/><path d="M45 27 A13 13 0 0 1 45 45"/><path d="M21 21 A21 21 0 0 0 21 51"/><path d="M51 21 A21 21 0 0 1 51 51"/>` },
      { id: 'tp-stream-stop', color: R, note: 'Broadcast waves with a stop square = stop streaming. Red = stop.',
        inner: `<rect x="31" y="31" width="10" height="10" rx="2" fill="${R}"/><path d="M27 27 A13 13 0 0 0 27 45"/><path d="M45 27 A13 13 0 0 1 45 45"/><path d="M21 21 A21 21 0 0 0 21 51"/><path d="M51 21 A21 21 0 0 1 51 51"/>` },
      { id: 'tp-stream-toggle', color: N, note: 'Broadcast waves, neutral = stream toggle.',
        inner: `<circle cx="36" cy="36" r="4" fill="${N}"/><path d="M27 27 A13 13 0 0 0 27 45"/><path d="M45 27 A13 13 0 0 1 45 45"/><path d="M21 21 A21 21 0 0 0 21 51"/><path d="M51 21 A21 21 0 0 1 51 51"/>` },
    ]
  },
  {
    name: 'Color themes',
    note: 'Choice tiles — each baked in its own theme background with a tiny “Aa” in the theme text colour.',
    icons: [
      { id: 'tp-theme-dark',          color: '#e6e6ee', bg: '#1e1e24', text: 'Aa', font: 'Helvetica, Arial, sans-serif', fontSize: 26, fontWeight: 600, textY: 45, note: 'Dark theme swatch.' },
      { id: 'tp-theme-light',         color: '#1d1d22', bg: '#f4f1ea', text: 'Aa', font: 'Helvetica, Arial, sans-serif', fontSize: 26, fontWeight: 600, textY: 45, note: 'Light theme swatch.' },
      { id: 'tp-theme-pure-black',    color: '#f5f5f5', bg: '#000000', text: 'Aa', font: 'Helvetica, Arial, sans-serif', fontSize: 26, fontWeight: 600, textY: 45, note: 'Pure-black theme swatch.' },
      { id: 'tp-theme-sepia',         color: '#5a4632', bg: '#efe2c4', text: 'Aa', font: 'Georgia, serif',               fontSize: 26, fontWeight: 600, textY: 45, note: 'Sepia theme swatch.' },
      { id: 'tp-theme-green-terminal',color: '#34ff77', bg: '#04140a', text: 'Aa', font: '"Courier New", monospace',     fontSize: 26, fontWeight: 700, textY: 45, note: 'Green-terminal theme swatch.' },
      { id: 'tp-theme-amber-retro',   color: '#ffb02e', bg: '#160f04', text: 'Aa', font: '"Courier New", monospace',     fontSize: 26, fontWeight: 700, textY: 45, note: 'Amber-retro theme swatch.' },
    ]
  },
  {
    name: 'Fonts',
    note: 'Choice tiles — a big “Aa” rendered in each font family on the dark key.',
    icons: [
      { id: 'tp-font-system',   color: '#e8e8ef', bg: BG, text: 'Aa', font: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 40, fontWeight: 600, textY: 49, note: 'System font sample.' },
      { id: 'tp-font-sans',     color: '#e8e8ef', bg: BG, text: 'Aa', font: 'Helvetica, Arial, sans-serif',                  fontSize: 40, fontWeight: 600, textY: 49, note: 'Sans-serif font sample.' },
      { id: 'tp-font-serif',    color: '#e8e8ef', bg: BG, text: 'Aa', font: 'Georgia, "Times New Roman", serif',             fontSize: 40, fontWeight: 600, textY: 49, note: 'Serif font sample.' },
      { id: 'tp-font-mono',     color: '#e8e8ef', bg: BG, text: 'Aa', font: '"Courier New", ui-monospace, monospace',        fontSize: 38, fontWeight: 600, textY: 49, note: 'Monospace font sample.' },
      { id: 'tp-font-readable', color: '#e8e8ef', bg: BG, text: 'Aa', font: 'Verdana, Tahoma, sans-serif',                   fontSize: 38, fontWeight: 500, textY: 49, note: 'Readable (humanist) font sample.' },
      { id: 'tp-font-slab',     color: '#e8e8ef', bg: BG, text: 'Aa', font: '"Roboto Slab", Rockwell, Georgia, serif',       fontSize: 40, fontWeight: 700, textY: 49, note: 'Slab-serif font sample.' },
    ]
  },
];

/* shared builder — keeps the contact sheet and the exporter identical.
   opts.preview = true  -> only bake a background for text tiles / themed tiles
   opts.preview = false -> always bake the background (for exported files)
   opts.grid    = true  -> draw the 14% safe-area overlay                       */
function TP_BUILD(ic, opts){
  opts = opts || {};
  var preview = !!opts.preview;
  var grid = opts.grid ? '<g stroke="#ffffff" stroke-width="0.6" opacity="0.16" fill="none">'
      + '<rect x="10" y="10" width="52" height="52"/>'
      + '<line x1="36" y1="6" x2="36" y2="66"/><line x1="6" y1="36" x2="66" y2="36"/></g>' : '';
  var bgColor = ic.bg || BG;
  var needBg = !preview || !!ic.text || !!ic.bg;
  var bg = needBg ? '<rect width="72" height="72" fill="' + bgColor + '"/>' : '';
  var body;
  if (ic.text){
    body = '<text x="36" y="' + (ic.textY || 47) + '" text-anchor="middle" font-family=\''
      + ic.font + '\' font-size="' + (ic.fontSize || 38) + '" font-weight="'
      + (ic.fontWeight || 600) + '" fill="' + ic.color + '">' + ic.text + '</text>';
  } else {
    body = '<g fill="none" stroke="' + ic.color + '" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">'
      + ic.inner + '</g>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72">'
    + bg + grid + body + '</svg>';
}

if (typeof window !== 'undefined'){
  window.TP_GROUPS = TP_GROUPS;
  window.TP_BUILD = TP_BUILD;
  window.TP_META = { BG: BG, colors: { G:G, R:R, P:P, B:B, N:N } };
}
