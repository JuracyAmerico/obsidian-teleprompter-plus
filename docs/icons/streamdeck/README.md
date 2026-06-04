# Stream Deck key icons

Ready-to-use Stream Deck key icons for Teleprompter Plus — one per Obsidian command, generated
from the **same Lucide vocabulary** as the in-app toolbar (`src/icon-vocabulary.ts`), so a "play"
is the same glyph in Obsidian and on the deck.

- **Style:** dark rounded key with a semantically-coloured glyph — green = start, red = stop/pause,
  purple = speed/size/countdown, blue = navigation/sections/flip, neutral = toggles.
- **Files:** `tp-<command-id>.svg` (vector) and `tp-<command-id>.png` (288×288, for the Stream Deck
  app). The `<command-id>` matches the Teleprompter Plus Obsidian command it should trigger.

## How to use

The keys are images only — they don't carry the action. On your Stream Deck:

1. Add a key that triggers the Teleprompter Plus Obsidian command (via your Obsidian↔Stream Deck
   bridge, e.g. the Obsidian/Advanced URI action, KM Link, or a hotkey bound to the command).
2. Set that key's image to the matching `tp-<command-id>.png` here.

Command id ↔ key, e.g. `play` → `tp-play.png`, `increase-speed` → `tp-increase-speed.png`,
`toggle-fullscreen` → `tp-toggle-fullscreen.png`.

## Regenerating

```
bun run icons:streamdeck
```

Regenerates the SVGs from the vocabulary and rasterises them to PNG (needs `rsvg-convert`). Edit the
`KEYS` table or palette in `scripts/generate-streamdeck-icons.ts` to change glyphs, colours, or add
commands.
