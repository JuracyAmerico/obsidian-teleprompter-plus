# Stream Deck — Action Catalog

The Teleprompter Plus Stream Deck plugin has 60 keys, in the Obsidian Teleprompter Plus category. Each key sends one command to the plugin's WebSocket server and, where it shows state, repaints from the state the server broadcasts: the Play/Pause key follows playback, the Voice Tracking key follows the voice status, the Clock key shows the rehearsal clock. Change the teleprompter from the keyboard or the phone remote and the keys follow.

The deck connects to `ws://127.0.0.1:8765`. That address is fixed in the deck plugin. For the raw protocol and every command the server accepts, see [websocket-api.md](websocket-api.md).

This catalog is checked against the deck plugin's manifest (version 1.0.0.0, 60 actions). A test (`scripts/stream-deck-docs.test.ts`) fails when this page names a command the plugin no longer registers.

---

## Setup

1. **Install the Stream Deck software** from [Elgato](https://www.elgato.com/en/downloads).
2. **Install the Teleprompter Plus Stream Deck plugin.**
   - Manual install: clone [`JuracyAmerico/com.americo.obsidian-teleprompter.sdPlugin`](https://github.com/JuracyAmerico/com.americo.obsidian-teleprompter.sdPlugin) and follow its README.
   - Marketplace install: coming soon.
3. **Drag keys** from the Obsidian Teleprompter Plus category onto your Stream Deck profile.
4. **Verify** — open Teleprompter Plus in Obsidian and press the Clock key. It shows `--:--` while the deck cannot reach Obsidian, and the time as soon as it can.

The keys take no settings: a key sends its command with no parameters. Commands that need a value (`set-speed`, `jump-to-header`, `set-countdown`, `set-font-size`, `open-file`, and the others in the [command reference](websocket-api.md#command-reference)) have no key; send them from a script.

If a key is unresponsive, run *Show websocket info* from the Obsidian command palette to confirm the server is running.

---

## 1. Playback (4 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **Play/Pause** | `toggle-play` | Starts or stops scrolling; the key shows which |
| **Reset to Top** | `reset-to-top` | Back to the top, paused |
| **Scroll Up** | `scroll-up` | Scrolls up by hand (the server's default step, 100) |
| **Scroll Down** | `scroll-down` | Scrolls down by hand (the server's default step, 100). During voice tracking, voice follows the page. Works on an Elgato Stream Deck Pedal, with no need for the prompter to have focus |

## 2. Speed (5 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **Speed Up** | `increase-speed` | One step faster |
| **Speed Down** | `decrease-speed` | One step slower |
| **Cycle Speed Preset** | `cycle-speed-preset` | Steps through the speed presets |
| **Next Speed Preset** | `next-speed-preset` | Next preset |
| **Previous Speed Preset** | `prev-speed-preset` | Previous preset |

## 3. Text size and spacing (12 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **Font Size Up** | `font-size-up` | Larger text |
| **Font Size Down** | `font-size-down` | Smaller text |
| **Line Height Increase** | `line-height-increase` | More space between lines |
| **Line Height Decrease** | `line-height-decrease` | Less space between lines |
| **Letter Spacing Up** | `letter-spacing-increase` | Wider letters |
| **Letter Spacing Down** | `letter-spacing-decrease` | Tighter letters |
| **Padding Vertical Increase** | `padding-vertical-increase` | More space above and below the text |
| **Padding Vertical Decrease** | `padding-vertical-decrease` | Less space above and below the text |
| **Padding Horizontal Increase** | `padding-horizontal-increase` | More space left and right of the text |
| **Padding Horizontal Decrease** | `padding-horizontal-decrease` | Less space left and right of the text |
| **Opacity Up** | `opacity-increase` | More visible |
| **Opacity Down** | `opacity-decrease` | More see-through |

## 4. Colors and fonts (12 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **Color: Dark Mode** | `color-preset-dark` | Light gray on dark gray |
| **Color: Light Mode** | `color-preset-light` | Dark gray on light gray |
| **Color: Pure Black** | `color-preset-black` | White on black |
| **Color: Sepia** | `color-preset-sepia` | Brown on beige |
| **Color: Green Terminal** | `color-preset-green` | Green on black |
| **Color: Amber Retro** | `color-preset-amber` | Amber on black |
| **Font: System Default** | `font-preset-system` | System font |
| **Font: Sans-serif** | `font-preset-sans` | Modern sans-serif |
| **Font: Serif** | `font-preset-serif` | Traditional serif |
| **Font: Monospace** | `font-preset-mono` | Monospace |
| **Font: Readable** | `font-preset-readable` | Highly readable (Verdana, Tahoma) |
| **Font: Slab Serif** | `font-preset-slab` | Bold slab serif |

## 5. Navigation (4 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **Next Section** | `next-section` | Jumps to the next heading |
| **Previous Section** | `previous-section` | Jumps to the previous heading |
| **Toggle Navigation** | `toggle-navigation` | Shows or hides the section panel |
| **Minimap** | `toggle-minimap` | Shows or hides the abstract scrollbar |

## 6. Display and window (16 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **Toggle Eyeline** | `toggle-eyeline` | Shows or hides the eyeline marker |
| **Toggle Focus Mode** | `toggle-focus-mode` | Dims text outside the eyeline area |
| **Toggle Full-Screen** | `toggle-fullscreen` | Hides the controls, or brings them back |
| **Toggle Keep Awake** | `toggle-keep-awake` | Holds or releases the screen-awake hold. A hold set here stays until you end it; the "Keep screen awake while reading" setting holds it only while reading |
| **Toggle Pin Note** | `toggle-pin` | Pins or unpins the current note, locking what the prompter shows |
| **Refresh Pinned Note** | `refresh-pinned` | Refreshes the pinned note |
| **Detach Window** | `detach-window` | Opens the prompter in its own window |
| **Flip: Horizontal (Mirror)** | `toggle-flip-horizontal` | Mirrors the text, for a prompter mirror |
| **Flip: Vertical (Upside Down)** | `toggle-flip-vertical` | Flips the text upside down |
| **Scroll Sync** | `toggle-scroll-sync` | Syncs scrolling between the prompter and the editor |
| **Toggle View Mode** | `toggle-view-mode` | Switches between rendered Markdown and plain text |
| **Cycle Text Alignment** | `cycle-alignment` | Left, center, right, RTL |
| **Cycle Progress Indicator** | `cycle-progress-indicator` | Bar, scrollbar, none |
| **Toggle Auto-Pause** | `toggle-auto-pause` | Pauses when you click into the editor, or stops doing that |
| **Open Active File** | `open-active-file` | Loads the note that is active in Obsidian |
| **Cycle Theme** | none (deck only) | Switches the deck's own icons between the PAI Tron and Editorial themes; nothing is sent to Obsidian |

The floating window is not on the deck. Its two commands, `toggle-floating` and `floating-unlock`, exist on the server (see the [command reference](websocket-api.md#command-reference)) but the deck plugin has no key for them yet.

## 7. Countdown (3 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **Countdown Increase** | `countdown-increase` | Longer pre-roll countdown |
| **Countdown Decrease** | `countdown-decrease` | Shorter pre-roll countdown |
| **Start Countdown** | `start-countdown` | Stops scrolling and runs the pre-roll countdown |

## 8. Rehearsal clock (1 key)

| Key | Command | What it does |
|-----|---------|--------------|
| **Clock** | `get-state` | Shows the time left against the target, or the time elapsed when there is no target, and turns blue (ahead), green (on track), amber (behind), red (over) or gray (unknown, or not connected). After the target passes it counts up as `+m:ss`. Pressing it asks the server for a fresh state. The target is the one set on the bar, in the note's properties, or the default from settings |

## 9. Voice tracking (1 key)

| Key | Command | What it does |
|-----|---------|--------------|
| **Voice Tracking** | `voice-toggle` | Starts or stops voice-tracked scrolling. The picture follows the server's status: off, starting, listening, or error |

## 10. OBS (2 keys)

| Key | Command | What it does |
|-----|---------|--------------|
| **OBS Toggle Recording** | `obs-toggle-recording` | Starts or stops OBS recording; the key shows which |
| **OBS Toggle Streaming** | `obs-toggle-streaming` | Starts or stops OBS streaming; the key shows which |

---

## Troubleshooting

If the Stream Deck reports *Disconnected* or buttons don't update:

1. Confirm Obsidian is running with the Teleprompter Plus plugin enabled.
2. Run *Show websocket info* from Obsidian's command palette.
3. Keep the port at `8765`. The deck plugin connects to `ws://127.0.0.1:8765` and has no setting for another port or another computer, so a different port in Settings → Connection leaves the deck disconnected.
4. Settings → Connection → click *Restart*.
5. Check firewall rules — the deck connects over loopback (`127.0.0.1`), so loopback must be allowed. A deck on the same Mac needs no remote key.

For the full troubleshooting flow, see [troubleshooting.md](troubleshooting.md).
