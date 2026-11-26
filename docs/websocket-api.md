# WebSocket API Reference

Teleprompter Plus exposes a local WebSocket server that lets any language drive playback, query state, and react to changes. The server is the same bridge used by the Stream Deck plugin and the mobile remote.

- **Default endpoint:** `ws://127.0.0.1:8765`
- **Binding:** `127.0.0.1` by default. Set the host to `0.0.0.0` (Settings → Connection) to reach it from a phone on the same network.
- **Auth:** none for clients on this computer (the Stream Deck). Since 0.12.10 any client on the network must present the install's **remote key**: as `?key=` on the remote page link, and as a first `{"type":"auth","token":"<key>"}` message on the WebSocket. The key is generated on first start and is in the link shown under Settings → Remote interface.
- **Server lifecycle:** controlled from Settings → Connection (auto-start, port, restart)

For the high-level integration story see the main [README](../README.md). For the Stream Deck-specific action catalog see [stream-deck-actions.md](stream-deck-actions.md).

---

## Command format

Every command sent to the server is a JSON object with a `command` field and an optional `value`:

```json
{
  "command": "command-name",
  "value": 123
}
```

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
    "headers": [
      { "id": "header-0", "text": "Introduction", "level": 1 },
      { "id": "header-1", "text": "Background",   "level": 2 }
    ],
    "currentHeaderIndex": 0,
    "navigationVisible": false,
    "minimapVisible": true,
    "isFullscreen": false,
    "keepAwake": false,
    "isPinned": false,
    "scrollSyncEnabled": false,
    "isCountingDown": false,
    "countdownSeconds": 0,
    "flipHorizontal": false,
    "flipVertical": false,
    "timestamp": 1697832000000
  }
}
```

Treat `timestamp` as monotonically increasing per session — use it to dedupe or sequence updates.

---

## Example commands

```javascript
// Toggle play/pause
ws.send(JSON.stringify({ command: "toggle-play" }))

// Set speed to 3×
ws.send(JSON.stringify({ command: "set-speed", value: 3 }))

// Jump to the second header (index 1)
ws.send(JSON.stringify({ command: "jump-to-header", value: 1 }))

// Manually request a state broadcast
ws.send(JSON.stringify({ command: "get-state" }))
```

The full command list mirrors the Stream Deck action catalog — see [stream-deck-actions.md](stream-deck-actions.md) for all 55+ commands grouped by category.

---

## Floating window commands

| Command | What it does |
|---|---|
| `toggle-floating` | Opens the floating window, or closes it when open |
| `floating-unlock` | Unlocks a locked floating window, so clicks land on it again |

While a floating window is open, other commands act on it rather than the main view.

## Custom-control scripts

### TypeScript / Bun

```typescript
// save as control.ts — run with: bun control.ts
const ws = new WebSocket('ws://127.0.0.1:8765')

ws.onopen = () => {
  ws.send(JSON.stringify({ command: 'play' }))

  setTimeout(() => {
    ws.send(JSON.stringify({ command: 'set-speed', value: 5 }))
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
- **Remote key off this computer.** Local processes (the Stream Deck) connect without a key. Anything else, including a phone on your Wi-Fi, gets `401` on the page and `/api/state`, and the WebSocket closes with `4001` unless it sends the key. Before 0.12.10 a server on `0.0.0.0` accepted any device on the network, which could replace the script.
- **Rate limiting.** The server applies per-client rate limits to prevent runaway scripts.
- **Mobile remote.** The phone talks to the server directly over your network, so it needs the full link with `?key=` from Settings → Remote interface.
