# Apple Speech Sidecar — On-Device Voice Tracking (macOS)

**Version:** 0.1.0 (in progress)
**Last Updated:** 2026-06-02
**Status:** Sidecar built + compiles + emits protocol. Standalone mic/recognition test pending. Plugin integration not started.

---

## Why

Voice tracking originally ran on **Vosk** (a 40 MB offline model). Vosk's small-model accuracy is the
limiting factor — it mis-hears, and the matcher then lags/jumps/snowballs trying to compensate. After
studying the canonical `jlecomte/voice-activated-teleprompter` (which uses the browser Web Speech API,
unavailable in Electron) and the purpose-built Mac tool **Textream** (which uses Apple's on-device
recognition), the conclusion was: **the engine is the problem, not the matcher.**

This sidecar replaces the *recognition* layer with **Apple's `SFSpeechRecognizer` running on-device**
— the same class of engine Textream uses — while keeping the existing matcher/scroller. Far more
accurate transcripts mean the scroll tracking gets dramatically more stable, and we can drop most of
the Vosk-compensation heuristics (catch-up, global search, accumulator tuning).

## Architecture

```
Obsidian (Electron renderer)
  └─ AppleSpeechRecognizer.ts        ← new; same interface as VoskRecognizer
       └─ child_process.spawn(binary)  ← same pattern as Kokoro TTS
            └─ teleprompter-stt (Swift)  ← captures mic, on-device SFSpeechRecognizer
                 └─ stdout: JSON lines  → parsed back into onResult(text, isFinal)
                      └─ speech-matcher.ts → scroll the teleprompter
```

The sidecar is a tiny long-running CLI. Source: `native/teleprompter-stt.swift`. Built with
`swiftc -O teleprompter-stt.swift -o teleprompter-stt` (Apple Silicon, Command Line Tools).

## Wire protocol (stdout, one JSON object per line)

```
{"type":"status","value":"authorizing|ready|listening|stopped"}
{"type":"partial","text":"..."}    // live, updates as you speak
{"type":"final","text":"..."}      // committed segment
{"type":"error","code":"...","message":"..."}
```

Input: `teleprompter-stt [locale]` (e.g. `en-US`, `pt-BR`). Stop: SIGINT/SIGTERM → clean exit.

## Permissions (the main risk, macOS TCC)

The binary needs **two** grants:
1. **Speech Recognition** — requested via `SFSpeechRecognizer.requestAuthorization`.
2. **Microphone** — triggered by `AVAudioEngine` input.

For a raw CLI binary, the TCC prompt attributes to the launching process. Running it from **Terminal**
(which the user can grant Mic + Speech Recognition) is the clean way to validate. When spawned by
Obsidian, the grant must belong to **Obsidian** (System Settings → Privacy & Security → Microphone /
Speech Recognition → enable Obsidian). This is verified empirically in the standalone test below.

## Plan (phased)

- **Phase 0 — Sidecar (DONE):** write + compile `teleprompter-stt.swift`; verify it emits the protocol.
- **Phase 1 — Standalone de-risk (NEXT, user-run):** run the binary in Terminal, grant Speech + Mic,
  speak, confirm `partial`/`final` lines stream with on-device recognition. This proves the engine
  before any plugin work.
- **Phase 2 — TS recognizer:** `AppleSpeechRecognizer.ts` implementing the same surface as
  `VoskRecognizer` (initialize/start/stop/onResult/onStatus/onError). Spawn the binary, parse stdout
  JSON, emit events. Resolve the binary path (bundled/compiled cache, mirroring Kokoro's venv lookup).
- **Phase 3 — Engine selection:** add a voice-engine setting (Apple Speech vs Vosk); default to Apple
  Speech on macOS when the binary is available, fall back to Vosk otherwise. Wire into
  `voice-tracking-service` so the matcher is fed by whichever recognizer.
- **Phase 4 — Simplify the matcher:** with accurate transcripts, revert toward the canonical loop —
  drop catch-up/global-search/heavy accumulator; track to the matched position with the adaptive
  window. Re-test pace (this is where the lag/fast/jump problems should simply disappear).
- **Phase 5 — Build helper + docs:** a `swiftc` build step (or compile-on-first-run) so the binary
  exists; finalize this doc + README + CHANGELOG.

## Distribution caveat (for later)

Obsidian community plugins ship JS only — they can't distribute a compiled binary through the store,
and an unsigned binary hits Gatekeeper. Options for shipping: compile-on-first-run via `swiftc` (needs
Command Line Tools), ship a signed/notarized binary out-of-band, or document a one-line build step.
For local/dev use (Command Line Tools present) compile-on-first-run is simplest. Not blocking now.

## Status log

- 2026-06-02: Sidecar written and compiled (65 KB arm64). Emits `authorizing`/`stopped`; full
  recognition pending the standalone Terminal test (permissions need an interactive launch).
