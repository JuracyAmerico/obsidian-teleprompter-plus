# Attack Surface — Teleprompter Plus

> **Applies to 0.12.18** (the release after 0.12.17; until it ships, branch `integrate`). **Verified against source 2026-11-27.**
> Every `file:line` below was read in that tree. A claim that was not checked in code says so in the same sentence.
> Earlier passes: 2026-11-26 (0.12.13), 2026-07-09 (0.11.x).

Teleprompter Plus is desktop only (`isDesktopOnly: true` in `manifest.json`). It runs inside Obsidian's Electron renderer with
full Node access (`child_process`, `fs`, `http`), so a file name, a note or a setting can matter beyond a browser sandbox.

## Scope and attacker model

Five attackers, from the least to the most trusted. Each surface below names the ones that can reach it.

| Attacker | What they control | In scope? |
|----------|-------------------|-----------|
| **Vault content author** | Notes, PDFs, images and other files in a vault you open: a shared or synced vault, a downloaded folder of notes, a Git repo of notes | **Yes.** Opening or prompting their files must not run code, reach the network or change settings. |
| **Settings-file author** | A settings export or profile file you import, or a profile in a `data.json` they share | **Yes.** Importing or applying it must not take secrets or widen network use without your yes (SURF-17). |
| **LAN device** | Any device on the network the computer is on (home Wi-Fi, a café, a conference) | **Yes.** Only reaches the plugin when you set the server host off loopback (SURF-12). |
| **Local web page** | A page open in a browser on this computer | **Yes.** Public sites are refused (SURF-01, SURF-13); pages with a local or private address are not (SURF-13). |
| **Local process** | A program running as you on this computer | **Partly.** It can already do what you can, so it is out of scope except where the plugin lends it something it would not have: a key-free control channel (SURF-01) and the microphone (SURF-07). |
| **Someone with the computer** | Your unlocked computer or its disk | Out of scope as an attacker; listed so you know what is on disk (§ Data at rest). |

**Not defended: whoever can write the vault's `.obsidian` folder.** The plugin's code (`.obsidian/plugins/teleprompter-plus/main.js`)
sits in the same folder as its settings (`data.json`). Anyone who can change that folder (a sync that carries plugins, a shared Git
vault with `.obsidian` committed) can replace the plugin itself, so `data.json` is treated as yours: on load it is checked for format
(`validateSettings`, `src/main.ts:1526`) but its choices are not questioned. Do not sync `.obsidian/plugins` from people you do not trust.

[SECURITY.md](SECURITY.md) states the same scope for reports.

## Severity legend

- **Critical**: code execution or full control with no action beyond opening something.
- **High**: code execution, or control of the prompter, OBS or the microphone, that needs one plausible action.
- **Medium**: private data leaves the computer, or control from the network once you have opted in.
- **Low**: limited data disclosure, denial of service, or a weakness that needs an unusual setup.
- **Info**: worth knowing; no attack.

**Before fix** is the severity when the surface was found. **Residual now** is what is left in this version.

## Summary

| ID | Surface | Who can reach it | Before fix | Residual now | Status |
|----|---------|------------------|-----------|--------------|--------|
| SURF-01 | Local WebSocket control server | Local process; local web page with a local Origin | High | Low | Hardened 0.11.3; loopback needs no key |
| SURF-02 | Local HTTP endpoints | Local process; LAN device with the key | Medium | Low | Hardened 0.11.3, 0.12.10 |
| SURF-03 | Phone remote page (served HTML/JS) | Whoever opens the link with the key | Low | Info | No HTML sink |
| SURF-04 | Note → renderer (raw HTML, ReDoS) | Vault content author | High | Low | Fixed 0.11.5, 0.11.6 |
| SURF-05 | PDF file name → shell | Vault content author | Critical | None | Fixed 0.11.4 |
| SURF-06 | Kokoro `venvPython` → shell | Local setup only | Low | None | Fixed 0.11.4 |
| SURF-06b | Kokoro voice/speed → Python source | Settings-file author | High | None | Fixed 0.11.6 |
| SURF-07 | Local programs it starts (speech helper, `say`, `afplay`, Python, `pdftotext`) and their temp files | Vault content author (text only); local process | Low | Low | Array arguments; residuals below |
| SURF-08 | ElevenLabs (cloud read-aloud) | You, by choosing it | Medium | Medium | By design, disclosed |
| SURF-09 | Vosk model download and cache | Network path to `alphacephei.com` | Low | Low | By design, no signature |
| SURF-10 | OBS WebSocket (outbound) | Whoever is at the OBS host | Low | Low | By design |
| SURF-11 | `voice-trace.jsonl` (opt-in diagnostics) | Anyone who reads the vault's `.obsidian` folder | Medium | Low | Capped and opt-in in 0.12.18 |
| SURF-12 | Server on the LAN and the remote key | LAN device | High | Medium | Key since 0.12.10; residuals below |
| SURF-13 | Host and Origin policy | Local web page with a private address | Medium | Low | One availability gap, one open fix |
| SURF-14 | Saved read-aloud audio (IndexedDB) | Someone with the computer; other plugins | Low | Low | By design, disclosed |
| SURF-15 | Take log `takes.json` | Anyone who reads the vault's `.obsidian` folder | Info | Info | By design |
| SURF-16 | Loading the `ws` module | Clean install (availability); local process (code on disk) | Medium | None | Bundled in 0.12.18 |
| SURF-17 | Profiles and imported settings | Settings-file author | High | Low | Narrowed, validated, consent in 0.12.18 |
| SURF-18 | Kokoro model download (Hugging Face) | Network path to Hugging Face | Low | Low | Outside the plugin's code |

---

## SURF-01 / SURF-02 — Local control server

WebSocket and HTTP on one port (default `127.0.0.1:8765`, `src/settings.ts:270-271`), started with Obsidian unless *Auto-start
server* is off (`autoStartWebSocket`, `src/main.ts:177`). The `ws` module is bundled (SURF-16).

**What a client can do.** 111 commands are registered (`registerCommand` in `src/main.ts`; the generated table is in
[docs/websocket-api.md](docs/websocket-api.md)). Among them:

- replace the script on screen with any text (`load-speaker-notes`, `src/main.ts:1259`), rendered through the same sanitizer as a note (SURF-04);
- open a vault note by path (`open-file`, `src/main.ts:1140`): markdown only since 0.12.14 (`src/commands.ts:419-423` drops any other
  path); unknown paths are ignored. The note's path, title and heading outline then come back in `state`; its text does not;
- pin the note on screen (`pin-note`, `src/main.ts:937`) and unlock the floating window (`floating-unlock`, `src/main.ts:933`);
- **turn the microphone on**: `voice-start` and `voice-toggle` (`src/main.ts:1157`, `1165`) start voice tracking, which starts the
  speech helper or Vosk. Recognition is on-device, and what it hears is not sent to clients: `state` carries only the voice
  status and the scroll position (`TeleprompterState`, `src/websocket-server.ts:191-240`);
- drive OBS with the saved connection: start and stop recording or streaming (`src/main.ts:1221`, `1233`), switch scenes
  (`obs-set-scene`, `1241`) and list scene names (`obs-get-scenes`, `1249`, sent to every client in `state`);
- start read-aloud (`toggleTTS`, `startTTS`, `src/main.ts:1271-1278`), which spends ElevenLabs credits when that engine is on.

**What protects it.**

- **Origin check on the WebSocket upgrade** (`src/websocket-server.ts:627-631`): a browser Origin that is not a local or private address is
  closed with `4403`; no Origin (every non-browser client) passes. Policy in `src/net-access.ts:84-91`.
- **Host check on HTTP** (`src/websocket-server.ts:404-409`, `src/net-access.ts:96-99`): a `Host` header that is not local gets `403`,
  which stops DNS rebinding. An absent `Host` passes. No `Access-Control-Allow-Origin` header is sent, so a public page cannot read a response.
- Only `GET` (and an empty `OPTIONS`) is answered (`src/websocket-server.ts:412-423`).
- 50 messages a second per client (`src/websocket-server.ts:320`), at most 10 connected clients (`317`; an 11th is closed with `1008`, `634-636`),
  numeric and string bounds on command fields (`validateCommand`, `542`).
- The remote key for every client that is not on this computer (SURF-12).

**Routes** (`handleHttpRequest`, `src/websocket-server.ts:396-468`): `/`, `/remote` and `/remote/` serve the phone page; `/health` and
`/api/health` answer `{"status":"ok","clients":<n>,"version":"1.0.0"}` (`448-456`; the version is a fixed protocol string, `294`);
`/api/state` returns the current state (note path, title, heading outline, playback); everything else is `404`.

**Close codes** (`src/websocket-server.ts:622-662`): `4403` origin refused, `1008` server full, `4001` no auth message within 5 s,
`4002` wrong key, `4003` first message not JSON.

**Residual (Low).** A client on this computer needs no key: `isLoopbackAddress` (`src/websocket-server.ts:40-43`) exempts every socket
whose address is loopback (`429`, `641`). So any local process, and any browser page on this computer whose Origin passes SURF-13
(a dev server on `localhost`, a router page on a LAN address), can read `/api/state` and send every command above, including
turning the microphone on. A key on loopback would break the Stream Deck, which sends none; a loopback-only Origin rule would not (SURF-13).
`WebSocketServerConfig.authToken` exists but nothing sets it (no `authToken` in `src/main.ts`).

## SURF-03 — Phone remote page

The page is `REMOTE_INTERFACE_HTML` in `src/remote-interface.ts`, served by SURF-02; nothing else is served. Checked 2026-11-27: no
`innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` in that file; server data is written with `textContent`. Off this
computer the page is served only with the key (`401` otherwise, `src/websocket-server.ts:430-435`), and it sends the `key` from its
own URL as its first WebSocket message (`src/remote-interface.ts:627-629`). The page holds no per-install data; the key lives only in
the link. (A stale copy, `src/remote-interface.html`, which was never served and lacked the key code, was deleted in 0.12.18.)

## SURF-04 — Note → renderer (fixed 0.11.5 and 0.11.6; residual Low)

Notes are rendered with `marked` and pass through Obsidian's `sanitizeHTMLToDom` before they reach the page
(`src/TeleprompterApp.svelte:1613` for the main render; embeds at `516`). Embedded-note recursion is guarded against cycles (`486`).

- **Fixed 0.11.6 (High):** the main render used `{@html marked.parse(content)}` with no sanitizer, so a note's `<img onerror=…>` reached
  the DOM on open. Embeds were already sanitized.
- **Fixed 0.11.5 (Medium):** three quadratic regexes on note and `.bib` text (`stripPandocAttributes`, the bracketed-citation regex,
  the `.bib` entry lookahead) froze Obsidian on inputs like `"[".repeat(100000)`. Bounded; `src/parser/redos.test.ts` requires
  100k-character inputs to finish in under a second.
- A note's `bibliography:` path and embeds are read through the vault API (`app.vault.getAbstractFileByPath`, `app.vault.read`), so
  they cannot reach files outside the vault.
- **Residual:** the sanitizer is Obsidian's; a bypass in it would be a bypass here.

## SURF-05 — PDF file name → shell (Critical, fixed 0.11.4)

`extractPDFText` built `` cp.execSync(`pdftotext -layout "${fullPath}" -`) ``: a PDF *named* `` `id>/tmp/pwned`.pdf `` ran a command
when opened. Now `execFileSync('pdftotext', ['-layout', fullPath, '-'], { timeout: 15000, maxBuffer: 10 MB })`
(`src/TeleprompterApp.svelte:1784-1788`): no shell. `src/exec-safety.test.ts` proves a `"`, `$(…)` or backtick in a path is inert.

## SURF-06 — Kokoro `venvPython` → shell (Low, fixed 0.11.4)

The availability probe ran `execSync` on a string with the venv path. Now `execFileSync(venvPython, ['-c', 'import mlx_audio'])`
(`src/tts/kokoro-engine.ts:79-83`). The path is fixed (`~/.local/share/mlx-tts-venv`, `src/tts/kokoro-engine.ts:17`); the
`ttsPythonPath` setting exists but no code reads it.

## SURF-06b — Kokoro voice and speed → Python source (High, fixed 0.11.6)

Found by a cross-vendor review: generation builds a Python script with `voice="${voiceId}", speed=${speed}` and runs
`spawn(python, ['-c', script])` (`src/tts/kokoro-engine.ts:153`, `235`). `voiceId` and `speed` came from `ttsVoice`/`ttsRate`, so a
shared `data.json` or profile with `ttsVoice: 'af_heart", speed=1.0)\nimport os\nos.system("id")\n#'` ran Python on the next read-aloud,
for anyone with the Kokoro venv. Now `resolveVoiceId` checks the voice against `KOKORO_VOICES` and `clampSpeed` forces a number
before interpolation (`src/tts/kokoro-safety.ts:15`, `27`; called at `src/tts/kokoro-engine.ts:130-131`, `213-214`). Tested in
`src/tts/kokoro-safety.test.ts`. The script text itself goes in as `JSON.stringify(text)`.

## SURF-07 — Local programs and their temp files (residual Low)

Every program is started with an argument array, never a shell string, except one constant (below):

| Program | Where | Started at | Input from the script |
|---------|-------|-----------|-----------------------|
| `disclaim-launcher` → `teleprompter-stt` (Apple speech helper) | `~/.local/share/teleprompter-plus/` (`src/voice/apple-speech-recognizer.ts:26-37`) | `:165` | up to 100 words as a hints file |
| `say` | `PATH` | `src/tts/mac-say-engine.ts:119`, args end with `--` | the sentence |
| `say -v "?"` | `PATH`, **through `/bin/sh`** | `src/tts/mac-say-engine.ts:37` (`execSync`) | none: a constant string |
| `afplay` | `PATH` | `src/tts/kokoro-engine.ts:274` | a WAV path the plugin made |
| Python | `~/.local/share/mlx-tts-venv/bin/python3` | `src/tts/kokoro-engine.ts:79`, `153`, `235` | see SURF-06b |
| `pdftotext` | `PATH` | `src/TeleprompterApp.svelte:1784` | a vault path (SURF-05) |

- **The plugin installs none of these.** The speech helper and its launcher are built and copied by you
  ([docs/voice-tracking.md](docs/voice-tracking.md)); the repo carries their source and a prebuilt `native/disclaim-launcher`, which the plugin
  never copies. The plugin runs whatever is at those paths when both files exist (`src/voice/apple-speech-recognizer.ts:100`).
- **The launcher is what holds the microphone.** It starts the helper as its own TCC-responsible process, so macOS asks for
  Speech and Microphone for the helper, not for Obsidian, and the permission is not listed under Obsidian in System Settings.
  A local process that replaces the files in `~/.local/share/teleprompter-plus/` gets started by the plugin the next time voice
  tracking starts. Whether macOS then keeps the old microphone grant depends on the replacement's code signature; not tested.
- **Names resolved through `PATH`:** `say`, `afplay` and `pdftotext` are found by name, so whatever `PATH` Obsidian was started with decides
  which binary runs. Running as you, a local process could already put one there; this is noted, not defended.
- **Temp files** (system temp folder, readable by you only on macOS by default):
  - `teleprompter-stt-context.txt` (`src/voice/apple-speech-recognizer.ts:146-148`): up to 100 words of the script, its rarest first
    (`buildContextHints`, `src/voice/voice-tracking-service.ts:779-782`), given to the helper as hints. Replaced on each start, **never deleted**.
  - `teleprompter-tts-kokoro-<ms>/` (`src/tts/kokoro-engine.ts:101-104`): the WAV audio of sentences read aloud. Deleted when the engine is
    destroyed (`:365-379`); left behind if Obsidian quits or crashes first.

## SURF-08 — ElevenLabs (Medium, by design)

Only when you choose the ElevenLabs engine and paste your own key. Requests go to `https://api.elevenlabs.io/v1`
(`src/tts/elevenlabs-engine.ts:34`) through Obsidian's `requestUrl`, with the key in the `xi-api-key` header (`:253`, `:348`):

- `GET /v1/voices` (`:251`) when the voice list loads: sends only the key.
- `POST /v1/text-to-speech/<voice>` (`:345`) per sentence: sends **the sentence and the sentences on either side** of it.

Choosing the engine shows a Notice that the script text goes to ElevenLabs and uses your credits (`src/settings.ts:1926`), and the
key field says the same. The key is kept in plain text in `data.json`, as Obsidian plugins do. Offline engines stay available.

## SURF-09 — Vosk model download and cache (Low)

When voice tracking falls back to Vosk, the model for the language is downloaded once from
`https://alphacephei.com/vosk/models/<model>.zip` (`src/voice/vosk-recognizer.ts:113-136`; English `vosk-model-small-en-us-0.15`,
Portuguese `vosk-model-small-pt-0.3`, `src/voice/types.ts:166`, `172`). There is no checksum or signature: HTTPS and that host are trusted.
The model runs in Vosk's WebAssembly worker. It is cached in the IndexedDB database `teleprompter-vosk-models`, store `models`
(`src/voice/vosk-recognizer.ts:494`), and a `vosk-model-<name>` flag is kept in Obsidian's localStorage (`src/voice/model-manager.ts:79-80`).
Both are per Obsidian install, not per vault, and stay after the plugin is removed.

## SURF-10 — OBS WebSocket, outbound (Low)

Off until you turn on OBS integration. The plugin connects as a client to `ws://<obsHost>:<obsPort>` (`src/obs-service.ts:138`), default
`127.0.0.1:4455` (`src/settings.ts:287-288`). The host field accepts any text (`src/settings.ts:2851-2859`) and `validateSettings` does not
check it, so a host on another computer works and the connection is **plain `ws://`, not encrypted**. The OBS password is not sent as is
(obs-websocket v5 answers a challenge with a hash), but whoever runs that host gets the answer to that challenge. No inbound surface.

## SURF-11 — `voice-trace.jsonl` (Medium before 0.12.18; residual Low)

Opt-in voice diagnostics, written by `writeVoiceTrace` (`src/TeleprompterApp.svelte:1912-1931`) to
`<vault>/.obsidian/plugins/teleprompter-plus/voice-trace.jsonl`.

- **What is in it:** each run's first lines hold **the whole script** and the exact word list (`init` and `wrapped` events,
  `src/voice/voice-tracking-service.ts:308-318`, `527-536`), then **every utterance the recognizer heard** (`heard`) and every matcher
  decision. It is as private as the scripts, and a vault sync copies it.
- **Before 0.12.18:** no size limit (one real file was 19.8 MB), and the switch existed only as a hand edit of `data.json`.
- **Now:** a toggle under Settings → Voice tracking → *Write a voice trace (diagnostics)*, off by default (`voiceTrace: false`), whose text says
  what it saves and where; read on every line, so turning it off stops writing at once. The file rotates to `voice-trace.1.jsonl` before it
  would pass 5 MB (`appendCappedLine`, `src/voice/trace-file.ts`), so at most about 10 MB exists. A profile or imported file cannot turn it on (SURF-17).
- **Residual:** a trace you turned on stays on disk until you delete it; turning the switch off does not delete it.
- `error-log.jsonl` is **no longer written**: its writer had no callers and was deleted in 0.12.18. Older versions may have left one in the plugin folder.

## SURF-12 — Server on the LAN and the remote key (High before 0.12.10; residual Medium when enabled)

The Host setting accepts `127.0.0.1` (default), `localhost`, `0.0.0.0` or any IPv4 literal (`src/main.ts:1557`). On `0.0.0.0` the server
listens on every interface, so every device on whatever network the computer is on can reach it. The phone remote needs this.
Setting it in the field shows a Notice (`src/settings.ts:2587`); applying it from a profile or file asks first (SURF-17).

**What protects it.**

- A **remote key**: 16 random bytes from `crypto.getRandomValues`, 32 hex characters, made on the first start and kept in `data.json`
  (`src/main.ts:673-677`).
- **HTTP:** a request from a non-loopback socket needs `?key=<key>` on every path but `/health` and `/api/health`, otherwise `401`
  (`src/websocket-server.ts:429-435`). The decision uses the socket address, not a header.
- **WebSocket:** a non-loopback client must send `{"type":"auth","token":"<key>"}` first, within 5 s (`src/websocket-server.ts:641-662`).
  Only then does it get state or commands.
- Since 0.12.14 the key is a secret (`SECRET_SETTING_KEYS`, `src/settings-secrets.ts:7`): Export and *Save as profile* leave it out,
  and since 0.12.18 no import or profile can set it (SURF-17). (This was item 2 of the previous list: fixed in 0.12.14.)
- Regression: `src/remote-key.test.ts`.

**What remains.**

1. **No encryption.** The key travels in the URL of a plain `http://` request and in a plain `ws://` message. Anyone who can watch the network
   traffic, or who sees the link (phone history, a screenshot, a chat), can reuse it. There is no button to make a new key; *Reset all* in
   Settings clears it with every other setting, and the next start makes a new one.
2. **A key is full control**: every command in SURF-01, microphone and OBS included.
3. **`/health` and `/api/health` are open** to the network: they tell a scanner the port is this plugin and how many clients are connected.
4. **Waiting sockets are not counted.** The 10-client limit counts only authenticated clients (`src/websocket-server.ts:634`), so a device can
   hold many sockets open, each for up to 5 s. `ws`'s default 100 MiB message limit applies, so a waiting socket can send one large first
   message before it is refused (`maxPayload` is not set). It never gets state or commands.
5. **The key is compared with `!==`** (`src/websocket-server.ts:431`, `652`), with no lockout. At 128 bits this is not a practical attack.
6. **The link can show the wrong address**: `getLocalNetworkUrl` takes the first non-internal IPv4 address (`src/websocket-server.ts:978-990`);
   with a VPN or Tailscale adapter first, the link carries that address (SURF-13).

## SURF-13 — Host and Origin policy (residual Low)

`isLocalHostname` (`src/net-access.ts:37-59`) accepts `localhost`, `*.localhost`, `::1`, fc00::/7, fe80::/10, and IPv4 in 127/8, 10/8,
172.16/12, 192.168/16 and 169.254/16 (`:52-56`), also as IPv4-mapped IPv6. Every other name, every hostname included, is refused.

- **Private-address pages pass the Origin check (open fix).** A page whose Origin is a private address (a router's admin page, a device's web
  page, a dev server on `localhost:3000`) is allowed, because the phone page itself has a LAN Origin. In a browser on this computer it connects over
  loopback, so it needs no key (SURF-01). Fix, not applied: for a loopback socket, accept only no Origin or a loopback Origin; the phone, which is
  not loopback, keeps the LAN rule and the key.
- **Tailscale and `.local` do not reach the phone page.** 100.64.0.0/10 addresses, `*.local` and `*.ts.net` names are not in the list, so the
  page answers `403` to them, key or not. A script (no Origin, and the `ws` library handles the upgrade without the Host check) reaches the key
  check and connects with the right key; this was shown in a stand-in server with the same wiring on 2026-11-26, not inside Obsidian.
- A request with no `Host` (HTTP/1.0) or no `Origin` (every non-browser client) passes the policy; the key still applies off this computer.

## SURF-14 — Saved read-aloud audio (Low, privacy)

`src/tts/speech-audio-store.ts`. With the ElevenLabs engine, each sentence's MP3 is kept in the IndexedDB database
`teleprompter-plus-speech-audio` (`:13`), stores `audio` and `meta`, so it replays without a new charge. The record key is
`JSON.stringify([model, voice, stability, similarity, previousText, nextText, text])` (`src/tts/elevenlabs-request.ts:37`): the sentence
and its neighbours in plain text. The API key is not stored. Capped at 200 MB by default (`elevenLabsAudioCacheMb`, `src/settings.ts:410`),
least recently used first. Per Obsidian install, not per vault: every vault and every plugin in that install can read it, and a vault sync
does not copy it. The command *Clear read-aloud audio cache* (`src/main.ts:220-221`) empties it; disabling or removing the plugin does not.

## SURF-15 — Take log `takes.json` (Info)

`src/take-store.ts`, `src/take-log.ts`. One file in the plugin folder, written through Obsidian's vault adapter: per take the note path, kind,
section title, duration, target and date; no script text. At most 5,000 entries (`TAKE_LOG_LIMIT`, `src/take-log.ts:15`). Reads never throw
and entries that fail validation are skipped, so a hand-edited or synced file cannot crash the prompter. No command returns the log; `state`
carries only the last take card.

## SURF-16 — Loading the `ws` module (Medium before 0.12.18; fixed)

**Before:** `ws` was left out of `main.js` (`external` in `vite.config.ts`) and `src/websocket-loader.ts` searched for it at run time:
`require('electron').remote.require('ws')`, `<vault>/<configDir>/plugins/teleprompter-plus/node_modules/ws`, `process.cwd()/node_modules/ws`,
`<resourcesPath>/app.asar/node_modules/ws`, then a bare `require('ws')`. A directory install gets only `main.js`, `styles.css` and
`manifest.json`, and Obsidian 1.15.1 ships no `ws` (its `app.asar`, `obsidian.asar` and `app.asar.unpacked` were listed), so in the running
Obsidian renderer (Electron 43.8.9, Node 24.22.1, working directory `/`) all five failed against a vault holding only the 0.12.17 release
files. **The Stream Deck and the phone remote could not connect on a normal install**; they worked only where someone had copied
`node_modules/ws` into the plugin folder by hand. That search also meant code would be loaded from whichever of those paths held a `ws`
first; the working directory is `/` when Obsidian starts from Finder, so this was not shown to be reachable, but it was an unneeded path.

**Now:** `ws` is bundled into `main.js` from its Node entry (`vite.config.ts`, alias to `node_modules/ws/index.js`) and required only when
the server starts (`src/load-ws.cjs`), so loading `main.js` touches no Node module. Nothing is read from disk. Its optional native add-ons
`bufferutil` and `utf-8-validate` resolve to modules that throw (`src/ws-absent/`), so `ws` uses its own JavaScript; without them the build
put `{}` in their place and, on Obsidian's Node 24, which has no `http.websocketMask`, every client message of 32 bytes or more would have
thrown. `src/websocket-bundle.test.ts` bundles the loader with the real build settings and runs it where `require` reaches only Node's own
modules: nothing loads at start and a 106-byte message makes the round trip. The same bundle ran inside the live Obsidian renderer and echoed
that message. `ws` is now in `main.js`, so a `ws` advisory is an advisory against the plugin.

## SURF-17 — Profiles and imported settings (High before 0.12.18; residual Low)

**Before:** *Import profile* stored the file's `settings` as they came, and every profile apply (dashboard chip, built-in list, custom list)
ran `Object.assign(settings, redactSecrets(profile.settings))` with no validator. A shared profile could silently set `wsHost: 0.0.0.0`,
`voiceTrace: true`, an OBS host on another computer, record or stream on Play, or the ElevenLabs engine. *Import* (settings file) filtered keys
but did not validate them either.

**Now** (`src/settings-import.ts`, `src/settings.ts` `applyFromOutside`, `src/main.ts:1491` `applyExternalSettings`):

- only keys the plugin defines, with the JSON type of their default, get through; never `elevenLabsApiKey`, `obsPassword`, `remoteKey`,
  the profile list or `voiceTrace` (`pickImportableSettings`);
- the result passes `validateSettings`, the same check as a load from disk, before it is saved;
- a change that widens network use (server host off loopback, server port, auto-start, OBS host off loopback, OBS port, OBS on or auto-connect,
  record or stream on Play, read-aloud through ElevenLabs) opens a dialog listing each change; **Cancel applies nothing**;
- an imported profile is stored already narrowed, with its name, icon and description cut to plain text of 80, 40 and 200 characters.

Tests: `src/settings-import.test.ts`, `src/settings-secrets.test.ts`. **Residual:** `validateSettings` checks ranges and formats of the
fields it knows, not every field; a non-network setting from a profile (font, colours, speed) applies without a question, as intended.

## SURF-18 — Kokoro model download (Low)

The Kokoro engine runs `mlx_audio.tts.generate.generate_audio(model="mlx-community/Kokoro-82M-bf16", …)` (`src/tts/kokoro-engine.ts:18`).
The plugin makes no download itself; the `mlx-audio` library fetches that model from Hugging Face on first use into its own cache, in the
Python environment you created. That download behaviour is the library's and was not checked in its code here. Trust in it is trust in your
venv's packages and in Hugging Face.

---

## Data at rest

| Where | What | Who can read it | Removed by |
|-------|------|-----------------|-----------|
| `<vault>/.obsidian/plugins/teleprompter-plus/data.json` | All settings, including **`elevenLabsApiKey`, `obsPassword` and `remoteKey` in plain text**; where each note was left (`notePositions`, note paths); custom profiles | Anyone who reads the vault folder; vault sync | You |
| same folder, `takes.json` | Note paths, section titles, durations, dates (SURF-15) | as above | You |
| same folder, `voice-trace.jsonl` and `voice-trace.1.jsonl` | Only if you turned the trace on: the whole script and every utterance, at most about 10 MB (SURF-11) | as above | You |
| Obsidian's IndexedDB `teleprompter-plus-speech-audio` | ElevenLabs audio, with the sentences as keys (SURF-14) | Code in this Obsidian install; whoever has the computer | *Clear read-aloud audio cache* |
| Obsidian's IndexedDB `teleprompter-vosk-models` | Vosk models (SURF-09) | as above | Obsidian's storage, by hand |
| Obsidian's localStorage | Panel width, eyeline position and visibility, sections panel open, Vosk download flags | as above | Obsidian's storage, by hand |
| System temp folder | `teleprompter-stt-context.txt` (up to 100 words of the script), `teleprompter-tts-kokoro-<ms>/` (WAV audio) (SURF-07) | You and processes running as you | The first: never. The second: when the engine closes |
| `~/.local/share/teleprompter-plus/`, `~/.local/share/mlx-tts-venv/`, the `mlx-audio` model cache | Programs and models you installed; the plugin only runs and reads them | You | You |

---

## Recommended order of work

1. ~~SURF-05, SURF-06, SURF-06b~~: done (0.11.4, 0.11.6).
2. ~~SURF-12 item 2 (remote key in exports)~~: done in 0.12.14.
3. ~~SURF-16, SURF-17, SURF-11~~: done in 0.12.18.
4. **SURF-13**: for loopback sockets, accept only an absent or loopback Origin. This also closes most of SURF-01's residual.
5. **SURF-12 items 1, 3 and 4**: a "new remote key" button; answer `/health` only on loopback; set `maxPayload` on the server and count
   waiting sockets toward the limit.
6. **SURF-07**: delete `teleprompter-stt-context.txt` when voice tracking stops.
7. **SURF-08, SURF-14**: acceptable as disclosed; revisit for at-rest key encryption or sentence text out of the cache keys.
