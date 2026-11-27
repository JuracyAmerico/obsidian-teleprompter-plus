# WebSocket API Reference

Teleprompter Plus exposes a local WebSocket server that lets any language drive playback, query state, and react to changes. The server is the same bridge used by the Stream Deck plugin and the mobile remote.

- **Default endpoint:** `ws://127.0.0.1:8765`
- **Binding:** `127.0.0.1` by default. Set the host to `0.0.0.0` (Settings → Connection → Server → Host) to reach it from a phone on the same network. The connection is plain `http://` and `ws://`, not encrypted.
- **Auth:** none for clients on this computer (the Stream Deck). Since 0.12.10 any client on the network must present the install's **remote key**: as `?key=` on the remote page link, and as a first `{"type":"auth","token":"<key>"}` message on the WebSocket. The key is generated on first start and is in the link shown under Settings → Connection → Remote interface. `/health` needs no key.
- **Which addresses are accepted:** the `Host` header (HTTP) and `Origin` header (browser WebSocket) must name `localhost`, a loopback, a private (10/8, 172.16/12, 192.168/16) or link-local address. A Tailscale address (100.64.0.0/10), a `.local` name or a MagicDNS name is refused (HTTP 403, WebSocket close 4403) even with the right key; use the LAN IP.
- **Server lifecycle:** controlled from Settings → Connection (auto-start, port, restart)

For the high-level integration story see the main [README](../README.md). For the Stream Deck-specific action catalog see [stream-deck-actions.md](stream-deck-actions.md).

---

## Command format

Every command sent to the server is a JSON object with a `command` field. Commands that take a parameter read it from a named field next to `command`, and the name depends on the command (there is no generic `value` field):

```json
{
  "command": "set-speed",
  "speed": 3
}
```

| Command | Field |
|---|---|
| `set-speed` | `speed` (number) |
| `jump-to-header` | `index` (number, 0-based) |
| `jump-to-header-by-id` | `headerId` (string) |
| `scroll-up`, `scroll-down` | `amount` (number, default 100) |

The [command reference](#command-reference) below lists the field names of every command.

## State broadcasts

The server pushes a `state` message whenever anything observable changes, plus on demand via the `get-state` command:

```json
{
  "type": "state",
  "data": {
    "isPlaying": true,
    "speed": 2.5,
    "fontSize": 24,
    "scrollPosition": 1200,
    "maxScroll": 3000,
    "scrollPercentage": 40,
    "currentNote": "my-presentation.md",
    "currentNoteTitle": "My Presentation",
    "currentHeaderIndex": 0,
    "headers": [
      { "id": "header-0", "text": "Introduction", "level": 1 },
      { "id": "header-1", "text": "Background",   "level": 2 }
    ],
    "navigationVisible": false,
    "isCountingDown": false,
    "countdownSeconds": 3,
    "isPinned": false,
    "isKeepAwake": false,
    "isFullScreen": false,
    "focusMode": false,
    "eyelineVisible": true,
    "textAlignment": "left",
    "voiceTrackingActive": false,
    "voiceTrackingStatus": "off",
    "targetSeconds": 90,
    "elapsedSeconds": 42,
    "remainingSeconds": 48,
    "paceStatus": "on-track",
    "sessionState": "running",
    "wordsPerMinute": 150,
    "lastTake": null,
    "timestamp": 1697832000000
  }
}
```

Treat `timestamp` as monotonically increasing per session — use it to dedupe or sequence updates. Fields beyond `isPlaying`, `speed`, `fontSize`, the scroll fields, `currentNote`, `currentNoteTitle`, `headers`, `navigationVisible` and `timestamp` are optional: a key can be absent, so read it defensively. The shape is `TeleprompterState` in `src/websocket-server.ts`.

Rehearsal fields: `paceStatus` is `ahead`, `on-track`, `behind`, `over` or `unknown`; `remainingSeconds` is negative once the target is passed; `sessionState` is `idle`, `running`, `paused` or `finished`. `lastTake` is the card of the take that just ended (`kind`, `title`, `durationSeconds`, `targetSeconds`, `deltaSeconds`, `verdict`, `complete`, and `text`, the line the prompter shows), and `null` once reading moves on.

Other messages: `{"type":"connected","serverVersion":"1.0.0","capabilities":[...]}` on connect, `{"type":"pong"}` for `{"type":"ping"}`, and `{"type":"error","code":"...","message":"..."}` with `RATE_LIMIT`, `VALIDATION_ERROR`, `UNKNOWN_COMMAND`, `COMMAND_ERROR`, `INVALID_MESSAGE` or `PARSE_ERROR`.

---

## Example commands

```javascript
// Toggle play/pause
ws.send(JSON.stringify({ command: "toggle-play" }))

// Set speed to 3×
ws.send(JSON.stringify({ command: "set-speed", speed: 3 }))

// Jump to the second header (index 1)
ws.send(JSON.stringify({ command: "jump-to-header", index: 1 }))

// Manually request a state broadcast
ws.send(JSON.stringify({ command: "get-state" }))
```

The Stream Deck keys are a subset of these commands; [stream-deck-actions.md](stream-deck-actions.md) maps each key to its command.

---

## Command reference

Generated from the `registerCommand` calls in `src/main.ts` by `bun scripts/gen-ws-docs.ts`; a test fails when a registered command is missing from this table, and `bun scripts/gen-ws-docs.ts --check` fails when the table is stale. Do not edit between the markers.

The server does not check that a parameter is present; what a handler does without one is up to the handler (`scroll-up` and `scroll-down` fall back to 100). The limits shown are what the server refuses before any handler runs (`validateCommand`). While a floating window is open, other commands act on it rather than the main view.

<!-- BEGIN GENERATED: commands (bun scripts/gen-ws-docs.ts) -->

111 commands, in the order `src/main.ts` registers them.

| Command | Parameters | What it does |
|---|---|---|
| `toggle-play` | none | Starts or stops scrolling |
| `play` | none | Starts scrolling |
| `pause` | none | Stops scrolling |
| `increase-speed` | none | Speeds up by one step |
| `decrease-speed` | none | Slows down by one step |
| `set-speed` | `speed` (number): 0.1 to 100; then held to your speed limits (0.5 to 10 by default) | Sets the speed |
| `reset-to-top` | none | Back to the top, paused |
| `scroll-up` | `amount` (number): -10000 to 10000; default 100 | Scrolls up by hand |
| `scroll-down` | `amount` (number): -10000 to 10000; default 100 | Scrolls down by hand |
| `jump-to-header` | `index` (number): 0 to 1000; 0-based, in the order of the headers in the state message | Jumps to a section by position |
| `jump-to-header-by-id` | `headerId` (string): at most 200 characters, and none of `<>'"&\`; an `id` from the `headers` list of the state message | Jumps to a section by its id |
| `next-section` | none | Jumps to the next section |
| `previous-section` | none | Jumps to the previous section |
| `toggle-navigation` | none | Turns navigation on or off |
| `show-navigation` | none | Shows navigation |
| `hide-navigation` | none | Hides navigation |
| `get-state` | none | Asks for a fresh `state` message |
| `increase-font-size` | none | Larger text, by the font step |
| `decrease-font-size` | none | Smaller text, by the font step |
| `font-size-up` | none | Larger text (the Stream Deck key) |
| `font-size-down` | none | Smaller text (the Stream Deck key) |
| `set-font-size` | `fontSize` (number): 8 to 200; ignored unless inside Settings min and max font size | Sets the font size |
| `toggle-eyeline` | none | Turns eyeline on or off |
| `show-eyeline` | none | Shows eyeline |
| `hide-eyeline` | none | Hides eyeline |
| `toggle-focus-mode` | none | Turns focus mode on or off |
| `enable-focus-mode` | none | Turns focus mode on |
| `disable-focus-mode` | none | Turns focus mode off |
| `countdown-increase` | none | Longer pre-roll countdown |
| `countdown-decrease` | none | Shorter pre-roll countdown |
| `set-countdown` | `seconds` (number): 0 to 3600; the prompter holds it to 0 to 30 | Sets the pre-roll countdown length |
| `cycle-speed-preset` | none | Steps through the speed presets |
| `next-speed-preset` | none | Next speed preset |
| `prev-speed-preset` | none | Previous speed preset |
| `cycle-alignment` | none | Cycles text alignment |
| `cycle-progress-indicator` | none | Cycles the progress indicator style |
| `toggle-auto-pause` | none | Turns auto-pause on editor focus on or off |
| `start-countdown` | none | Stops scrolling and runs the pre-roll countdown; sent again while it runs, it cancels it |
| `toggle-pin` | none | Pins or unpins the note, locking what the prompter shows |
| `toggle-floating` | none | Opens the floating window, or closes it when open |
| `floating-unlock` | none | Unlocks a locked floating window, so clicks land on it again |
| `pin-note` | none | Pins the current note |
| `unpin-note` | none | Unpins the note |
| `refresh-pinned` | none | Refreshes the pinned note |
| `toggle-keep-awake` | none | Holds or releases the screen-awake hold |
| `enable-keep-awake` | none | Turns keep awake on |
| `disable-keep-awake` | none | Turns keep awake off |
| `toggle-fullscreen` | none | Turns fullscreen on or off |
| `enable-fullscreen` | none | Turns fullscreen on |
| `disable-fullscreen` | none | Turns fullscreen off |
| `line-height-increase` | none | Increases line height |
| `line-height-decrease` | none | Decreases line height |
| `padding-vertical-increase` | none | More space above and below the text |
| `padding-vertical-decrease` | none | Less space above and below the text |
| `padding-horizontal-increase` | none | More space left and right of the text |
| `padding-horizontal-decrease` | none | Less space left and right of the text |
| `color-preset-dark` | none | Applies the dark color preset |
| `color-preset-light` | none | Applies the light color preset |
| `color-preset-black` | none | Applies the black color preset |
| `color-preset-sepia` | none | Applies the sepia color preset |
| `color-preset-green` | none | Applies the green color preset |
| `color-preset-amber` | none | Applies the amber color preset |
| `font-preset-system` | none | Applies the system font preset |
| `font-preset-sans` | none | Applies the sans font preset |
| `font-preset-serif` | none | Applies the serif font preset |
| `font-preset-mono` | none | Applies the mono font preset |
| `font-preset-readable` | none | Applies the readable font preset |
| `font-preset-slab` | none | Applies the slab font preset |
| `toggle-flip-horizontal` | none | Turns flip horizontal on or off |
| `enable-flip-horizontal` | none | Turns flip horizontal on |
| `disable-flip-horizontal` | none | Turns flip horizontal off |
| `toggle-flip-vertical` | none | Turns flip vertical on or off |
| `enable-flip-vertical` | none | Turns flip vertical on |
| `disable-flip-vertical` | none | Turns flip vertical off |
| `toggle-scroll-sync` | none | Turns scroll sync with the editor on or off |
| `enable-scroll-sync` | none | Turns scroll sync on |
| `disable-scroll-sync` | none | Turns scroll sync off |
| `toggle-minimap` | none | Turns minimap on or off |
| `show-minimap` | none | Shows minimap |
| `hide-minimap` | none | Hides minimap |
| `letter-spacing-increase` | none | Increases letter spacing |
| `letter-spacing-decrease` | none | Decreases letter spacing |
| `opacity-increase` | none | Increases opacity |
| `opacity-decrease` | none | Decreases opacity |
| `toggle-view-mode` | none | Switches between rendered Markdown and plain text |
| `set-view-mode-rendered` | none | Rendered Markdown view |
| `set-view-mode-plain` | none | Plain text view |
| `detach-window` | none | Opens the prompter in its own window |
| `open-file` | `path` (string): vault-relative path of a note; unknown paths are ignored | Loads a note by vault path |
| `open-active-file` | none | Loads the note active in Obsidian |
| `voice-start` | none | Starts voice tracking if it is not running |
| `voice-stop` | none | Stops voice tracking if it is running |
| `voice-toggle` | none | Starts or stops voice tracking |
| `get-voice-status` | none | Asks for the voice tracking status |
| `set-scroll-position` | `position` (number): pixels; wins over `percentage` when both are sent<br>`percentage` (number): 0 to 100 | Moves to a position (multi-device sync) |
| `get-broadcast-status` | none | Reports whether network broadcast is on and its interval |
| `obs-connect` | none | Connects to OBS |
| `obs-disconnect` | none | Disconnects from OBS |
| `obs-get-status` | none | Reports the OBS connection, recording and streaming state |
| `obs-toggle-recording` | none | Starts or stops OBS recording |
| `obs-start-recording` | none | Starts OBS recording |
| `obs-stop-recording` | none | Stops OBS recording |
| `obs-toggle-streaming` | none | Starts or stops OBS streaming |
| `obs-start-streaming` | none | Starts OBS streaming |
| `obs-stop-streaming` | none | Stops OBS streaming |
| `obs-set-scene` | `scene` (string): scene name exactly as OBS shows it | Switches the OBS scene |
| `obs-get-scenes` | none | Reports the list of OBS scenes |
| `load-speaker-notes` | `content` (string): at most 1,000,000 characters; replaces the script; ignored when empty<br>`slide` (number): shown as "Slide n/total" in place of the note name<br>`totalSlides` (number): shown as "Slide n/total" in place of the note name | Shows the given text as the script (the Stage integration) |
| `toggleTTS` | none | Starts or stops reading aloud |
| `startTTS` | none | Starts reading aloud |
| `stopTTS` | none | Stops reading aloud |

<!-- END GENERATED: commands -->

## Custom-control scripts

### TypeScript / Bun

```typescript
// save as control.ts — run with: bun control.ts
const ws = new WebSocket('ws://127.0.0.1:8765')

ws.onopen = () => {
  ws.send(JSON.stringify({ command: 'play' }))

  setTimeout(() => {
    ws.send(JSON.stringify({ command: 'set-speed', speed: 5 }))
  }, 5000)
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data as string)
  if (msg.type === 'state') {
    console.log('speed:', msg.data.speed)
    console.log('position:', msg.data.scrollPercentage + '%')
  }
}
```

### Node.js

```javascript
const WebSocket = require('ws')
const ws = new WebSocket('ws://127.0.0.1:8765')

ws.on('open',    () => ws.send(JSON.stringify({ command: 'play' })))
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  if (msg.type === 'state') console.log(msg.data)
})
```

### Python

```python
import json, websocket  # pip install websocket-client

ws = websocket.create_connection('ws://127.0.0.1:8765')
ws.send(json.dumps({'command': 'play'}))

while True:
    msg = json.loads(ws.recv())
    if msg.get('type') == 'state':
        print(msg['data'])
```

### Browser (HTML page)

```html
<script>
  const ws = new WebSocket('ws://127.0.0.1:8765')
  ws.onopen = () => ws.send(JSON.stringify({ command: 'toggle-play' }))
</script>
```

---

## Reconnection

The plugin's auto-reconnection logic on the server side does not retry failed clients — clients are expected to reconnect themselves. A robust client pattern:

```typescript
function connect() {
  const ws = new WebSocket('ws://127.0.0.1:8765')
  ws.onclose = () => setTimeout(connect, 1000) // reconnect after 1s
  ws.onerror = () => ws.close()                // trigger reconnect
  return ws
}
```

---

## Security model

- **Loopback by default.** The server binds to `127.0.0.1` unless you change the host.
- **Remote key off this computer.** Local processes (the Stream Deck) connect without a key. Anything else, including a phone on your Wi-Fi, gets `401` on the page and `/api/state`, and the WebSocket closes unless it sends the key as its first message (see the close codes below). Before 0.12.10 a server on `0.0.0.0` accepted any device on the network, which could replace the script.
- **Rate limiting.** 50 messages per second per client; past that the server answers `RATE_LIMIT` and drops the message. At most 10 connected clients at once.
- **Browser origin check.** A browser WebSocket whose `Origin` is not a local or LAN address is closed with `4403`. Clients that send no `Origin` (the Stream Deck, scripts) are not affected.
- **Health check.** `GET /health` answers `{"status":"ok","clients":n,"version":"1.0.0"}` to anyone who can reach the port, key or not.
- **No encryption.** Traffic, including the `?key=` link, is plain HTTP and WebSocket. Use it on a network you trust. See [ATTACKSURFACE.md](../ATTACKSURFACE.md) for what is and is not protected.
- **Mobile remote.** The phone talks to the server directly over your network, so it needs the full link with `?key=` from Settings → Connection → Remote interface.

### WebSocket close codes

When a key is required, the first message must be `{"type":"auth","token":"<key>"}`:

| Code | Reason | When |
|---|---|---|
| `4001` | Authentication timeout | No key sent, or silence, for 5 seconds |
| `4002` | Invalid authentication | A JSON message that is not an auth message, or carries the wrong key |
| `4003` | Invalid auth message | The first message is not valid JSON |
| `1008` | Server at maximum capacity | The server is full |
| `4403` | Origin not allowed | A browser page from a public or unrecognised address opened the socket (before any key is read) |
