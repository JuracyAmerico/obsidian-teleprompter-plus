---
task: Teleprompter Plus — voice tracking that never fails silently, and a plugin whose README only claims what the code does
slug: teleprompter-plus
project: Teleprompter Plus
effort: E3
phase: build
progress: 0/19
mode: algorithm
started: 2026-10-29
updated: 2026-10-29
---

## Ideal State

**L3:** Américo rehearses an interview answer in T+ and the voice either follows him or tells him plainly why it can't and how to fix it, every time.

**L2:** Voice tracking is trustworthy enough to rehearse with: it starts, keeps its place, and never lies about its state.

- A voice start that fails (permission hang, denial, helper crash) shows a clear message with the System Settings path and a retry within ~15 s; the UI never shows "Voice Active" while nothing is listening.
- Changing the pace preset during tracking keeps the reader's position and does not restart the speech helper.
- The interview-practice "rehearsal" preset and the two anti-wrong-jump guards (stranded on `rehearsal-on-0.11.6` since 2026-07-11) are on main.
- The README states only features the code implements.

**L1:** Source of the scope: Sol code audit and Fable competitor gap analysis, 2026-10-29 (vault `01-projects/obsidian-teleprompter-plus/2026-10-29-17-55-auditoria-bugs-e-lacunas-vs-concorrentes.md`), and Américo's go-ahead for release 0.11.9 ("How about start now?", 2026-10-29). Releases 0.12.0 (skip stage cues, fit-to-time, auto wake lock, pedal keys) and 0.13.0 (voice commands, Portuguese voice, take log) come after and are not in this ISA yet.

Restate: L3/L2 drawn from the plan table Américo approved in chat 2026-10-29 18:04 ("How about start now?"). `inferred` until he confirms the wording.

## Out of Scope

- Publishing to the Obsidian store (needs Américo's OK per release).
- Live note refresh, pin/always-on-top, mobile — later releases.
- Full-repo seed of every surface into criteria (fog, below).

## Criteria

- [ ] ISC-1: `src/settings.ts` exposes a `rehearsal` pace preset alongside the existing three.
- [ ] ISC-2: `findGlobalPosition` returns -1 when a rival match farther than `windowSize*2` is within the ambiguity margin of the best match.
- [ ] ISC-3: `findGlobalPosition` refuses a jump of more than 50 words when fewer than 4 words were recognized.
- [ ] ISC-4: applying a pace preset while tracking is live calls neither recognizer `stop` nor `start`.
- [ ] ISC-5: applying a pace preset while tracking is live leaves `currentWordIndex` unchanged.
- [ ] ISC-13: applying a pace preset while tracking is live leaves the tokenized word count unchanged.
- [ ] ISC-6: a speech helper that exits before it reports listening produces an error event carrying its exit code or signal.
- [ ] ISC-7: a speech helper that stays silent produces an error within the start timeout.
- [ ] ISC-14: after a start timeout the final recognizer status is `error`, never `off`.
- [ ] ISC-8: the native helper bounds `SFSpeechRecognizer.requestAuthorization` with a watchdog that emits an `auth-timeout` error.
- [ ] ISC-15: the native helper exits non-zero after an `auth-timeout`.
- [ ] ISC-9: the native helper requests microphone access explicitly via `AVCaptureDevice.requestAccess(for: .audio)`.
- [ ] ISC-16: the native helper reports a denied microphone as a `mic-denied` error.
- [ ] ISC-10: the UI marks voice tracking active only after the service reports `listening`.
- [ ] ISC-17: a voice error shows an Obsidian Notice naming the System Settings privacy path.
- [ ] ISC-11: README.md makes no claim that the note updates live while being edited.
- [ ] ISC-18: README.md makes no "Pin window" claim.
- [ ] ISC-12: `bun run check` reports 0 errors.
- [ ] ISC-19: `bun test` reports 0 failures.

## Test Strategy

| isc | type | check | threshold | tool |
|---|---|---|---|---|
| ISC-1 | bash | rehearsal preset present in settings | exit 0 | rg -q "rehearsal" src/settings.ts |
| ISC-2 | bun-test | near-tied distant rival freezes position | pass | bun test src/voice/speech-matcher-guards.test.ts -t "ambiguity" |
| ISC-3 | bun-test | weak evidence cannot teleport | pass | bun test src/voice/speech-matcher-guards.test.ts -t "weak evidence" |
| ISC-4 | bun-test | preset apply never stops or starts the recognizer | pass | bun test src/voice/preset-apply.test.ts -t "no restart" |
| ISC-5 | bun-test | preset apply keeps position | pass | bun test src/voice/preset-apply.test.ts -t "keeps position" |
| ISC-13 | bun-test | preset apply keeps word count | pass | bun test src/voice/preset-apply.test.ts -t "keeps words" |
| ISC-6 | bun-test | early helper exit becomes an error with code or signal | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "early exit" |
| ISC-7 | bun-test | silent helper errors within the timeout | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "silent helper" |
| ISC-14 | bun-test | status stays error after timeout | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "stays error" |
| ISC-8 | bash | auth watchdog in native helper | exit 0 | rg -q "auth-timeout" native/teleprompter-stt.swift |
| ISC-15 | bash | helper exits non-zero after auth-timeout | exit 0 | rg -q "exit\(1\)" native/teleprompter-stt.swift |
| ISC-9 | bash | explicit mic request in native helper | exit 0 | rg -q "AVCaptureDevice.requestAccess" native/teleprompter-stt.swift |
| ISC-16 | bash | mic denial reported as its own error | exit 0 | rg -q "mic-denied" native/teleprompter-stt.swift |
| ISC-10 | bun-test | active flag set only on listening | pass | bun test src/voice/voice-ui-state.test.ts -t "active on listening" |
| ISC-17 | manual | voice error shows a Notice with the Settings path | Américo sees the message with mic denied | real mic on macOS |
| ISC-11 | bash | README has no live-edit claim | exit 1 | rg -q -i "updates live as you edit" README.md |
| ISC-18 | bash | README has no pin-window claim | exit 1 | rg -q -i "pin window" README.md |
| ISC-12 | bash | type check clean | exit 0 | bun run check |
| ISC-19 | bash | test suite clean | exit 0 | bun test |

Runtime acceptance (real mic, real TCC prompt on macOS) needs Américo at the Mac: denied permission → message + Settings path; granted → tracking starts; preset switch mid-read keeps position.

## Features

### F1: Recover stranded rehearsal work
Criteria: ISC-1, ISC-2, ISC-3
Lane: inline

### F2: Voice start never fails silently
Criteria: ISC-6, ISC-7, ISC-14, ISC-8, ISC-15, ISC-9, ISC-16, ISC-10, ISC-17
Lane: Sol · high

### F3: Preset change in place
Criteria: ISC-4, ISC-5, ISC-13
Lane: Sol · high

### F4: Honest README
Criteria: ISC-11, ISC-18, ISC-12, ISC-19
Lane: Sol · high

## Fog

- Every other surface of the plugin (Stream Deck actions, TTS, remote, OBS, timer) has no criteria yet; a `Skill("ISA", "seed")` pass later.

## Decisions

- 2026-10-29: Bug 1 (preset switch kills tracking) judged fixed by f86cc00 per Sol audit (inferred, not reproduced); ISC-4/5 remove the restart that still loses position and re-enters bug 2's window.
- 2026-10-29: Cherry-picked 0c09887 with `dist/` hunks dropped (main no longer tracks dist).
- 2026-10-29: Uncommitted docs-site WIP stashed as "docs-site wip 2026-10-29" before the cherry-pick.

## Status

acceptance: pending — runtime mic test needs Américo at the Mac.

## Changelog

- 2026-10-29: ISA created for release 0.11.9.
