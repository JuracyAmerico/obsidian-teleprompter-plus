# Stream Deck — Action Catalog

Teleprompter Plus ships 55+ Stream Deck actions across 8 categories with real-time bidirectional state sync. The Stream Deck button updates live when you change the teleprompter from any source — keyboard, mobile remote, or another script.

The WebSocket bridge runs locally on `ws://127.0.0.1:8765` by default. For the raw protocol, see [websocket-api.md](websocket-api.md).

---

## Setup

1. **Install the Stream Deck software** from [Elgato](https://www.elgato.com/en/downloads).
2. **Install the Teleprompter Plus Stream Deck plugin.**
   - Manual install: clone [`JuracyAmerico/com.americo.obsidian-teleprompter.sdPlugin`](https://github.com/JuracyAmerico/com.americo.obsidian-teleprompter.sdPlugin) and follow its README.
   - Marketplace install: coming soon.
3. **Drag actions** from the Teleprompter Plus category onto your Stream Deck profile.
4. **Configure per-action parameters** where needed (specific speed, section index, etc.).
5. **Verify** — open Teleprompter Plus in Obsidian, drop the *Get State* action onto a key, press it. The Stream Deck should display the current state.

If a button is unresponsive, run *Show WebSocket Server Info* from the Obsidian command palette to confirm the server is running on the expected port.

---

## 1. Playback control (8 actions)

| Action | What it does |
|--------|--------------|
| **Play/Pause** | Toggle playback with live state indicator |
| **Play** | Start auto-scroll |
| **Pause** | Stop auto-scroll |
| **Reset to Top** | Jump to the beginning of the document |
| **Scroll Up** | Manual scroll up by the configured amount |
| **Scroll Down** | Manual scroll down by the configured amount |
| **Set Scroll Amount** | Configure the manual-scroll step size |
| **Get State** | Request a fresh state broadcast (useful for debugging) |

## 2. Speed control (5 actions)

| Action | What it does |
|--------|--------------|
| **Speed Up** | Increase scroll speed by the configured increment |
| **Speed Down** | Decrease scroll speed |
| **Set Speed** | Jump to a specific speed value |
| **Speed to Min** | Drop to the minimum (default `0.5`) |
| **Speed to Max** | Jump to the maximum (default `10`) |

## 3. Font size control (5 actions)

| Action | What it does |
|--------|--------------|
| **Font Size Up** | Increase by 2 px |
| **Font Size Down** | Decrease by 2 px |
| **Set Font Size** | Set a specific size (12–72 px) |
| **Font Size to Min** | Jump to 12 px |
| **Font Size to Max** | Jump to 72 px |

## 4. Navigation (7 actions)

| Action | What it does |
|--------|--------------|
| **Next Section** | Jump to next header |
| **Previous Section** | Jump to previous header |
| **Jump to Section** | Jump to a specific header by index |
| **First Section** | Jump to the first header |
| **Last Section** | Jump to the last header |
| **Toggle Navigation** | Show or hide the navigation panel |
| **Toggle Minimap** | Show or hide the abstract scrollbar |

## 5. Display (10 actions)

| Action | What it does |
|--------|--------------|
| **Toggle Fullscreen** | Enter or exit fullscreen |
| **Enter Fullscreen** | Force fullscreen on |
| **Exit Fullscreen** | Force fullscreen off |
| **Toggle Keep Awake** | Prevent or allow display sleep |
| **Enable Keep Awake** | Force on |
| **Disable Keep Awake** | Force off |
| **Toggle Pin Window** | Toggle always-on-top (macOS, Windows) |
| **Pin Window** | Force on |
| **Unpin Window** | Force off |
| **Toggle Scroll Sync** | Sync scroll with the source editor |

## 6. Countdown timer (5 actions)

| Action | What it does |
|--------|--------------|
| **Start Countdown** | Begin the configured countdown |
| **Cancel Countdown** | Stop the running countdown |
| **Set Countdown** | Set countdown duration in seconds |
| **Countdown 3s** | One-press 3-second countdown |
| **Countdown 5s** | One-press 5-second countdown |

## 7. Flip controls (8 actions)

| Action | What it does |
|--------|--------------|
| **Toggle Flip Horizontal** | Mirror text horizontally |
| **Toggle Flip Vertical** | Flip text vertically |
| **Toggle Flip Both** | Flip both axes |
| **Enable Flip Horizontal** | Force on |
| **Disable Flip Horizontal** | Force off |
| **Enable Flip Vertical** | Force on |
| **Disable Flip Vertical** | Force off |
| **Reset Flips** | Disable all flips |

## 8. Section management (7+ actions)

| Action | What it does |
|--------|--------------|
| **Expand All Sections** | Open every navigation item |
| **Collapse All Sections** | Close every navigation item |
| **Expand Section** | Open a specific section by index |
| **Collapse Section** | Close a specific section by index |
| **Toggle Section** | Expand or collapse a specific section |
| **Eyeline** | Custom position marker action |
| **Bookmarks** | Save and recall scroll positions |

---

## Troubleshooting

If the Stream Deck reports *Disconnected* or buttons don't update:

1. Confirm Obsidian is running with the Teleprompter Plus plugin enabled.
2. Run *Show WebSocket Server Info* from Obsidian's command palette.
3. Check the port matches what the Stream Deck plugin is configured against (default `8765`).
4. Settings → Connection → click *Restart server*.
5. Check firewall rules — the server binds to `127.0.0.1`, so loopback must be allowed.

For the full troubleshooting flow, see [troubleshooting.md](troubleshooting.md).
