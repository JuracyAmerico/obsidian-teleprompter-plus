# WebSocket API Reference

Teleprompter Plus exposes a local WebSocket server that lets any language drive playback, query state, and react to changes. The server is the same bridge used by the Stream Deck plugin and the mobile remote.

- **Default endpoint:** `ws://127.0.0.1:8765`
- **Binding:** loopback only — never exposed to LAN or internet by default
- **Auth:** none (loopback-only by design — running on `127.0.0.1` means only processes on the same machine can connect)
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

- **Loopback only.** The server binds to `127.0.0.1` — it is not reachable from the LAN or internet at the network level.
- **No authentication.** Any local process can connect and send commands. This is intentional and matches the Stream Deck / mobile-remote use case where a teleprompter is a single-user tool on a personal machine. Don't enable an externally-reachable port without adding your own auth layer.
- **Rate limiting.** The server applies per-client rate limits to prevent runaway scripts.
- **Mobile remote.** When you open the remote on your phone, it connects through Obsidian's existing session over the same loopback bridge — your phone does not talk to the server directly.
