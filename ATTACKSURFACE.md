# Attack Surface — Teleprompter Plus

> Engineering security reference. Maps every channel that accepts input or reaches outside the
> plugin, who can reach it, and what stops abuse. Verified against source 2026-11-26 (0.12.13);
> the previous pass was 2026-07-09 (0.11.x). SURF-05 and SURF-06 (command injection) fixed in
> 0.11.4. SURF-12 to SURF-15 were added for the LAN bind and remote key (0.12.10), the saved
> read-aloud audio (0.12.13) and the take log (0.12.13); each lists what remains.

`isDesktopOnly: true` — the plugin runs in Electron with full Node access (`child_process`, `fs`,
`require`). That is the reason a filename or note can matter beyond the sandbox.

## Summary

| ID | Surface | Who can reach it | Severity | Status |
|----|---------|------------------|----------|--------|
| SURF-01 | Local WebSocket control server | Any local process; web pages served from a local or LAN address | Low | Hardened in 0.11.3; loopback needs no key (below) |
| SURF-02 | Local HTTP endpoints (`/api/state` etc.) | Any local process; with the host on `0.0.0.0`, the network (key needed) | Low | Hardened in 0.11.3 and 0.12.10 |
| SURF-03 | Mobile remote interface (served HTML/JS) | Whoever loads the remote URL with the key | Low | Clean (textContent) |
| SURF-04 | Markdown note → renderer/DOM | Author of any opened/synced note | Low | Sanitized |
| SURF-05 | PDF filename → `pdftotext` shell | Anyone who can place a PDF in the vault | HIGH (RCE) | Fixed in 0.11.4 |
| SURF-06 | Kokoro `venvPython` shell exec | Local env (vault path) | Low | Fixed in 0.11.4 |
| SURF-07 | Local TTS subprocesses (`say`, `afplay`, python, apple sidecar) | Note content (spoken) | Info | Safe (array args) |
| SURF-08 | ElevenLabs cloud egress | Opt-in (needs API key) | Medium (privacy) | By design, disclosed |
| SURF-09 | Vosk model download | Opt-in | Low (supply chain) | By design |
| SURF-10 | OBS WebSocket (outbound) | LAN OBS instance | Low | By design |
| SURF-11 | Debug error-log write | Plugin internal | Info | Safe (fixed path) |
| SURF-12 | Server on `0.0.0.0` (LAN) and the remote key | Any device on the network the computer is on | Medium when enabled | Mitigated in 0.12.10; residuals below |
| SURF-13 | Host and Origin policy limits | Browser pages on a private address; Tailscale and `.local` users | Low | By design, one availability gap |
| SURF-14 | Saved read-aloud audio (IndexedDB) | Code in the same Obsidian install; whoever has the computer | Low (privacy) | By design, disclosed here |
| SURF-15 | Take log `takes.json` | Whoever can read the vault's `.obsidian` folder | Info | By design |

---

## SURF-05 — PDF filename command injection (HIGH, RCE) — FIXED in 0.11.4

`src/TeleprompterApp.svelte` `extractPDFText()` **used to** build a shell string:

```ts
const fullPath = pathMod.join(adapter.basePath, filePath)      // filePath = the PDF's vault path
const text = cp.execSync(`pdftotext -layout "${fullPath}" -`, …) // string -> /bin/sh -c  ← RCE
```

`execSync` runs through a shell. **Double-quoting did not neutralize the filename**: inside double
quotes `sh` still evaluates `$(…)` and backticks, and a literal `"` closes the quote. A PDF whose
*name* contained shell metacharacters executed arbitrary commands the moment the user opened it.

- **Was triggerable by:** opening a PDF named e.g. `` `id>/tmp/pwned`.pdf `` or `a";open -a Calculator;"b.pdf`.
- **Delivery:** the injection is in the **filename**, not the content — a shared/synced vault, a
  downloaded file dropped into the vault, or a repo of notes was a realistic vector. No content
  parsing needed; the shell ran before `pdftotext` even read the file.
- **Impact:** arbitrary local command execution with the user's privileges.

**Fix shipped (removes the shell entirely):** `execFileSync` with an argument array — args are passed
to the process directly, never parsed by a shell, so a filename cannot inject.

```ts
const cp = require('child_process') as {
  execFileSync: (file: string, args: string[], opts: Record<string, unknown>) => string
}
const text = cp.execFileSync('pdftotext', ['-layout', fullPath, '-'],
  { encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 }) as string
```

Regression-locked by `src/exec-safety.test.ts`: a `"`, `$(…)`, or backtick payload in a path argument
is proven inert under `execFileSync`, and the old string form is proven to have injected.

## SURF-06 — Kokoro venvPython shell exec (Low) — FIXED in 0.11.4, same class

`src/tts/kokoro-engine.ts` **used** `execSync(\`"${venvPython}" -c "import mlx_audio"\`, …)`. Same
string-to-shell pattern, but `venvPython` is a plugin-internal path, exploitable only if the vault
install path itself contained shell metacharacters (user's own environment, not attacker-delivered).
Fixed the same way: `execFileSync(venvPython, ['-c', 'import mlx_audio'], …)`.

## SURF-06b — Kokoro generation Python-code injection (HIGH, RCE) — FIXED in 0.11.6

Found by a cross-vendor (GPT-5.4/Forge) review: the 0.11.4 fix above hardened only the *availability
probe*. The actual audio-generation path (`generateWav` + `startPregen`) still built a Python **script
string** by raw interpolation — `voice="${voiceId}", speed=${speed}` — and ran it via
`spawn(python, ['-c', script])`. `voiceId`/`speed` came from `settings.ttsVoice`/`ttsRate`, which
`validateSettings` never checked and Kokoro never matched against its own `KOKORO_VOICES` allowlist.
A `ttsVoice` like `af_heart", speed=1.0)\nimport os\nos.system('id')\n#` in a synced/shared `data.json`
(or an imported settings/profile) executed arbitrary Python on the next TTS play. **Gated on the victim
having the mlx-tts venv installed** (Kokoro is the live engine). Fixed by resolving `voiceId` against the
allowlist and coercing `speed` to a clamped number *before* interpolation (`src/tts/kokoro-safety.ts`,
tested). Lesson logged: the 0.11.4 patch fixed the probe the finding named and missed the sibling sink.

## SURF-01 / SURF-02 — Local control server (Hardened in 0.11.3 and 0.12.10)

WebSocket + HTTP on one port (default `8765`), **auto-started by default** (`autoStartWebSocket: true`),
bound to `127.0.0.1` unless the user sets another host (SURF-12). Localhost binding does not protect
against a malicious *website*, whose JS runs in the user's browser (on localhost).

- **Fixed in 0.11.3:** WS upgrade validates `Origin` (blocks Cross-Site WebSocket Hijacking; no-Origin
  non-browser clients still pass); HTTP validates the `Host` header (blocks DNS rebinding); the
  `Access-Control-Allow-Origin: *` header was removed (it let any site read `/api/state`). Policy in
  `src/net-access.ts` (see SURF-13 for exactly what it accepts).
- **Existing controls:** per-client rate limit (50 messages a second), numeric and string bounds on commands
  (`validateCommand`), at most 10 connected clients, a 5 s timeout for the first (auth) message when a key is required,
  and the remote key for anything off this computer (SURF-12).
- **Dead config:** `WebSocketServerConfig.authToken` still exists, but `startWebSocketServer()` in `src/main.ts`
  never sets it, so the only secret in play is the remote key.
- **Residual (unchanged, by design):** a client on this computer needs no key. `isLoopbackAddress` exempts
  every connection whose socket address is loopback, so any *local* process, and any web page whose
  Origin passes SURF-13 (a dev server on `localhost`, a page on a LAN address), can read `/api/state`
  (note path, title, heading outline) and send any of the 111 commands. A key requirement on
  loopback would break the Stream Deck, which sends none; an Origin rule that is tighter for
  loopback connections would not (SURF-13).

## SURF-03 — Mobile remote interface (Clean)

`remote-interface.html/.ts` served by SURF-02, runs in the phone browser, connects back via WS. All
server data (section labels, titles, status, and the take card text added in 0.12.13) is written with
**`textContent`**, never `innerHTML` — checked 2026-11-26: no `innerHTML`, `outerHTML`,
`insertAdjacentHTML` or `document.write` in `src/remote-interface.ts` or `.html`. No XSS sink. Since 0.12.10 the
page is served only to a client that carries the key (`401` otherwise), and the page forwards the `key` of its own URL as
the first WebSocket message. The page itself holds no per-install data; the key lives only in the link.

## SURF-04 — Markdown note → renderer (Sanitized; ReDoS fixed in 0.11.5)

Note content is rendered with `marked` and injected via Obsidian's **`sanitizeHTMLToDom`** (no XSS sink).
Embedded-note recursion is depth/circular-ref guarded. Trust note: a synced/shared note is authored by
someone else, but the sanitizer is the boundary and it is used consistently.

**Raw-HTML injection (fixed 0.11.6):** the primary note render did `{@html marked.parse(content)}` with
**no sanitizer** — marked preserves raw inline HTML, so a synced note's `<img onerror=…>` / `<svg onload=…>`
reached the DOM on open (confirmed injection; RCE plausible, depends on Obsidian's CSP). The *embedded-note*
path already sanitized identical output; the main path didn't. Fixed by routing the main render through
`sanitizeHTMLToDom` too — which preserves the safe tags + `data-*`/`class`/`id` the pipeline (images,
embeds, callouts) and navigation (`data-header-id`) rely on. A render-path duplicate of the
`stripPandocAttributes` ReDoS regex (missed in 0.11.5, only the text-cleaner copy was bounded) was also
bounded here.

**ReDoS (fixed 0.11.5):** a deeper audit found three *quadratic* backtracking regexes running on raw
note/.bib content — `stripPandocAttributes` (text-cleaner), the bracketed-citation regex and the
`.bib` entry lookahead (citation-resolver). A synced note of `"[".repeat(100000)` (with a bib
configured, default-on) or `"{".repeat(100000)` (on read-aloud) froze the main thread. Fixed by
bounding the char classes / end anchor; regression-locked by `src/parser/redos.test.ts` (pathological
100k-char input must finish <1s). Two lower items shipped in 0.11.5 too: `say` argv now has a `--`
terminator (arg-injection hardening, `mac-say-engine.ts`), and Settings→Export / Save-as-Profile now
strip `elevenLabsApiKey` + `obsPassword` via `redactSecrets` (`settings-secrets.ts`, tested).

## SURF-07 — Local TTS subprocesses (Safe)

`say`, `afplay`, kokoro python, and the apple-speech sidecar are all launched with
`spawn(cmd, [args])` — **array args, no shell**, so the spoken note text cannot inject commands. Note
content is processed locally by these binaries (no network).

## SURF-08 — ElevenLabs cloud egress (Medium, by design)

If the user enables the ElevenLabs TTS engine and supplies a key, the **script text is sent to
`api.elevenlabs.io`** over HTTPS with an `xi-api-key` header. The key is stored in `data.json`
(plaintext — standard for Obsidian plugins). This is disclosed to the user in a `Notice` before use.
Privacy consideration: prompter script leaves the machine. Offline engines (Kokoro, macOS `say`, Web
Speech) remain available.

## SURF-09 — Vosk model download (Low, supply chain)

Voice-tracking models are downloaded from `alphacephei.com` over HTTPS on opt-in. Trusts that host and
transport; no signature check on the model zip. Low risk, standard for the feature.

## SURF-10 — OBS WebSocket, outbound (Low)

The plugin is a *client* connecting out to `ws://<obsHost>:<obsPort>` (LAN, user-configured) with the
user's OBS password. No inbound surface.

## SURF-11 — Debug error-log write (Safe)

`fs.appendFileSync` to a **fixed** path under the plugin's own dir (`…/plugins/teleprompter-plus/
error-log.jsonl`). Path is not attacker-influenced; content is JSON-encoded error data.

---

## SURF-12 — Server on `0.0.0.0` and the remote key (Medium when enabled; mitigated in 0.12.10)

**What it is.** The Host setting (Settings → Connection → Server) accepts `127.0.0.1` (the default), `localhost`,
`0.0.0.0` or any IPv4 literal. Set to `0.0.0.0`, the server listens on every interface, so it is reachable from
whatever network the computer is on, not only the home Wi-Fi: a café, a hotel, a conference. This is the
setting the phone remote needs. The plugin shows a Notice when the host is not local, and the Settings text
recommends `127.0.0.1`. Before 0.12.10 nothing else stood in the way: any device on the network could connect and
drive the prompter, including replacing the script (`load-speaker-notes`).

**What protects it (`src/websocket-server.ts`, `src/main.ts`).**

- A **remote key**: 16 bytes from `crypto.getRandomValues`, 32 hex characters, made on first start and kept in `data.json`
  (`startWebSocketServer()`, `src/main.ts`).
- **HTTP:** a request from a non-loopback address needs `?key=<key>` on every path except `/health` and `/api/health`;
  otherwise `401`. The decision uses `req.socket.remoteAddress`, not a header the client controls.
- **WebSocket:** a non-loopback client must send `{"type":"auth","token":"<key>"}` as its first message within 5 s;
  a wrong key closes with `4002`, a timeout with `4001`. Only then is it added to the client list and sent state.
- Loopback clients (the Stream Deck on this Mac) need no key.
- Regression: `src/remote-key.test.ts` (loopback detection, the key in the link, server and page wiring).

**What remains.**

1. **No encryption.** The key rides in the URL of a plain `http://` request and in a plain `ws://` message. Anyone who can
   watch the Wi-Fi traffic sees it once and can reuse it; so can anyone who sees the link (the phone's history, a screenshot of
   Settings, a chat message). The remote key does not rotate on its own and the UI has no button to rotate it
   (clearing `remoteKey` in `data.json` makes the next start generate a new one).
2. **The key is not on the secret list.** `SECRET_SETTING_KEYS` in `src/settings-secrets.ts` holds only
   `elevenLabsApiKey` and `obsPassword`. Settings → Export and Save-as-Profile run `redactSecrets` and so still write
   `remoteKey` into the file (checked: `SECRET_SETTING_KEYS.includes('remoteKey')` is `false`). A shared profile or
   exported settings file carries a working key to anyone who can reach the server, and importing a file overwrites your key
   with the one in it. Fix: add `remoteKey` to the list.
3. **A key is full control.** Every registered command works for a keyed client: replace the script
   (`load-speaker-notes`), start or stop OBS recording and streaming (`obs-*`, using the saved OBS connection), start
   read-aloud (`toggleTTS`, which spends ElevenLabs credits when that engine is on), and `open-file` any vault note by
   path (it loads on screen, and from reading the code its path, title and heading outline then come back in `state`; unknown
   paths are ignored). File contents are not sent back.
4. **`/health` is open** to anyone on the network: it answers `{"status":"ok","clients":n,"version":"1.0.0"}`, which tells a scanner
   the port is this plugin and how many clients are connected.
5. **Unauthenticated sockets are not counted.** The 10-client cap is checked against `clients`, and a socket joins `clients`
   only after it authenticates, so a device on the network can open many sockets that each wait out the 5 s auth
   timeout. It cannot do more than hold sockets open: it never gets state or commands.
6. **The key is compared with `!==`** and a wrong guess costs one new connection. At 128 bits this is not a practical
   attack; it is noted because there is no lockout either.
7. **The link may show the wrong address.** `getLocalNetworkUrl()` returns the first non-internal IPv4 address of
   `os.networkInterfaces()`. With a VPN or Tailscale adapter listed before the Wi-Fi one, the link carries that address
   (see SURF-13).

## SURF-13 — Host and Origin policy limits (Low)

`src/net-access.ts` accepts a name only if it is `localhost`, `*.localhost`, IPv6 loopback, fc00::/7, fe80::/10, or an
IPv4 address in 127/8, 10/8, 172.16/12, 192.168/16 or 169.254/16 (the IPv4 ranges are `net-access.ts:52-56`). Everything else,
including every hostname, is refused.

- **Tailscale and `.local` do not work (verified).** Tailscale addresses (100.64.0.0/10, the CGNAT block), mDNS names
  (`macbook.local`) and MagicDNS names (`*.ts.net`) are not in that list. Calling `isHttpHostAllowed` gave `false` for
  `100.73.241.35:8765`, `macbook.local:8765` and `mac.tail1234.ts.net:8765`, and `true` for `192.168.2.40:8765`. In a
  stand-in with the same wiring (an `http` server plus `ws` on the same server, the same `isHttpHostAllowed`) a request with
  `Host: 100.73.241.35:8765` got `403` and `Host: mac.local:8765` got `403`. So a phone that opens
  `http://100.x.y.z:8765/?key=…` gets `403 Forbidden` on the page, key or no key (`handleHttpRequest`,
  `websocket-server.ts:407-411`), and the phone remote cannot be reached over Tailscale by address. Use the LAN address.
  A non-browser WebSocket client does not go through the Host check: in the stand-in an upgrade with
  `Host: 100.73.241.35:8765` was accepted with no HTTP handler hit (the `ws` library handles upgrades itself). It
  is checked only by Origin, and a script sends none, so a script over Tailscale reaches the key check, and with the right key
  it connects. This was not run against the plugin inside Obsidian.
- **Private-address pages pass the Origin check.** A browser page whose Origin is a private or LAN address (a router admin
  page, an IoT device's web page, a dev server on `localhost:3000`) is allowed, because the phone page itself has a LAN Origin. The
  page runs in a browser on this computer, so it connects over loopback and needs no key. A web page cannot be served
  from a public domain, but it can be served from any device on the LAN that the user is lured to. Fix, not applied:
  for a loopback connection, accept only an absent Origin or a loopback Origin; the phone, which is not loopback, keeps the LAN rule and the key.
- A request with **no `Host`** header (HTTP/1.0) or **no `Origin`** (every non-browser client) passes the policy; the key still
  applies off this computer.

## SURF-14 — Saved read-aloud audio, IndexedDB (Low, privacy; added 0.12.13)

`src/tts/speech-audio-store.ts`. When the ElevenLabs engine is selected, each synthesized sentence is kept as MP3 bytes in an
IndexedDB database named `teleprompter-plus-speech-audio` (object stores `audio` and `meta`), so it replays without a new charge.
The database is created the first time the store is read or written, so a user who never selects ElevenLabs never gets one.

- **Where it lives.** IndexedDB is per origin, not per vault: every vault opened in the same Obsidian install shares one
  database, and other plugins in that install can read it, as they can read any file the plugin can (a plugin has full Node access
  already, so this adds no new boundary). It sits in Obsidian's own browser storage, not in the vault folder, so a vault sync does not copy it.
- **What is in it.** The cache key is `JSON.stringify([modelId, voiceId, stability, similarity, previousText, nextText, text])`
  (`speechCacheKey`, `elevenlabs-request.ts`): the plaintext of each sentence read aloud and the sentences on either
  side, as the record key, next to the audio. The API key is not stored. Deleting a note, or the whole vault, does not delete
  its read-aloud audio.
- **Bounds.** 200 MB by default (`elevenLabsAudioCacheMb`), least recently used evicted first. A clip larger than the cap is not kept.
  A damaged record, no IndexedDB, or quota exhaustion is a cache miss, never an error.
- **Clearing.** The command *Clear read-aloud audio cache* empties it. `onunload` does not, and disabling or uninstalling the
  plugin leaves the database in place. Clear it before uninstalling if the scripts were sensitive.
- It carries the same privacy fact as SURF-08: the script text goes to ElevenLabs when the engine is on; this surface adds that
  the text, and the audio of it, then also stays on this computer until evicted or cleared.

## SURF-15 — Take log `takes.json` (Info; added 0.12.13)

`src/take-store.ts`, `src/take-log.ts`. One JSON file, `takes.json`, in the plugin's own folder
(`<vault>/.obsidian/plugins/teleprompter-plus/takes.json`), written through Obsidian's vault adapter. Each take holds the
note path, `section` or `script`, the section title, duration, target and date: no script text. At most 5,000 entries; the oldest
are dropped first.

- **Writes** are queued one after another (a read-modify-write of the whole file), so two takes ending together do not overwrite
  each other. A failed write is reported and never interrupts a rehearsal.
- **Reads** never throw: a missing, empty, broken or foreign file is an empty log, and entries that fail validation
  (`isEntry`) are skipped, so a hand-edited or synced file cannot crash the prompter.
- **Exposure.** It names the notes you rehearsed and when. It sits in the vault's `.obsidian` folder, so Obsidian Sync or another
  vault sync carries it to your other devices. Nothing reads it over the network: no WebSocket command returns the log (the
  `state` message carries only the latest take card, with the section title and times).

---

## Recommended order of work

1. ~~**SURF-05**~~ — done in 0.11.4 (`execFileSync`, the only RCE).
2. ~~**SURF-06**~~ — done in 0.11.4, bundled with #1.
3. **SURF-12 item 2** — add `remoteKey` to `SECRET_SETTING_KEYS` so Export and Save-as-Profile stop writing it. Smallest fix, real leak.
4. **SURF-13** — for loopback connections, accept only an absent or loopback Origin. Decide whether Tailscale addresses (100.64.0.0/10) should be accepted for the phone remote: today they get `403`.
5. **SURF-12 items 1 and 4** — a "new remote key" button; consider answering `/health` with less (or only to loopback).
6. **SURF-01/02 defense-in-depth** (optional) — default a random token or default-off, if you want belt-and-suspenders on the local server.
7. **SURF-08 / SURF-14** — already acceptable; revisit only if you want at-rest key encryption or the read-aloud text out of the cache keys.
