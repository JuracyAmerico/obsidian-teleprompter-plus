# Attack Surface — Teleprompter Plus

> Engineering security reference. Maps every channel that accepts input or reaches outside the
> plugin, who can reach it, and what stops abuse. Verified against source 2026-07-09.
> SURF-05 and SURF-06 (command injection) fixed in 0.11.4 — all mapped surfaces now hardened or by-design.

`isDesktopOnly: true` — the plugin runs in Electron with full Node access (`child_process`, `fs`,
`require`). That is the reason a filename or note can matter beyond the sandbox.

## Summary

| ID | Surface | Who can reach it | Severity | Status |
|----|---------|------------------|----------|--------|
| SURF-01 | Local WebSocket control server | Any local process; websites (via browser) | — | Hardened in 0.11.3 |
| SURF-02 | Local HTTP endpoints (`/api/state` etc.) | Any local process; websites (via browser) | — | Hardened in 0.11.3 |
| SURF-03 | Mobile remote interface (served HTML/JS) | Whoever loads the remote URL | Low | Clean (textContent) |
| SURF-04 | Markdown note → renderer/DOM | Author of any opened/synced note | Low | Sanitized |
| SURF-05 | PDF filename → `pdftotext` shell | Anyone who can place a PDF in the vault | HIGH (RCE) | Fixed in 0.11.4 |
| SURF-06 | Kokoro `venvPython` shell exec | Local env (vault path) | Low | Fixed in 0.11.4 |
| SURF-07 | Local TTS subprocesses (`say`, `afplay`, python, apple sidecar) | Note content (spoken) | Info | Safe (array args) |
| SURF-08 | ElevenLabs cloud egress | Opt-in (needs API key) | Medium (privacy) | By design, disclosed |
| SURF-09 | Vosk model download | Opt-in | Low (supply chain) | By design |
| SURF-10 | OBS WebSocket (outbound) | LAN OBS instance | Low | By design |
| SURF-11 | Debug error-log write | Plugin internal | Info | Safe (fixed path) |

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

## SURF-01 / SURF-02 — Local control server (Hardened in 0.11.3)

WebSocket + HTTP on `127.0.0.1:<port>`, **auto-started by default** (`autoStartWebSocket: true`),
**no auth by default** (`authToken: ''`). Localhost binding does not protect against a malicious
*website*, whose JS runs in the user's browser (on localhost).

- **Fixed in 0.11.3:** WS upgrade validates `Origin` (blocks Cross-Site WebSocket Hijacking; no-Origin
  non-browser clients still pass); HTTP validates the `Host` header (blocks DNS rebinding); the
  `Access-Control-Allow-Origin: *` header was removed (it let any site read `/api/state`). Policy in
  `src/net-access.ts` (33 tests).
- **Existing controls:** per-client rate limit, numeric command bounds (`validateCommand`), max
  clients, 5s auth timeout when a token is set.
- **Residual (defense-in-depth, not required):** still default-on and default-no-auth, so any *local*
  process can read `/api/state` (note path/title/heading outline) and drive playback. Options: default
  a random token, or default `autoStartWebSocket: false`. Deferred — would change UX for existing users.

## SURF-03 — Mobile remote interface (Clean)

`remote-interface.html/.ts` served by SURF-02, runs in the phone browser, connects back via WS. All
server data (section labels, titles, status) is written with **`textContent`**, never `innerHTML` — no
XSS sink. Good as-is.

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

## Recommended order of work

1. ~~**SURF-05**~~ — done in 0.11.4 (`execFileSync`, the only RCE).
2. ~~**SURF-06**~~ — done in 0.11.4, bundled with #1.
3. **SURF-01/02 defense-in-depth** (optional, next) — default a random token or default-off, if you want belt-and-suspenders on the local server.
4. **SURF-08** — already acceptable; revisit only if you want at-rest key encryption.
