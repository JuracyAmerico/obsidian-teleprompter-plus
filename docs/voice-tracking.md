# Voice Tracking — Design, Decisions & Caveats

> Engineering record for the speech-driven auto-scroll feature ("voice tracking"): how it
> works, why each design choice was made, the two hard bugs we root-caused, and every caveat
> a future maintainer needs. Covers all work from the Apple-sidecar rebuild onward.
>
> **Status:** working and verified on macOS. Debug logging (`DEBUG_VOICE_MATCH`) is **still ON**
> for in-use testing — see [Pending](#pending--before-release).

---

## 1. What voice tracking does

You read your script aloud; the teleprompter highlights the word you're on (karaoke style) and
holds, then advances the page so the current line stays in a comfortable band. No remote, no
foot pedal — the microphone drives the scroll.

Two cooperating layers:

1. **Recognition** — an on-device Apple `SFSpeechRecognizer` sidecar turns your voice into a
   live stream of partial transcripts.
2. **Matching + scroll** — `VoiceTrackingService` aligns each transcript to the script, decides
   the current word, highlights it, and moves the page.

---

## 2. Why Apple on-device, not Vosk

The original implementation used **Vosk** (`vosk-browser`, a ~40 MB WASM model). Its accuracy was
the limiting factor: it mis-heard often, and every mis-hear made the scroll lag or jump. We
evaluated alternatives (Textream's approach, `sherpa-onnx`, Moonshine) and chose to build an
**Apple `SFSpeechRecognizer` sidecar**:

- Dramatically more accurate than Vosk's small model.
- On-device (`requiresOnDeviceRecognition`) — private, offline, no audio leaves the machine.
- The same engine purpose-built Mac teleprompters (e.g. Textream) rely on.

Vosk remains in the codebase as a cross-platform fallback; Apple is auto-selected on macOS when
the sidecar binaries are present (`AppleSpeechRecognizer.isSupported()`).

---

## 3. Architecture

### 3.1 The Swift sidecar (`native/teleprompter-stt.swift`)

A tiny long-running CLI: captures the mic with `AVAudioEngine`, streams `SFSpeechRecognizer`
transcripts, and prints **one JSON object per line** to stdout. The plugin spawns it with
`child_process` (the same pattern Kokoro TTS already uses).

Protocol (stdout, one JSON per line):

```
{"type":"status","value":"authorizing|ready|listening|stopped"}
{"type":"partial","text":"..."}   // live, grows as you speak
{"type":"final","text":"..."}     // committed segment, then the engine restarts
{"type":"error","code":"...","message":"..."}
```

Usage: `teleprompter-stt [locale] [contextFilePath]` — e.g. `teleprompter-stt en-US /tmp/…context.txt`.

### 3.2 The TCC problem and the disclaim launcher

macOS **TCC** (Transparency, Consent & Control) attributes a spawned process's
Speech/Microphone permission to its *responsible* parent — which for a plugin-spawned binary is
**Obsidian**, and Obsidian's Info.plist has no Speech/Mic usage strings. Result: the sidecar was
killed on launch with a privacy violation.

Fix (three parts):

1. **Embedded `Info.plist`** in the compiled binary (`CFBundleIdentifier`,
   `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`) via
   `swiftc -sectcreate __TEXT __info_plist Info.plist`, then `codesign --force --sign -`.
2. **A disclaim launcher** (`native/disclaim-launcher.c`) that `posix_spawn`s the sidecar with
   `responsibility_spawnattrs_setdisclaim(...)`, so the sidecar becomes its **own** TCC-responsible
   process and macOS reads *its* Info.plist. The plugin spawns the launcher, not the sidecar
   directly.
3. **A generous auth timeout** (`AUTH_TIMEOUT_MS = 90000`): first run shows **two** macOS dialogs
   (Speech + Mic) that take time to read and approve. The timeout only guards a genuinely dead
   sidecar.

Installed binaries live at `~/.local/share/teleprompter-plus/` (`teleprompter-stt`,
`disclaim-launcher`, plus the `.swift`/`.c`/`Info.plist` sources).

### 3.3 The matcher (`src/voice/speech-matcher.ts`)

Levenshtein-distance alignment, ported from **jlecomte/voice-activated-teleprompter** (MIT).
Two non-obvious choices:

- **Tail matching, not whole-partial matching.** Apple keeps *growing one cumulative partial*
  from the start of an utterance. Matching the entire partial drags the match forward (the
  already-read beginning misaligns it). We match only the **last 5 recognized words**
  (`TAIL_WORDS`) against a short look-ahead window — that anchors the match where your voice
  actually is.
- **Bounded look-ahead.** `findNextPosition` only searches ~13 words ahead of the current index.
  This keeps normal matching cheap and local. *(It is also the seed of Bug #1 below — see §5.)*

### 3.4 Scroll + highlight (`src/voice/voice-tracking-service.ts`)

The scroll model went through several iterations (§4) and settled on:

- **Karaoke highlight is the primary tracker** (Textream-style): the matched word gets
  `voice-active`; everything before it `voice-past`.
- **Hold-then-advance band.** The page only moves when the highlighted word reaches a lower
  *trigger* line (you've read down the screen) or drifts above the top. Between those, it holds
  still so the page doesn't twitch on every word.
- **Damped follower** eases `scrollTop` toward the target each frame (`FOLLOW_FACTOR`) — smooth,
  no momentum overshoot.

### 3.5 Confidence gating (anti-"runs ahead")

From Textream's `matchCharacters` idea:

- A **small** forward step (`SMALL_STEP_WORDS`) commits immediately — normal reading stays
  responsive.
- A **larger** jump must be confirmed by **2 of the last 3** matches agreeing
  (`AGREE_WORDS`) before it commits — one noisy over-match can't fling the highlight ahead.
- `FORWARD_CAP` bounds how far a single commit may advance.

---

## 4. Decision log (chronological)

The thread, with the commit that landed each step. Read top-to-bottom to see *why* the current
shape exists.

| Area | What changed | Why | Commit |
|------|--------------|-----|--------|
| Parser | strip `:::` fenced-div markers and bare URLs from display+TTS | `:::` showed literally; TTS read full URLs aloud | `53bf9e1`, `5ad3dca` |
| Vosk | remove `vosk-browser` from rollup `external` | it wasn't bundled → "voice tracking not available" | `a37879c` |
| Recognition | build the **Apple sidecar** (Swift CLI + JSON protocol) | Vosk accuracy was the bottleneck | `d3d2b45`, `b6a200c` |
| TCC | embedded Info.plist + codesign + disclaim launcher + 90s timeout | sidecar killed under Obsidian's TCC identity | `972963c`, `f896ab0`, `9f82439` |
| Scroll | tried momentum → snap → **damped follower** | momentum raced; snap was jumpy | `f2fc9bc`, `3dd086f` |
| Scroll | read-ahead lag + live "trail"/"smoothness" sliders | let the reader self-tune the follow | `51c9276`, `3c0eb9a` |
| Highlight | Textream-style word highlight + hold-then-advance | precise per-word tracking | `0efab3f` |
| Matcher | **tail match** (last 5 words) + forward cap | whole cumulative partial pushed ahead | `e7c6516` |
| Gating | **2-of-3** confidence gate; logs via `console.warn` | `console.log` is stripped at build; stop fling-ahead | `f69eedc`, `c6d1c0c` |
| Recognition | feed script words to Apple as **`contextualStrings`** | cut mis-hears of uncommon words | `3e0ba6a` |
| Highlight | `HIGHLIGHT_LEAD` → user-tunable **Highlight offset** slider (−3…+3, default 0) | offset Apple's predictive-partial latency to taste | `842bd48`, `8e8b550`, `8e80cd3` |
| Recognition | feed **original-cased** tokens to `contextualStrings` | proper nouns/headers (Module, Hamid, U-Haul, UX) were lowercased and mis-heard | `64f3cf9` |
| Recovery | **auto re-sync on prolonged stall** (Bug #1 fix) | tracking died for good past section headers | `2c77846` |
| Scroll | read **live span** offset, not the init snapshot (Bug #2 fix) | mid-document start teleported to the intro | `350bc85` |

---

## 5. The two hard bugs (root causes + fixes)

### Bug #1 — tracking dies permanently at a section header

**Symptom:** reading down through a heading ("Prototype Evolution — Assignment 3"), the highlight
froze and never recovered; only pressing **R** brought it back.

**Root cause:** recovery (global re-search) was armed **only** at start or manual **R** — a
deliberate earlier choice to kill an old "teleport to the end" bug (`bfbb7c0`). But forward
matching only sees ~13 words ahead. At a heading, Apple **finalizes and restarts its speech
segment** and emits stale partials for a beat while you keep reading; you drift past that 13-word
window, and from then on `findNextPosition` can never see your words. `consecutiveFailedMatches`
climbed but **nothing consumed it** → silent permanent stall.

**Fix (`2c77846`):** when local matching makes zero progress for `STALL_RESYNC_THRESHOLD` (5)
processed partials (~2 s), arm **one** bounded re-sync. Safe now (unlike the old teleporting
auto-search) because the search is capped to `GLOBAL_SEARCH_RADIUS` (±120 words) around your
**scroll position**, *and* far jumps still need 2-of-3 confirmation. Verified in the log as
`STALL → bounded re-sync armed` followed by a small `GLOBAL` commit that resumed forward tracking.

### Bug #2 — starting mid-document teleports to the intro

**Symptom:** starting a read from the middle, the highlight jumped to the top of the document and
tracked the **intro/title** while you read the body.

**Root cause:** `scrollToWord` computed the word's screen position from `wordPositions[i].offsetTop`,
which is snapshotted **once at build time**. On a note with a properties table / images /
late-loading fonts, the layout shifts *after* that measurement, leaving the cached offset stale
(often **0**). A stale 0 made `wordViewportY = 0 − scrollTop` hugely negative (logged as
**−3349**), which tripped the "word is above the viewport" branch and **yanked the page to the
top** — and the scroll-anchored global re-sync then re-acquired the intro and stuck there. Readers
who started from the top never hit it because those early words' offsets were valid.

**Fix (`350bc85`):** read `offsetTop` from the **live DOM span** (`span.offsetTop`) at the moment
of scrolling — always current regardless of layout shifts. Verified: the same scenario now logs a
sane `wordY=449` and tracks ~190 words from mid-document with no teleport.

---

## 6. Why this solution (and roads not taken)

- **Apple on-device over a better browser model.** Accuracy is everything for matching; Apple's
  engine is the best available on macOS and runs offline/private. Cost: macOS-only and the TCC
  dance (§3.2).
- **Tail matching over full-partial.** Directly fixes Apple's cumulative-partial behavior; the
  alternative (resetting the recognizer each word) loses context and accuracy.
- **Bounded + confirmation-gated re-sync over unbounded global search.** The unbounded version is
  what caused the original "teleport to the end" (`bfbb7c0`). We kept recovery but made it
  physically incapable of leaving your vicinity, and slow to commit a far jump.
- **Live offset over rebuilding the position cache on every reflow.** Reading the span directly is
  O(1) and always correct; periodically rebuilding the whole `wordPositions` map would be wasteful
  and still race layout.
- **A user-facing Highlight-offset slider over a fixed lead.** Recognition latency vs. reading pace
  is personal; a −3…+3 knob (default 0) lets each reader dial "sits on the word" vs. "leads me."

---

## 7. Caveats (read before changing anything)

1. **macOS only** for the high-accuracy path. Needs both compiled binaries
   (`teleprompter-stt`, `disclaim-launcher`) in `~/.local/share/teleprompter-plus/`. Without them,
   it falls back to Vosk.
2. **Recompiling the sidecar re-triggers the TCC prompts.** A new binary has a new identity, so
   macOS re-asks for Speech + Mic. Don't recompile casually; if you do, expect to re-grant.
3. **`contextualStrings` is capped at 100 in the Swift sidecar.** `buildContextVocabulary` curates
   and **surfaces proper nouns/numbers/hyphenated tokens first**, so they survive the cut even on a
   long script. Raising the cap means editing *and recompiling* the sidecar (see caveat 2).
4. **~2-second "stall then catch-up" at section/sentence boundaries is inherent.** Apple finalizes
   and restarts its segment at pauses; our recovery is **reactive** (waits `STALL_RESYNC_THRESHOLD`
   partials before firing). This is a limitation of the engine, not a bug we can fully remove.
5. **A re-sync can land a few words *behind* your true position, then climb forward.** The bounded
   global search is anchored to your (stuck) scroll position and picks the best-confidence match in
   range, which can be slightly behind. It self-corrects within a few partials; it is contained,
   not a teleport.
6. **The cached `wordPositions[i].offsetTop` is unreliable after layout shifts.** `scrollToWord`
   now uses the live span; `estimateWordIndexFromScroll` already did. **Do not** reintroduce the
   cached offset into scroll math.
7. **Logs are emitted via `console.warn`, not `console.log`.** The build strips `console.log`
   (`esbuild.pure`). Any new debug line must use `console.warn` or it vanishes in the bundle.
8. **`vosk-browser` must stay out of rollup `external`** or voice tracking silently fails to load
   (`a37879c`). The bundled `main.js` is ~16 MB as a result — expected.

### Tunable knobs (current values)

| Constant / setting | Value | Effect |
|--------------------|-------|--------|
| `TAIL_WORDS` (matcher) | 5 | how many trailing recognized words anchor the match |
| local look-ahead | ~13 words | how far ahead forward-matching can see |
| `SMALL_STEP_WORDS` | 2 | jump ≤ this commits immediately |
| `AGREE_WORDS` / 2-of-3 | 3 | bigger jumps need 2 recent matches within this many words |
| `FORWARD_CAP` | 5 | max words a single commit may advance |
| `GLOBAL_SEARCH_RADIUS` | 120 | re-sync only relocates within ±this of your scroll position |
| `GLOBAL_JUMP_CONFIRM_DISTANCE` | 25 | global jumps farther than this need a 2nd agreeing match |
| `STALL_RESYNC_THRESHOLD` | 5 | stalled partials before a bounded re-sync arms (~2 s) |
| `HIGHLIGHT_LEAD` / "Highlight offset" | 0 (−3…+3) | + leads ahead of the word, − lags behind |
| `AUTH_TIMEOUT_MS` (sidecar) | 90000 | first-run permission-dialog grace |

---

## 8. Pending — before release

- **Debug logging is intentionally ON.** `DEBUG_VOICE_MATCH = true` in
  `src/voice/voice-tracking-service.ts` (line ~46). It floods the console with `[VT]` lines and is
  kept on **for active testing**. Flip to `false` (and rebuild + redeploy) as the finalize step,
  once testing is done.
- **Optional snappier recovery:** lowering `STALL_RESYNC_THRESHOLD` 5 → 3 cuts boundary recovery
  to ~1.2 s at the cost of slightly more frequent re-syncs during normal brief pauses. A trade,
  not a fix — leave at 5 unless testing argues otherwise.

---

*Cross-references: `docs/apple-speech-sidecar.md` (sidecar build/install), `docs/voice-scroll-research.md`
(scroll-model exploration), `src/voice/voice-tracking-service.ts`, `src/voice/speech-matcher.ts`,
`src/voice/apple-speech-recognizer.ts`, `native/teleprompter-stt.swift`, `native/disclaim-launcher.c`.*
