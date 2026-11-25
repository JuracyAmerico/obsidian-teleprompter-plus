---
task: Teleprompter Plus — voice tracking that never fails silently, and a plugin whose README only claims what the code does
slug: teleprompter-plus
project: Teleprompter Plus
effort: E3
phase: climbing
progress: 138/141
mode: algorithm
started: 2026-10-29
updated: 2026-11-25
---

## Ideal State

**L3:** Américo rehearses an interview answer in T+ and the voice either follows him or tells him plainly why it can't and how to fix it, every time.

**L2:** Voice tracking is trustworthy enough to rehearse with: it starts, keeps its place, and never lies about its state.

- A voice start that fails (permission hang, denial, helper crash) shows a clear message with the System Settings path and a retry within ~15 s; the UI never shows "Voice Active" while nothing is listening.
- Changing the pace preset during tracking keeps the reader's position and does not restart the speech helper.
- The interview-practice "rehearsal" preset and the two anti-wrong-jump guards (stranded on `rehearsal-on-0.11.6` since 2026-07-11) are on main.
- The README states only features the code implements.

**L1:** Source of the scope: Sol code audit and Fable competitor gap analysis, 2026-10-29 (vault `01-projects/obsidian-teleprompter-plus/2026-10-29-17-55-auditoria-bugs-e-lacunas-vs-concorrentes.md`), and Américo's go-ahead for release 0.11.9 ("How about start now?", 2026-10-29). Releases 0.12.0 (skip stage cues, fit-to-time, auto wake lock, pedal keys, and a floating always-on-top click-through window for reading over a video call: Américo's "yes", 2026-10-30, after the Glimpse review) and 0.13.0 (voice commands, take log) come after. Portuguese voice moved into 0.12.0 on Américo's word, 2026-11-04. Live refresh, jumping between prompter and note, remembered position and a screen-share test joined 0.12.0 on his word, 2026-11-05 ("Yes is approved"), after the competitor evaluation. Fit-to-time and the cursor-to-prompter jump moved to 0.13.0 on his "yes" to the plan, 2026-11-05.

Restate: L3/L2 drawn from the plan table Américo approved in chat 2026-10-29 18:04 ("How about start now?"). `inferred` until he confirms the wording.

## Out of Scope

- Publishing to the Obsidian store (needs Américo's OK per release).
- Mobile: a later release, with its own speech path.
- Full-repo seed of every surface into criteria (fog, below).

## Criteria

- [x] ISC-1: `src/settings.ts` exposes a `rehearsal` pace preset alongside the existing three.
- [x] ISC-2: `findGlobalPosition` returns -1 when a rival match farther than `windowSize*2` is within the ambiguity margin of the best match.
- [x] ISC-3: `findGlobalPosition` refuses a jump of more than 50 words when fewer than 4 words were recognized.
- [x] ISC-4: applying a pace preset while tracking is live calls neither recognizer `stop` nor `start`.
- [x] ISC-5: applying a pace preset while tracking is live leaves `currentWordIndex` unchanged.
- [x] ISC-13: applying a pace preset while tracking is live leaves the tokenized word count unchanged.
- [x] ISC-6: a speech helper that exits before it reports listening produces an error event carrying its exit code or signal.
- [x] ISC-7: a speech helper that stays silent produces an error within the start timeout.
- [x] ISC-14: after a start timeout the final recognizer status is `error`, never `off`.
- [x] ISC-8: the native helper bounds `SFSpeechRecognizer.requestAuthorization` with a watchdog that emits an `auth-timeout` error.
- [x] ISC-15: the native helper exits non-zero after an `auth-timeout`.
- [x] ISC-9: the native helper requests microphone access explicitly via `AVCaptureDevice.requestAccess(for: .audio)`.
- [x] ISC-16: the native helper reports a denied microphone as a `mic-denied` error.
- [x] ISC-10: the UI marks voice tracking active only after the service reports `listening`.
- [x] ISC-17: a voice error shows an Obsidian Notice naming the System Settings privacy path.
- [x] ISC-11: README.md makes no claim that the note updates live while being edited. Retired 2026-11-05 when ISC-68 made the claim true.
- [x] ISC-18: README.md makes no "Pin window" claim.
- [x] ISC-12: `bun run check` reports 0 errors.
- [x] ISC-19: `bun test` reports 0 failures.
- [x] ISC-20: a helper that never sends a `prompt` field gets the long start limit, so a first-run user answering the macOS dialog on an old helper is not cut off.
- [x] ISC-21: output from a killed helper never changes the state of a newer run.
- [x] ISC-22: a recognizer that only ever returns `recognition` errors is reported as an error instead of showing "Listening…" forever.
- [x] ISC-23: `bunx eslint src/voice` reports no errors.
- [x] ISC-24: recognition errors spread wider than the error window (a reader pausing to think) never fail the run.
- [x] ISC-25: on the Vosk fallback, a microphone request that never settles becomes a reported error within 15 s instead of "Initializing…" forever.
- [x] ISC-26: on the Vosk fallback, a stream of only exact-zero samples (mic blocked by macOS) becomes a reported microphone-denied error within ~4 s; real room noise never trips it.
- [x] ISC-27: the What's New dialog lists the `## [version]` entries of CHANGELOG.md for the installed version, never a hand-written list.
- [x] ISC-28: a release whose CHANGELOG.md has no entry for manifest.json's version fails `bun test`, so the release workflow stops before publishing.

### 0.12.0 audit fixes (Sol's announced-vs-code audit, Américo's "yes" 2026-10-30)

- [x] ISC-44: every play start emits `teleprompter:play-started` and reset-to-top emits `teleprompter:reset-complete`, so the OBS recording sync main.ts listens for can fire.
- [x] ISC-45: the About settings tab has a toggle that turns the What's New dialog back on, and the dialog's hint names that tab.
- [x] ISC-46: the About tab's Docs and Support links open the JuracyAmerico repository, never a `yourusername` placeholder.
- [x] ISC-47: the voice settings show no control the follower never reads (scroll behavior, max/min jump, animation times, pause detection and threshold, scroll trail).

### 0.12.0 floating window (criteria from Fable's design review, 2026-10-30)

- [x] ISC-29: `FloatingWindowController.enter()` calls `setAlwaysOnTop(true, …)` and on macOS `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`; `exit()` calls both with false.
- [x] ISC-30: `lock()` calls `setIgnoreMouseEvents(true, { forward: true })`, `unlock()` calls `setIgnoreMouseEvents(false)`, and `exit()` always unlocks first.
- [x] ISC-31: window see-through is clamped to 30–100% before it reaches the window.
- [x] ISC-32: a saved locked state is never restored: `enter()` never starts locked.
- [x] ISC-33: the float button renders only on desktop and not on Linux, and manifest.json keeps `isDesktopOnly: true`.
- [x] ISC-34: voice follow-scroll and auto-scroll schedule their frames and timers from the content's own window, never the main window's, so a minimized main window cannot freeze the floating prompter.
- [x] ISC-35: runtime (Américo): main window minimized, Zoom test meeting in full screen, floating + voice on: the script stays visible and follows a 60-second read with no stall over 2 s.
- [x] ISC-36: runtime: locked, a click on the script reaches Zoom underneath; hovering the corner handle shows Unlock within 1 s, and after unlocking the next click lands on the prompter.
- [x] ISC-37: runtime then docs: whether the floating window shows when sharing "Entire screen" and when sharing a single window is measured, and README states those results, never "hidden from screen share".
- [x] ISC-38: closing the floating window mid-voice leaves no `teleprompter-stt` process within 2 s, and the main window shows voice off.
- [x] ISC-39: saved position and size are restored only when they overlap a connected display; otherwise the window opens at the default place.
- [x] ISC-40: entering floating pins the current note, so clicking another note during the call does not swap the script.
- [x] ISC-41: without the Electron window controls, entering floating shows one Notice and falls back to a plain pop-out; nothing throws.
- [x] ISC-42: a voice error while floating shows inside the floating window, not only as an Obsidian Notice behind Zoom.
- [x] ISC-43: there are three ways to unlock (corner handle, a button in the main window, a Stream Deck/remote `floating-unlock` command).
- [x] ISC-48: floating while voice runs in the main window stops it there and starts it in the floating window, so only the floating script follows the voice.
- [x] ISC-49: `enter()` turns background throttling off on the floating and main windows, and `exit()` turns it back on for both.
- [x] ISC-50: the script text carries an outline only while floating.
- [x] ISC-51: a connected display whose name matches "Elgato Prom" is identified as the Prompter; no such display gives none, whatever its size.
- [x] ISC-52: with the Prompter connected and preferred, floating opens filling that display at 100% opacity; otherwise it opens at the restored bounds and saved see-through.
- [x] ISC-54: while a floating window exists, Stream Deck and remote commands and the main window's voice button act on the floating view, never on the main one.
- [x] ISC-55: on the Prompter the toolbar, clock row, section panel and status bar are hidden, so the script fills what the small display has.
- [x] ISC-56: floating opens as a floating window on every attempt, and a request nobody picked up is cleared with a Notice instead of surviving to hijack the next pop-out.
- [x] ISC-57: closing the main teleprompter view leaves the floating window's voice running.
- [x] ISC-58: unplugging the Prompter while floating moves the window to the main screen with its controls, and connecting one shows the move button without reopening.
- [x] ISC-87: the "Float over other apps" command, from any source, closes an open floating window and leaves it closed.
- [x] ISC-53: one button moves the floating window between the Prompter and the main screen, the choice is remembered, and bounds on the Prompter never overwrite the saved main-screen position.

### 0.12.0 Portuguese voice (Américo: "add portuguese voice to 0.12.0", 2026-11-04)

- [x] ISC-59: a Portuguese script is detected as pt-BR, an English script as en-US, and a script with no telling words stays en-US.
- [x] ISC-60: a note's frontmatter language beats the setting, and the setting beats detection.
- [x] ISC-61: the settings menu offers Automatic, English and Portuguese, and a saved en-US from before this release becomes Automatic once.
- [x] ISC-62: recognition never leaves the Mac: the helper refuses to run without on-device support, and an older helper that does not promise it is not trusted with another language.
- [x] ISC-63: when Apple cannot run on-device, Vosk takes over in the same language with no error shown, and later starts go straight to Vosk.
- [x] ISC-64: changing script language between runs gets a recognizer in the new language.
- [x] ISC-65: Portuguese heard without accents still matches, and English number words are never applied to other languages.
- [x] ISC-66: runtime: a spoken Portuguese script moves the prompter on this Mac.
- [x] ISC-67: runtime: English voice reaches Listening on the rebuilt helper, once macOS has its permission.

### 0.12.0 additions from the competitor evaluation (Américo: "Yes is approved", 2026-11-05)

Live refresh:

- [x] ISC-68: saving an edit to the prompted note changes the prompter's text within 3 s, with no reload or reopen.
- [x] ISC-69: a refresh leaves the same passage in the reading position and never changes playback: playing stays playing, paused stays paused.
- [x] ISC-70: a refresh during voice tracking keeps the same speech helper running, and the next spoken words of the edited passage move the prompter; on the Vosk engine, words new to the script are heard only after the next voice start.
- [x] ISC-71: an edit to any other note never changes the script, and a pinned note's own edits still refresh it.

Jump between prompter and note:

- [x] ISC-72: double-clicking a word in the prompter opens its note in the editor with the cursor on that word's source line, including when the note is pinned and not the active file, and a pane is opened when none shows the note.
- [x] ISC-74: after a double-click during voice tracking, the next spoken words continue from the clicked passage.

Remembered position:

- [x] ISC-75: a note reopens at the passage where it was left after an Obsidian restart, and one read to its end starts from the top.
- [x] ISC-76: the saved record holds a word index and its surrounding words, never a pixel value, and a renamed or moved note keeps it.
- [x] ISC-77: a position past the end of a shortened note lands at the end without an error, and saved positions are capped at 200 and dropped for deleted notes.

Hiding the script from screen share:

- [x] ISC-78: runtime: with the floating window's content protection on, a real Zoom local recording of an entire-screen share and of an Obsidian window share is viewed frame by frame, and the result is recorded with the macOS and Zoom versions.
- [x] ISC-91: runtime: "Hide from capture" is measured on an entire-screen share in Google Meet and Microsoft Teams, with a control frame taken with protection off.
- [x] ISC-92: the plugin's interface has no emoji icons, and a test fails the build if one returns.
- [x] ISC-93: a command received while floating runs once on the floating script, however many views are open.
- [x] ISC-79: a setting ships only if ISC-78 shows the script absent from both shares and the window still readable to Américo; otherwise no setting ships. Either way README states only the measured result. Built, off by default; Américo read the protected window on his monitor ("yes I can", 2026-11-05).

Stage cues, wake lock, pedal keys (Fable's plan, Américo's "yes" 2026-11-05):

- [x] ISC-80: a bracket cue such as `[pause]` is hidden on screen by default and dimmed when a setting asks; citations, footnotes, wiki links, links and task boxes are left alone.
- [x] ISC-81: read-aloud never speaks a stage cue.
- [x] ISC-82: voice tracking counts no word inside a stage cue, so word indexes match what is on screen.
- [x] ISC-83: with the keep-awake setting on, play, voice listening and read-aloud each hold the screen awake, and when all three stop an automatic hold ends while a manual one stays.
- [x] ISC-84: PageDown and PageUp turn 80% of a screen, reach existing users whose saved hotkeys predate them, and during voice tracking the voice follows the turn.
- [x] ISC-86: a Stream Deck or Elgato pedal scroll during voice tracking moves the voice with the page, so it does not pull the page back.
- [x] ISC-85: a setting makes the arrow keys turn pages for pedals in arrow mode, and README states that keys work only with the prompter focused.

Found in Américo's own test run, 2026-11-05 (steps 2, 3, 7, 8):

- [x] ISC-88: reading aloud a line already passed moves voice back to it within about six words, and the script then follows from there.
- [x] ISC-89: a phrase that occurs twice in range, a stale repeat from the recognizer, and ordinary lag behind a forward reader never move voice back.
- [x] ISC-90: read-aloud with Américo's ElevenLabs engine does not speak a stage cue, confirmed by his ear.

### Read-aloud fixes (Américo: "favor corrigir os issues acima", 2026-11-05)

- [x] ISC-94: choosing a voice in the read-aloud panel changes the voice of the next ElevenLabs sentence and is saved as the ElevenLabs voice, never as the Kokoro one.
- [x] ISC-95: a changed engine, ElevenLabs key, voice, model, stability or similarity takes effect at the next read-aloud start with no reopen.
- [x] ISC-96: spoken English says money with a currency prefix or a K, M, B or T suffix as a full amount (US$1B is "one billion US dollars").
- [x] ISC-97: spoken English says a Canadian province code after a comma as its name, and a month abbreviation before a number as the month.
- [x] ISC-98: spoken text says an e-mail address with its at and dots, a phone number digit by digit, and a job-style #123 as "number one two three".
- [x] ISC-99: spoken text never carries a pipe, and "8+" is said as "eight plus".
- [x] ISC-100: read-aloud language comes from the note's frontmatter, then a language picked in settings, then the script itself, and English number words reach only English notes.
- [x] ISC-101: a saved ttsLanguage of en becomes Automatic once, and English picked afterwards stays.
- [x] ISC-102: a pronunciation list in settings replaces whole words before anything is spoken, in every engine, and never changes the text on screen.
- [x] ISC-103: ElevenLabs stability and similarity are settings, and their defaults keep today's 0.5 and 0.75.
- [x] ISC-104: each ElevenLabs sentence is sent with the sentences around it as context, and audio cached for one context is not reused for another.
- [x] ISC-105: a Markdown link keeps its text on screen and in speech: its URL is never stripped into a leftover "[Text](".
- [x] ISC-106: a line break inside a block is a pause in speech, so the words on either side of it never run together.
- [x] ISC-107: runtime: the open cover letter read by the real plugin in Américo's clone voice has its address, phone, posting number and money read back correctly by a transcription of the captured audio.

### Mobile phase 0: iPhone probe (Américo: "Yes" to Fable's plan, 2026-11-05)

- [x] ISC-108: the probe bundle evaluates under a require that knows only obsidian.
- [x] ISC-109: the probe bundle makes no network call and uses no speech recognition API.
- [x] ISC-110: the probe's microphone test keeps no audio, only a peak level.
- [x] ISC-111: the probe writes its report to a vault note after every step, so a hang leaves what was measured.
- [x] ISC-112: a probe step that never settles is recorded as a timeout and the next step runs.
- [x] ISC-113: runtime: the probe runs in real Obsidian on the Mac and writes a complete report.
- [x] ISC-114: runtime: the report comes back from Américo's iPhone through iCloud, with no Obsidian Sync.
- [x] ISC-115: runtime: on the iPhone, a microphone test started straight from its own tap reads a nonzero peak from at least one of two readers (analyser, AudioWorklet), or names the reason it cannot.

### Mobile phase 1: read-aloud on the phone (Américo: "yes, start with read-aloud", 2026-11-05)

- [x] ISC-116: dist/main.js evaluates under a require that throws for every name but obsidian.
- [x] ISC-117: no non-test file under src/ statically imports a Node or Electron module; native access goes through src/platform/native.ts.
- [x] ISC-118: on a platform that is not the desktop app, the plugin starts no remote server and shows no server notice.
- [x] ISC-119: on a platform that is not the desktop app, the toolbar offers no floating window or remote control, and read-aloud offers only engines that run there (ElevenLabs, system voices). Voice tracking stays, through the offline Vosk model (Américo, 2026-11-05: "now voice tracking").
- [x] ISC-120: where Electron is absent and navigator.wakeLock exists, keep-awake holds a screen wake lock while playing and releases it on pause.
- [x] ISC-121: the release main.js carries no inline source map.
- [ ] ISC-122: runtime: on Américo's iPhone, T+ loads in the TP Probe vault, opens a note, and ElevenLabs reads three sentences in a row with no tap between them.
- [x] ISC-123: runtime: on the Mac after this change, the teleprompter opens, read-aloud speaks, and voice tracking starts. Evidence 2026-11-05: view opened, ElevenLabs read-aloud playing (Pause title and stop button after the iOS guard fix), voice button active with "Listening..." 6 s after a click, then stopped.

### Mobile phase 2: voice tracking on the phone (Américo: "yes it moved, now voice tracking", 2026-11-05)

- [x] ISC-128: runtime: on Américo's iPhone, with voice tracking turned on, the microphone button starts the offline Vosk model (downloaded once, then kept on the device), reaches listening, and the text follows his speech; no audio leaves the phone. Evidence: phone7 log downloaded the model in 11.3 s and reached listening; phone8 loaded it from the device in 0.08 s; phone10/11 followed line by line. Vosk runs in the plugin, with no network call after the model download.
- [x] ISC-130: the voice-follow glide lasts the same time at any screen refresh rate (60 Hz, 120 Hz), and a stalled frame cannot leap the whole way. Phone7 log 21:25: model downloaded in 11.3 s, listening 2.3 s later, six final phrases heard; Américo: "it is jumping". The per-frame easing finished twice as fast on the 120 Hz iPhone. Test: bun test src/voice/follow-easing.test.ts. Phone8 logs each follow step to measure what remains.
- [x] ISC-131: Settings, Toolbar has a "Phone toolbar" section where voice tracking, speed, font size and read aloud can each be turned off on the phone; play/pause and the clock always stay, and the choice never changes the desktop toolbar (Américo, 2026-11-05: "read alound does not suit to everybody so the end user should have a option in settings"). Evidence: test ISC-131; Mac settings showed the section with four switches, all on by default, phoneToolbarHidden [] after reload.
- [x] ISC-132: on the phone, voice tracking moves the highlight and the page in small steps while he speaks, not in paragraph-sized jumps. Phone8 log 21:31: finals of 4, 19 and 28 words 9 to 13 s apart and no follow step, on a note that fits one screen. Phone9 logs every partial and match, with a longer "Voice test" note so the page has to scroll. Phone9 log 21:37: 293 partials in 2 s, most repeats, arriving in same-millisecond bursts, while the log rewrote its note after every line; local matching advanced 178 to 182 one word at a time. The log itself may have stalled the phone, so phone10 saves at most once a second and collapses repeats before any smoothness fix is judged. Phone10/11 log 21:42 to 21:43 on "Voice test": 131 changed partials, 6 finals, 0 errors, 20 follow steps about 1 to 2 s apart (line by line), no same-millisecond bursts; Américo: "Nice".
- [ ] ISC-133: on a phone the reading column uses the screen width (room for the reading arrow on the left, a small margin on the right) and the text never sits under Obsidian's floating header buttons (Américo, 2026-11-05: "better scatter on this black empty space? but not behind the obsidian control icons"). Source test passes; simulated at 390 px: text starts beside the arrow, about 40 px in, top below a 103 px header. Open until his iPhone shows it (phone11).
- [x] ISC-129: tapping the microphone button while voice tracking is off in settings says how to turn it on, instead of doing nothing.
- [x] ISC-124: on a phone the teleprompter opens in the main page rather than the side drawer, shows no keyboard hints, starts with the section panel closed, fits its toolbar in 390 points, and sizes headings to the reading column.
- [x] ISC-125: on a phone the controls sit at the bottom within thumb reach, above Obsidian's navigation bar, and nothing sits under the status bar (Américo, 2026-11-05: "the controls on the top are hard to reach"). Source test passes; his iPhone showed it at 16:04 (phone3): controls at the bottom, text clear of the status bar.
- [ ] ISC-127: on a phone every toolbar menu opens upward, above the bar and across the screen, never under Obsidian's navigation bar (Américo, 2026-11-05: "it open below obsidian mobile tool bar"). Source test passes; seen opening upward on the Mac with the phone class at 390 px; open until his iPhone shows it (phone5).
- [x] ISC-126: on the iPhone, tapping read-aloud leaves idle, highlights the first sentence and speaks it in the system voice. Phone3 stayed idle with no highlight (Américo, 2026-11-05: "when I read it aloud does not move"); the same Web Speech path on the Mac speaks and advances, so the cause is phone-only. Phone4 carries a test-only log (TP_PHONE_LOG=1, src/platform/phone-log.ts) that writes each step to "T+ phone log.md" in the vault. Phone5 log, 21:14: every tap ended in "REJECTION path is not available on this device" from an isAvailable getter: Obsidian on iOS reports Platform.isMacOS true, so Kokoro, macOS Say and the Apple helper passed their Mac guard and reached for Node. Fix: those guards also require native.hasNode(); test fails on the old engines and passes on the new (red-green run). Phone6 shipped. Phone6 log, 21:17: engine Web Speech, 7 sentences prepared, sentence starts 0 to 6 from 42.987 s to 57.310 s with one tap, 1.2 to 3.4 s apart, state playing. ISC-122 stays open for ElevenLabs on the phone, which needs his key entered on the device.

- [x] ISC-134: while he reads, the Jump to Section list scrolls itself so the current section sits about a third from the top with the next titles visible below it; after he scrolls the list by hand it holds still about 5 s before following again; a current section hidden inside a collapsed parent highlights that parent (Américo, 2026-11-25: "I'm in the cloud section but the sections on the jump section still at opening").
- [x] ISC-135: the progress block above the section list is one compact row (a thin bar plus "67% · ~3 min · 1,230 words"), same data and same rule for when the time shows, leaving the room to section titles (Américo, 2026-11-25: "make more room for the sections titles").
- [x] ISC-136: the current section in the list is readable from teleprompter distance: a stronger fill than hover and a triangle marker drawn in CSS, no emoji.
- [x] ISC-137: when the prompter enters a new section, the note pane scrolls that heading to its top (about 30 px down), not its middle; double-click-to-edit still centres the cursor (Américo, 2026-11-25: "can the head line show on the top instead of the middle"). Live: heading 29 px below the pane top of 834 px.
- [x] ISC-138: while a script floats (the Elgato Prompter window), clicking a title in the main view's Jump to Section list moves the floating script to that section too, not only the main view (Américo, 2026-11-25: "the window on the elgato does not move as I click on the jump to section header"). Live: clicks on Cloud, then SQL, put each heading at the top of the Elgato window (screenshots elgato-fix-Cloud/SQL).
- [x] ISC-139: while a script floats, the section being read in the floating window (by voice, play or scroll) is the section highlighted and followed in the main view's Jump to Section list, and the note pane follows it when scroll sync is on (Américo, 2026-11-25: "the main app section is not following what I reading in my elgato teleprompter"). Live: three next-section steps on the Elgato window (Work authorization, Location, Salary) each highlighted the same title in the main list; screenshots show Salary on the Elgato, "20. Salary" in the main list and the note pane on Salary. Unit test: reportSection fires once per new section, only while floating.
- [x] ISC-140: while a script floats, the main view's own script also moves to the heading of the section being read on the floating window, one section at a time, without pausing anything or touching the floating view's voice tracking (Américo, 2026-11-25: "yes, make the main text follow too"). Live: scrolling the floating script to Cloud, SQL, then Salary put the main text, the main list and the note pane on the same section each time (screenshot main-text-follow.png). Superseded the same day by ISC-141 (line-level mirroring); the section-level scroll was removed so the two cannot fight.
- [x] ISC-141: while a script floats, the main view's middle panel mirrors the floating script line by line: the word at the floating view's eyeline is placed at the main view's eyeline within about 200 ms, during voice tracking, play and manual scroll, without pausing or re-anchoring the floating view's voice (Américo, 2026-11-25: "I like the middle panel to move as the elgato move following the same"). Live: the floating script stepped down 70 px at a time through Performance; after the last step both screenshots (mirror-main.png, mirror-elgato.png) show the same lines, "When a dashboard was slow, / I turned on a performance recording / in Tableau Server", mid-section. Not yet exercised with real voice tracking or play.
- [x] ISC-142: while a script floats, the main view's middle panel glides with the floating script the way the Elgato window does: the floating view reports a fractional position in word space (the word at its eyeline plus how far its eyeline sits between that line's first word and the next line's), on every scroll event, and the main view eases toward the same fractional position in its own wraps every frame of the main window, so no frame moves it more than about 4 px and it never sits still for more than 6 frames while the floating script moves 1 px a frame (Américo, 2026-11-25: "can the middle panel move smooth like in elgato please?"; Fable measured the old mirror at 67-68 px jumps in one frame, 184-350 ms late). Live, Fable's probe (floating +1 px a frame for 300 frames, main sampled 420 frames): before maxStep 68 px, worstStall 68 frames; after, at eight spots down and up the script, maxStep 1-2 px and worstStall 1-2 frames. The one exception is the last screen of the script, where the main view reaches the bottom of its scroll range and cannot follow further. Under play (0.25 px a frame) maxStep 1 px. Screenshots glide-elgato.png and glide-main.png show "Then we fixed the calculations" at both eyelines; glide-jump-*.png show a real click on "15. Cloud" in the main list moving the Elgato to Cloud (ISC-138) with Cloud highlighted in the main list (ISC-139). Not yet run with real voice tracking.
## Anti-criteria

- ANTI-1: a floating window that cannot be unlocked: no path may start locked or leave the window click-through after `exit()`.
- ANTI-2: README or UI text that promises the window is hidden from screen share.

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
| ISC-18 | bash | README has no pin-window claim | exit 1 | rg -q -i "pin window" README.md |
| ISC-12 | bash | type check clean | exit 0 | bun run check |
| ISC-19 | bash | test suite clean | exit 0 | bun test |
| ISC-4 | bun-test | Svelte applyVoicePreset has no stop or toggle restart | pass | bun test src/voice/svelte-voice-wiring.test.ts -t "no restart in svelte" |
| ISC-10 | bun-test | Svelte does not force active right after start | pass | bun test src/voice/svelte-voice-wiring.test.ts -t "active not forced after start" |
| ISC-20 | bun-test | old helper without prompt field gets the long limit | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "old-style helper" |
| ISC-21 | bun-test | stale output from a killed helper cannot touch a new run | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "cannot poison a newer run" |
| ISC-22 | bun-test | endless recognition errors become a reported error | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "recognition loop" |
| ISC-21 | bun-test | a line after a run-ending line in the same chunk is dropped | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "same chunk" |
| ISC-24 | bun-test | slow recognition errors never fail the run | pass | bun test src/voice/apple-speech-recognizer.test.ts -t "slow errors" |
| ISC-23 | bash | lint clean on voice sources | exit 0 | bunx eslint src/voice |
| ISC-25 | bun-test | hung mic request times out | pass | bun test src/voice/with-timeout.test.ts -t "hung mic request" |
| ISC-25 | bash | Vosk start wraps getUserMedia in the timeout | exit 0 | rg -q "withTimeout\(" src/voice/vosk-recognizer.ts |
| ISC-26 | bun-test | all-zero stream reported, room noise not | pass | bun test src/voice/silent-mic-watch.test.ts |
| ISC-27 | bash | modal builds its list from the changelog | exit 0 | rg -q "parseReleaseNotes\(changelog" src/whats-new-modal.ts |
| ISC-27 | bun-test | changelog bullets parsed per version | pass | bun test src/release-notes.test.ts -t "bold lead" |
| ISC-28 | bun-test | current version has release notes | pass | bun test src/release-notes.test.ts -t "current version has release notes" |
| ISC-26 | bash | Vosk feeds every chunk to the watch | exit 0 | rg -q "silentWatch\?\.feed" src/voice/vosk-recognizer.ts |
| ISC-44 | bun-test | play and reset emit the OBS sync events | pass | bun test src/audit-fixes.test.ts -t "obs sync" |
| ISC-45 | bun-test | release-notes toggle exists and the hint names it | pass | bun test src/audit-fixes.test.ts -t "release notes toggle" |
| ISC-46 | bun-test | no placeholder owner in About links | pass | bun test src/audit-fixes.test.ts -t "about links" |
| ISC-47 | bun-test | dead voice controls are gone | pass | bun test src/audit-fixes.test.ts -t "dead voice settings" |
| ISC-29 | bun-test | enter and exit set on-top and all-workspaces | pass | bun test src/floating/floating-window.test.ts -t "on top" |
| ISC-30 | bun-test | lock, unlock, exit unlocks first | pass | bun test src/floating/floating-window.test.ts -t "click-through" |
| ISC-31 | bun-test | see-through clamped | pass | bun test src/floating/floating-window.test.ts -t "clamped" |
| ISC-32 | bun-test | enter never starts locked | pass | bun test src/floating/floating-window.test.ts -t "never starts locked" |
| ISC-33 | bun-test | button gated by platform, manifest desktop-only | pass | bun test src/floating/floating-wiring.test.ts -t "platform gate" |
| ISC-34 | bun-test | frames and timers come from the content's window | pass | bun test src/floating/floating-wiring.test.ts -t "own window" |
| ISC-35 | manual | minimized main, Zoom full screen, 60 s read, no stall over 2 s | Américo at the Mac | real Zoom test call |
| ISC-36 | manual | locked click reaches Zoom; handle unlocks | Américo at the Mac | real Zoom test call |
| ISC-37 | bash | README states the measured share results | exit 0 | rg -q "did not show when sharing another app" README.md |
| ISC-38 | bun-test | closing while voice runs stops it and tells the main window | pass | bun test src/floating/floating-wiring.test.ts -t "close stops voice" |
| ISC-39 | bun-test | off-screen bounds rejected | pass | bun test src/floating/floating-window.test.ts -t "bounds" |
| ISC-40 | bun-test | floating pins the requested note | pass | bun test src/floating/floating-wiring.test.ts -t "pins note" |
| ISC-41 | bun-test | missing window controls give null, no throw | pass | bun test src/floating/floating-window.test.ts -t "no electron window" |
| ISC-41 | bun-test | wiring shows the Notice | pass | bun test src/floating/floating-wiring.test.ts -t "fallback notice" |
| ISC-42 | bun-test | voice failure sets the in-window banner | pass | bun test src/floating/floating-wiring.test.ts -t "error banner" |
| ISC-43 | bun-test | session unlock, main button, remote command | pass | bun test src/floating/floating-wiring.test.ts -t "three unlock" |
| ISC-48 | bun-test | hand-off stops here and starts there | pass | bun test src/floating/floating-wiring.test.ts -t "voice hand-off" |
| ISC-49 | bun-test | throttling off on enter, on at exit, both windows | pass | bun test src/floating/floating-window.test.ts -t "throttling" |
| ISC-50 | bun-test | outline CSS only under the floating class | pass | bun test src/floating/floating-wiring.test.ts -t "outline" |
| ISC-51 | bun-test | Prompter found by name only | pass | bun test src/floating/floating-window.test.ts -t "prompter display" |
| ISC-52 | bun-test | placement picks Prompter or saved bounds | pass | bun test src/floating/floating-window.test.ts -t "placement" |
| ISC-53 | bun-test | move button, remembered choice, bounds kept | pass | bun test src/floating/floating-wiring.test.ts -t "prompter button" |
| ISC-54 | bun-test | events and the voice button forward to the floating view | pass | bun test src/floating/floating-wiring.test.ts -t "routes commands" |
| ISC-54 | bun-test | session delivers to the attached view | pass | bun test src/floating/floating-window.test.ts -t "forward" |
| ISC-55 | bun-test | chrome hidden only under the Prompter class | pass | bun test src/floating/floating-wiring.test.ts -t "prompter chrome" |
| ISC-56 | bun-test | the view mounts only inside its real window; an unclaimed request is cleared | pass | bun test src/floating/floating-wiring.test.ts -t "real window" |
| ISC-57 | bun-test | a view that does not own the voice never stops or seeks it | pass | bun test src/floating/floating-wiring.test.ts -t "voice owner" |
| ISC-58 | bun-test | losing the Prompter gives a main-screen placement | pass | bun test src/floating/floating-window.test.ts -t "prompter lost" |
| ISC-58 | bun-test | the floating tick rechecks displays | pass | bun test src/floating/floating-wiring.test.ts -t "display change" |
| ISC-87 | bun-test | one command acts once | pass | bun test src/floating/floating-window.test.ts -t "one command" |
| ISC-87 | manual | command opens, command closes, stays closed | one main view left | Obsidian CLI on the live plugin |
| ISC-91 | manual | floating absent on, visible off | frames viewed | Meet outgoing stream; Teams guest in Chrome |
| ISC-92 | bun-test | no emoji in source | pass | bun test src/no-emoji.test.ts |
| ISC-93 | bun-test | forward is claimed once | pass | bun test src/floating/floating-wiring.test.ts -t "floating script receives it once" |
| ISC-59 | bun-test | language detection | pass | bun test src/voice/voice-language.test.ts -t "detect" |
| ISC-60 | bun-test | note, setting, script order | pass | bun test src/voice/voice-language.test.ts -t "order" |
| ISC-61 | bun-test | menu options offered | pass | bun test src/floating/floating-wiring.test.ts -t "language menu" |
| ISC-61 | bun-test | saved en-US migrates once, through the real defaults | pass | bun test src/voice/voice-language.test.ts -t "migration" |
| ISC-62 | bun-test | helper refuses, older helper not trusted | pass | bun test src/voice/voice-language.test.ts -t "on-device only" |
| ISC-63 | bun-test | fallback to Vosk, remembered | pass | bun test src/voice/voice-language.test.ts -t "offline fallback" |
| ISC-64 | bun-test | new language gets a new recognizer | pass | bun test src/voice/voice-language.test.ts -t "switching script language" |
| ISC-65 | bun-test | accents and numbers | pass | bun test src/voice/voice-language.test.ts -t "Portuguese tracking" |
| ISC-66 | manual | spoken Portuguese moves the prompter | scroll position rises | /usr/bin/say with a Portuguese voice, real mic |
| ISC-67 | manual | English voice reaches Listening | status shows Listening | rebuilt helper on this Mac |
| ISC-68 | bun-test | a modify event on the prompted note re-renders the script | pass | bun test src/live-refresh.test.ts -t "refreshes" |
| ISC-68 | manual | edit in the editor shows up in the prompter | under 3 s | Obsidian CLI on the live plugin |
| ISC-69 | bun-test | reading position maps to the same passage after an edit above it | pass | bun test src/live-refresh.test.ts -t "keeps passage" |
| ISC-69 | manual | scrolling script keeps playing through an edit | passage unchanged, still playing | Obsidian CLI on the live plugin |
| ISC-70 | manual | helper pid unchanged, edited words move the prompter | same pid, scroll rises | /usr/bin/say, real mic |
| ISC-71 | bun-test | other notes ignored, pinned note refreshes | pass | bun test src/live-refresh.test.ts -t "only the prompted note" |
| ISC-72 | bun-test | clicked word resolves to its source line through the source map | pass | bun test src/note-jump.test.ts -t "source line" |
| ISC-72 | manual | real double-click lands the cursor on the line, note pinned | line matches | interceptor macos click on a test note |
| ISC-74 | manual | voice continues from the clicked passage | scroll rises from there | /usr/bin/say, real mic |
| ISC-75 | bun-test | a saved position loads from settings data, not memory | pass | bun test src/position-memory.test.ts -t "restart" |
| ISC-75 | manual | position restored after a plugin reload | same passage | Obsidian CLI on the live plugin |
| ISC-76 | bun-test | record has no pixels, rename carries it | pass | bun test src/position-memory.test.ts -t "record" |
| ISC-77 | bun-test | past-end clamps, cap holds, deleted notes dropped | pass | bun test src/position-memory.test.ts -t "bounds" |
| ISC-78 | manual | frames viewed for both shares | result recorded in Decisions | real Zoom meeting, nobody else in it, local recording |
| ISC-79 | bash | no hidden-from-share promise beyond the measured result | exit 1 | rg -q -i "hidden from screen" README.md |
| ISC-80 | bun-test | cues wrapped; lookalikes left alone | pass | bun test src/parser/stage-cues.test.ts -t "render" |
| ISC-80 | manual | `[pause]` gone from the screen, dimmed under the setting | capture viewed | live plugin |
| ISC-81 | bun-test | cleaner strips cues | pass | bun test src/parser/stage-cues.test.ts -t "read-aloud" |
| ISC-82 | bun-test | tokenizer and DOM word walk skip cues | pass | bun test src/parser/stage-cues.test.ts -t "voice" |
| ISC-83 | bun-test | hold decision, auto against manual | pass | bun test src/wake-hold.test.ts |
| ISC-83 | manual | a display-sleep assertion exists while playing and is gone after | seen in pmset | pmset -g assertions |
| ISC-84 | bun-test | page keys defined, merged through the real validator | pass | bun test src/pedal-keys.test.ts -t "page keys" |
| ISC-86 | bun-test | remote scroll moves voice | pass | bun test src/pedal-keys.test.ts -t "stream deck" |
| ISC-86 | manual | remote scroll holds and voice follows from there | no pull-back, scroll rises | scroll event on the live plugin, /usr/bin/say |
| ISC-85 | bun-test | arrow mode routes to pages, README says focused | pass | bun test src/pedal-keys.test.ts -t "arrow mode" |
| ISC-88 | bun-test | a re-read tail resolves behind the place, one misheard word allowed | pass | bun test src/voice/reread.test.ts -t "goes back" |
| ISC-88 | manual | a passed line spoken aloud moves the script back | scroll falls, then follows | natural test voice, real mic |
| ISC-89 | bun-test | twins, forward lag and short tails answer -1; one reading never commits | pass | bun test src/voice/reread.test.ts -t "stays" |
| ISC-90 | manual | cue not heard | Américo's ear | T on a note with a cue |
| ISC-94 | bun-test | engine takes a new voice; panel saves to the ElevenLabs field | pass | bun test src/tts/read-aloud.test.ts -t "voice selector" |
| ISC-95 | bun-test | signature differs on each field and init compares it | pass | bun test src/tts/read-aloud.test.ts -t "takes effect" |
| ISC-96 | bun-test | money forms | pass | bun test src/parser/speech-normalizer.test.ts -t "money suffix" |
| ISC-97 | bun-test | province and month | pass | bun test src/parser/speech-normalizer.test.ts -t "province and month" |
| ISC-98 | bun-test | e-mail, phone, number sign | pass | bun test src/parser/speech-normalizer.test.ts -t "contact details" |
| ISC-99 | bun-test | pipes and plus | pass | bun test src/parser/speech-normalizer.test.ts -t "separators" |
| ISC-100 | bun-test | language order | pass | bun test src/tts/read-aloud.test.ts -t "language order" |
| ISC-101 | bun-test | migration through the real defaults | pass | bun test src/tts/read-aloud.test.ts -t "language migration" |
| ISC-102 | bun-test | list parsed, whole words only | pass | bun test src/parser/speech-normalizer.test.ts -t "pronunciation" |
| ISC-103 | bun-test | request carries the settings; defaults unchanged | pass | bun test src/tts/read-aloud.test.ts -t "voice settings" |
| ISC-104 | bun-test | request and cache key carry the context | pass | bun test src/tts/read-aloud.test.ts -t "context" |
| ISC-105 | bun-test | link URL survives the strip, bare URL does not | pass | bun test src/tts/read-aloud.test.ts -t "markdown link" |
| ISC-106 | bun-test | spoken text walks line breaks | pass | bun test src/tts/read-aloud.test.ts -t "line break" |
| ISC-107 | manual | captured plugin audio transcribed | words match | live plugin, mlx_whisper |
| ISC-108 | bun-test | bundle evaluates with obsidian only | pass | bun test scripts/mobile-probe/probe.test.ts -t "require" |
| ISC-109 | bun-test | no network or recognition call in source | pass | bun test scripts/mobile-probe/probe.test.ts -t "network" |
| ISC-110 | bun-test | no recorder or audio write in source | pass | bun test scripts/mobile-probe/probe.test.ts -t "no audio" |
| ISC-111 | bun-test | report saved after each step | pass | bun test scripts/mobile-probe/probe.test.ts -t "after every step" |
| ISC-112 | bun-test | hung step times out, next runs | pass | bun test scripts/mobile-probe/probe.test.ts -t "timeout" |
| ISC-113 | manual | report read back | every section present | Obsidian CLI on the Mac |
| ISC-114 | manual | report note appears on the Mac | note present | iCloud, Américo's iPhone |
| ISC-115 | manual | Microphone only row from the iPhone | a peak above 0 | iCloud report, Américo's iPhone |
| ISC-116 | bash | bundle loads under phone require | PASS both modes | bun run build && bun scripts/mobile-load-check.ts |
| ISC-117 | bun-test | no static Node import | pass | bun test src/platform/mobile.test.ts -t "ISC-117" |
| ISC-118 | bun-test | server gated on device | pass | bun test src/platform/mobile.test.ts -t "ISC-118" |
| ISC-119 | bun-test | phone surface filters, phone bar and More sets exclude every desktop-only control | pass (348/348, 2026-11-05) | bun test src/platform/mobile.test.ts -t "ISC-119" |
| ISC-120 | bun-test | wake lock held and released | pass | bun test src/platform/mobile.test.ts -t "ISC-120" |
| ISC-121 | bun-test | no inline map | pass | bun test src/platform/mobile.test.ts -t "ISC-121" |
| ISC-122 | manual | three sentences, no tap | heard | Américo's iPhone, TP Probe vault |
| ISC-124 | bun-test | phone page layout | pass | bun test src/platform/mobile.test.ts -t "ISC-124" |
| ISC-125 | bun-test | phone controls at the bottom, clear of status bar and navbar | pass | bun test src/platform/mobile.test.ts -t "ISC-125" |
| ISC-126 | bun-test | every isMacOS check in the engines also requires Node (red on old code, green on new) | pass | bun test src/platform/mobile.test.ts -t "ISC-126" |
| ISC-129 | manual | notice when voice is off | the Notice call sits in toggleVoiceTracking's disabled branch; no test drives the Svelte component | read src/TeleprompterApp.svelte toggleVoiceTracking |
| ISC-130 | bun-test | glide time equal at 60 and 120 Hz, stalled frame bounded | pass | bun test src/voice/follow-easing.test.ts |
| ISC-131 | bun-test | phone toolbar choices, play/pause kept, desktop untouched | pass | bun test src/platform/mobile.test.ts -t "ISC-131" |
| ISC-133 | bun-test | phone column clears header buttons and uses the width | pass (source); runtime on his iPhone open | bun test src/platform/mobile.test.ts -t "ISC-133" |
| ISC-134 | bun-test | follow target a third down, clamped, pause after manual scroll, collapsed parent | pass (14 tests); live 2026-11-25: prompter at Cloud put the Cloud row 255 px down a 673 px list. The 5 s pause and the collapsed-parent case are proven by unit test only | bun test src/nav-follow.test.ts |
| ISC-135 | manual | compact progress row in the live panel | pass: one row "67% · ~3 min · 1,279 words", block 36 px tall (was about 100) | screenshot of the panel in Obsidian, 2026-11-25 |
| ISC-136 | manual | active title marked and filled | pass: triangle in the gutter, title number kept, with his teleprompter-jump-readable snippet on | screenshot of the panel in Obsidian, 2026-11-25 |
| ISC-137 | manual | section heading at top of note pane | pass: heading 29 px below the pane top after next-section, Obsidian inline title offset included | obsidian eval coordsAtPos plus screenshot, 2026-11-25 |
| ISC-142 | bun-test | line table, smoothed word-space map invertible and monotone, two views with different wraps glide under 4 px a pixel (the lone-word line too); live probe maxStep ≤ 4 px, worstStall ≤ 6 frames | pass: 13 unit tests; live maxStep 1-2 px, worstStall 1-2 frames at eight spots (was 68/68) | bun test src/passage-dom.test.ts src/floating; Fable's obsidian eval probe, 2026-11-25 |
| ISC-11 | manual | retired criterion, kept for history | superseded by ISC-68, which made the claim true; nothing left to assert | none |
| ISC-123 | manual | Mac still works | opens, speaks, voice starts | Obsidian CLI on the Mac |
| ANTI-1 | bun-test | exit leaves the window clickable | pass | bun test src/floating/floating-window.test.ts -t "click-through" |
| ANTI-2 | bash | no hidden-from-share promise | exit 1 | rg -q -i "hidden from screen" README.md |

Runtime acceptance (real mic, real TCC prompt on macOS) needs Américo at the Mac: denied permission → message + Settings path; granted → tracking starts; preset switch mid-read keeps position.

## Features

### F1: Recover stranded rehearsal work
Criteria: ISC-1, ISC-2, ISC-3
Lane: inline

### F2: Voice start never fails silently
Criteria: ISC-6, ISC-7, ISC-14, ISC-8, ISC-15, ISC-9, ISC-16, ISC-10, ISC-17, ISC-20, ISC-21, ISC-22, ISC-24
Lane: Sol · high

### F3: Preset change in place
Criteria: ISC-4, ISC-5, ISC-13
Lane: Sol · high

### F4: Honest README
Criteria: ISC-11, ISC-18, ISC-12, ISC-19, ISC-23
Lane: Sol · high

### F5: Live refresh
Criteria: ISC-68, ISC-69, ISC-70, ISC-71
Lane: inline

### F6: Jump between prompter and note
Criteria: ISC-72, ISC-74
Lane: inline

### F7: Remembered position
Criteria: ISC-75, ISC-76, ISC-77
Lane: inline

### F8: Screen-share test
Criteria: ISC-78, ISC-79
Lane: inline

### F9: Stage cues
Criteria: ISC-80, ISC-81, ISC-82
Lane: inline

### F10: Auto wake lock
Criteria: ISC-83
Lane: inline

### F11: Pedal keys
Criteria: ISC-84, ISC-85, ISC-86
Lane: inline

### F12: Read-aloud fixes
Criteria: ISC-94, ISC-95, ISC-96, ISC-97, ISC-98, ISC-99, ISC-100, ISC-101, ISC-102, ISC-103, ISC-104, ISC-105, ISC-106, ISC-107
Lane: inline

### F13: Mobile phase 0 probe
Criteria: ISC-108, ISC-109, ISC-110, ISC-111, ISC-112, ISC-113, ISC-114, ISC-115
Lane: inline

## Fog

- A Pandoc line block (`| Name` lines in a cover letter) still shows its pipes on screen, seen 2026-11-05. Speech is clean. Not fixed: not asked.
- A speech helper once kept running after voice stopped, seen 2026-11-05 during Américo's test run, not reproduced. Exact trigger unknown; check `pgrep -f teleprompter-stt` after any voice test.
- Every other surface of the plugin (Stream Deck actions, TTS, remote, OBS, timer) has no criteria yet; a `Skill("ISA", "seed")` pass later.

## Decisions

- 2026-11-25: ISC-142 deviates from Fable's design in one place, on evidence. With straight per-line interpolation in word space the first live probe passed at 2 px, but scrolling up from 13000 px the main view ran 5-6 px a frame for 15 frames: a wrap had left a few words a line of their own in the main view and not in the floating one, and the easing (a time constant of about 4 frames) cannot absorb a burst that long. Each view's word-to-y map is now `lineY` averaged over 6 words either side (SMOOTHING_WORDS, an exact box average from a running area), which stays monotone and invertible, keeps the eyeline word within half a line, and makes the speed in each view the pixel height of the same run of words. The unit test reproduces it: a lone-word main line steps 8.2 px a pixel unsmoothed, under 4 smoothed. Also: the main list click now stops a glide in flight, so the heading the main view jumps to is not pulled back.
- 2026-11-05: ISC-113: probe run in real Obsidian on the Mac, every step reported, microphone peak 0.0549, three tones played, then the plugin and its note were removed from his vault. That first run found voices reading 0 because the list loads late; fixed and tested in the suite, not rerun live. Probe source: scripts/mobile-probe/. Installed in the iCloud vault "TP Probe"; all four files report uploaded. Whether Obsidian iOS shows that vault and carries its plugin is ISC-114, open until a report comes back.
- 2026-11-05: ISC-114 closed: three reports came back from the iPhone (iOS 18.7, Obsidian 1.15.0) through iCloud. Node modules return undefined instead of throwing; lookbehind, WebAssembly, Blob workers, AudioWorklet at 48 kHz, wake lock and 40 MB of IndexedDB all work; 68 voices (25 English, 2 Portuguese); tones play with no tap after the first, and speech synthesis speaks. The microphone was granted but read exactly 0.0000 over 1.5 s after the tones and speech, a silent stream rather than a quiet room. ISC-115 added: a microphone-only button that runs from its own tap for 5 s, read by an analyser and an AudioWorklet (no recorder or script processor, ISC-110). Proven on the Mac (peaks 0.034 and 0.054), then sent to the iCloud vault.
- 2026-11-05: ISC-115 closed: the 20-25-05 iPhone run read microphone peak 0.0188 after the tones and speech, in the same full run that read 0.0000 the first time. The phone was still on the old bundle (old row format), so this is the analyser reader only. The first zero most likely came from the first permission prompt covering the 1.5 s window; with permission granted, the mic delivers sound. Phase 0 is done: read-aloud and microphone both work on iOS 18.7.
- 2026-11-05: Phase 1 slice built. Native modules go through src/platform/native.ts; server and OBS gated by canRunDesktopMachinery; phone layout drops float, detach, voice tracking, the Connection and Streaming tabs, Kokoro and macOS Say; keep-awake moved to src/platform/screen-hold.ts (Electron, else navigator.wakeLock with re-request on return). Inline source map off by default (TP_SOURCEMAP=1 restores it): main.js 17.0 MB to 6.3 MB. Mac check: plugin loads, server runs, teleprompter opens, ElevenLabs read-aloud produced 2 clips in 6 s, keep-awake started 4 blockers for 4 open views and released all 4; three blockers (8, 9, 10) were already active before the change. Voice tracking start on the Mac not yet rechecked, so ISC-123 stays open. manifest.json in the repo keeps isDesktopOnly true: flipping it is a release decision; the TP Probe copy says false. Installed in TP Probe with a test note; ElevenLabs key not copied to iCloud.
- 2026-11-05: First iPhone screenshot: T+ loaded but opened in the right drawer, the desktop toolbar piled up, and the keyboard hint covered the text. Fixed as ISC-124: phone bar of play, speed, reset, font size, read-aloud, More; toggles in More; desktop-only and colour or spacing controls left for the desktop. Checked under emulateMobile at 390 px: bar scrollWidth 390 = clientWidth, six buttons, no hint, headings fit. emulateMobile shrank Américo's Mac window to 392 px; restored to 2022x934 and the teleprompter tab refocused. Gotcha: never use emulateMobile on his main window; it resizes it.
- 2026-11-05: Mobile evaluation by Fable (vault Sync was assumed in my brief): same plugin, reading first, voice tracking after a probe. Américo's "Yes" covers phase 0 only; mobile stays Out of Scope for T+ code until the probe has run. Correction: core-plugins.json showing sync on only means the plugin is enabled. Live, Sync reads vaultId null, status Uninitialized, no account signed in, so Fable's U8 and "syncs back" do not hold. Delivery moved to a throwaway vault in the iCloud Obsidian container, which exists and is syncing on this Mac: the phone opens it, and the report note returns the same way. It stays off his real vault and needs no public repo.
- 2026-11-05: F12 live on his Mac, build in the vault, plugin reloaded. ISC-107: the full cover letter read by the plugin in his clone voice, 20 clips captured at the audio element, no console error; Whisper read back "Ontario", "555$1012$23456", "number three two two five zero", "US$1 billion", "jane.doe at example.com". Whisper autocorrects and cannot judge accent, so this proves words, not sound. "RE:" did not appear in the transcript: unknown whether it was spoken. ISC-95: voice ID changed live with no reload, the next start spoke a clip of 10.2 s against the clone's 13.5 s. ISC-94: the real panel listed 29 voices, choosing Daniel saved elevenLabsVoiceId and left ttsVoice alone, and the next clip was 14.7 s. Clip hashes prove nothing here: the same voice and text gave a different hash. ISC-100: a throwaway Portuguese note was detected as pt with no English number words in the transcript; "arroba" was not transcribed, so that word is unproven. ISC-105: the résumé header on screen now reads "LinkedIn | GitHub | Tableau Public" with 4 links. His saved voice stayed the clone; his list holds "FICO = Fye-co", after which Whisper heard FICO where it had heard "Faisal". Américo's purpose, 2026-11-05: a professional voice to listen to and learn the pronunciation, so the normalizer's spoken forms are also what he learns from. Review.ts not run: the plugin has no CfEnv deploy, and foreign docs work keeps the tree dirty.
- 2026-11-05: Read-aloud test on Américo's word, résumé and cover letter open. Contract probes through his key with his clone voice: previous_text and next_text are accepted and gave "Brazil" where the plain request gave "Brasil" (one sample, Whisper-read, so a hint and not a proof); language_code is accepted on Multilingual v2 and did not help, so it is not sent. "FICO" came back as "Faisal", the case for a pronunciation list.
- 2026-11-05: Américo: "I don't wanna see those emoji icons again on t+". All interface emoji replaced by Lucide icons, held by src/no-emoji.test.ts and a rule in CLAUDE.md. Pre-release review blockers fixed: commands forwarded once per view (ISC-93); stage-cue stripping now reads the whole note, so a reference link keeps its words when spoken.
- 2026-11-05: Release 0.12.0 on Américo's "yes. let's ship". What's New tested through a simulated update from 0.11.9: right version, top 8 highlights with a link to the rest, Lucide icons in place of emoji on his word, no raw backticks. docs/RELEASING.md corrected, since it still said the window was hand-written. The docs-site work stayed out of this release. Local commits were squashed into one, because some carried private paths and names.
- 2026-11-05: ISC-91 on Américo's "yes test teams and meet". macOS 26.5.1, entire-screen share of the EI491CR display, floating at 1000,-950, nobody else in either meeting. Google Meet in Chrome 156: frames from the page's own 3840x1080 stream, on: absent, off: present. Microsoft Teams 26289: a guest joined from Chrome as a real second participant; its view, on: absent, off: present, both the same second apart. Window shares were not retested on Meet or Teams. Mic and camera were never granted to the guest. Frames deleted. The Teams link replaced his clipboard.
- 2026-11-05: Elgato pedal tested on the hardware by Américo: "we already test and is working".
- 2026-11-05: ISC-90 closed on Américo's ear: "8 also is working". The earlier report was not reproduced, and no code changed between his two tries except the re-read work, so the first cause stays unknown.
- 2026-11-05: Américo tried reading a line again with his own voice on the rehearsal notes: "now is working".
- 2026-11-05: ISC-88 live, ElevenLabs voice through the speakers into the MacBook mic. English: read forward to 799 px, a passed line spoken again moved it to 290, continuing moved it to 535. Portuguese on Vosk first failed: the recognizer drops "o" and "a", so the heard words did not line up and it went forward (745 to 877). The match now allows short gaps; retest: 667, back to 349, then 481. ISC-89 has tests; a forward read in both runs did not jump back.
- 2026-11-05: Américo's screenshot of "The speech helper stopped unexpectedly (exit code 0)". Mine: I killed a leftover helper by hand during the test. Proven: killing a running helper gives that exact Notice, and the next start clears it. That leftover helper is the open question. It had run since about 10:29 while he tested, with no floating window open, and survived his voice being stopped. A plugin reload with voice on left 0 helpers, so its cause is not reproduced. Into Fog.
- 2026-11-05: Américo's test run. Steps 2 and 3: voice is lost when he reads back a line above. Not a bug in the build: forward-only was chosen on purpose after backward global matches flung the highlight to earlier copies of a repeated phrase. ISC-88/89 add a narrow way back: six words, one miss allowed, unique in range, a second reading that moved on. Step 7: my instruction was wrong, the card is under the Features tab, in the collapsed Advanced group. Step 8: not reproduced: on the live plugin the sentences prepared for speech were "Cue test.", "First sentence here for reading.", "Second sentence goes after the cue.", "We shipped it.", from a note holding [pause] and [STAR: Situation]. His engine is ElevenLabs. ISC-90 stays open until he hears it. Step 12: a MacBook has no PageDown key: fn + down arrow.
- 2026-11-05: ISC-79 closed on Américo's word, "yes I can", with the protected window on his wide monitor: every capture tool is blind to it by design, so his eyes were the only check. The Elgato pedal press itself remains untested on hardware.
- 2026-11-05: ISC-78 measured, against the 2026-10-30 expectation. Real Zoom 7.1.9 meeting on macOS 26.5.1, nobody else in it, content protection on, floating window on EI491CR at 1000,-950. Local recording frames viewed: entire-screen share of that display: the floating window absent while the terminal under it and the main Obsidian window showed. Sharing the main Obsidian window: its own contents, floating absent. screencapture went blind the same way. Zoom's share picker thumbnail also lacked it. ANTI-2 still holds: UI and README name the measured versions and say to test. The recording went to the Trash and its frames were deleted.
- 2026-11-05: Sonnet's audit of 3847370, dispositioned. Fixed: a view behind a floating window overwrote the note's position; anchor lookup landed 1 to 4 words early on scripts over 2000 words (exact lookup goes first now); cues right after "!" or another cue were missed; a defined reference link could be hidden, now decided by the note's own link definitions; a bracketed word a reader needs, such as [Smith], gets a third "Show normally" choice; a whole-note rewrite cost about 1 s of alignment on the UI thread, now budgeted; floating placed the script by scroll ratio across a different width, now by its words. Left: the hotkey merge restores a key removed by hand, since no UI can remove one. Keep-awake migration is the intended one-time flip.
- 2026-11-05: Live evidence for the build, Obsidian on his Mac, on a throwaway note. ISC-68: an edit appeared in 301 ms. ISC-69: an insert above the reader moved scrollTop 4893 to 5290 with the same sentence at the eyeline; during auto-scroll the button stayed Pause and scrolling continued. ISC-70: English: helper pids 36505/36506 unchanged across the edit, spans 1483 to 1532, new "giraffe" words moved scrollTop 6039 to 6260. Vosk Portuguese: no helper, spans 142 to 160, 298 to 799 px. ISC-71: another note's edit left the script unchanged; a pinned note refreshed. ISC-72: dispatched double-clicks with real coordinates: "the" in paragraph 30 landed on line 77, and with the note pinned and no pane open a pane opened on line 35. A hardware mouse double-click was not used. ISC-74: after a double-click during voice, speech of that paragraph was heard; the marker is off, so landing was not separately measured. ISC-75: reload restored paragraph 26 at 7301 px; a note scrolled to its end kept no position. ISC-76: rename carried the record. ISC-80: captures viewed: "[pausa longa]" absent by default and dimmed under the setting, the sentence after it intact. ISC-83: pmset showed Obsidian's NoDisplaySleepAssertion while playing, gone after pause. ISC-84/85: dispatched keys moved 1000 to 1628 to 2256 px at clientHeight 785. ISC-86: a remote scroll of 5000 px held under voice with no pull-back, and speech moved on from there to 5203. Not tested on hardware: an Elgato pedal press. ISC-78/79 wait for a real Zoom call.
- 2026-11-05: ISC-87's second cause: Obsidian's pop-outs ignore window.close(), on the previous build too (control run: closed stayed false), so the toolbar's float button and command never closed the window. Now closes by detaching its own leaf. Voice tests moved to ElevenLabs on Américo's word ("please use my api key"); test text only.
- 2026-11-05: Live test found the float command reopening the window it just closed: every view hears it, one closed the window and the next started a new one. Earlier cycles were tested through the button, which calls one view. ISC-87.
- 2026-11-05: Américo has an Elgato pedal ("yes I so have elgato pedal ok"). It is a Stream Deck device, so its route is the existing Scroll Up, Scroll Down and Next Section actions, which need no focus and work over Zoom; ISC-86 makes those move voice too. Assigning it is done in the Stream Deck app. Its press has not been tested on the hardware.
- 2026-11-05: Plan approved ("yes"), from Fable's read-only review, its main code claims rechecked by me. ISC-69, 70, 72, 74, 75, 76, 77 reworded because some could not be tested as written and ISC-69 clashed with auto-pause on edit. ISC-73 and fit-to-time moved to 0.13.0: voice ignores scroll speed, and editing while reading is not his loop. The keep-awake setting turned out to be read by nothing, so ISC-83 gives it its first job.
- 2026-11-05: ISC-67 closed. After Américo allowed the microphone, the rebuilt helper reached Listening in English, and a spoken read of the GeoSentinel script through the MacBook mic moved the prompter 0 to 616 px; the badge showed the words it heard. The Zoom test recordings were already in the Trash, and the frames I had extracted from them are deleted.
- 2026-11-05: Américo approved the competitor evaluation ("Yes is approved"): live refresh, prompter-note jump and remembered position join 0.12.0, and hiding from screen share gets a test before any promise. Criteria only so far. Live refresh leaves Out of Scope. When ISC-68 closes, README may state it and ISC-11's "no live-edit claim" row is retired. Screen share: the 2026-10-30 design review expected ScreenCaptureKit to capture protected windows, and web reports agree but are secondary, so ISC-78 is a measurement that may well end in no setting. ANTI-2 still holds. Evidence for demand is thin (top request 9 reactions), so these were chosen for rehearsal value, not votes. Source: vault audit note of 2026-10-29 and GitHub issues and Discussions read 2026-11-05.
- 2026-11-04: Portuguese live: Automatic picked pt-BR for a Portuguese test script, the helper refused, Vosk took over with no error and no helper running, and Luciana's voice on the MacBook mic moved the prompter 0 to 1254 px; the badge showed the Portuguese it heard. Live testing caught two bugs source-text tests had passed: the migration never ran because the default marked it done, and validateSettings reset "auto" to en-US on every load. Both now have tests that run the real functions. The rebuilt helper is a new TCC client: macOS asks for the microphone again, corrects the earlier note that access survives a rebuild. English is blocked on that dialog (ISC-67). Rollback: teleprompter-stt.bak-pre-pt next to the helper. Limit: Portuguese numbers spoken as digits do not get converted to words.
- 2026-11-04: Portuguese design. SFSpeechRecognizer on this Mac reports pt-BR available but supportsOnDeviceRecognition false (probed), and the helper's old behaviour would have sent that audio to Apple's servers silently. Interview scripts and rehearsals stay on the machine: the helper now refuses, and the plugin uses Vosk's offline Portuguese model. If macOS gains on-device pt-BR, Apple is used automatically.
- 2026-11-04: Prompter glass read by Américo: "it reads normally, not mirrored". No automatic flip needed, flipHorizontal stays false. The rest of 0.12.0 (skip stage cues, fit-to-time, auto wake lock, pedal keys) still has no criteria.
- 2026-11-04: ISC-37 measured with Zoom local recordings, frames viewed. Entire screen the script is on: shows. Entire screen it is not on: does not show. Obsidian window: shows, clipped to that window. Chrome window with the script overlapping it: does not show. Criterion reworded from "Window: Zoom" to a single window, because the realistic interview share is another app and Zoom's picker offered no Zoom window. Américo allowed Zoom's screen access for this test ("yes", 2026-11-04). Only macOS 26 with this Zoom version was measured.
- 2026-11-04: Real Zoom meeting, nobody else in it, full screen on the EI491CR display, main Obsidian window minimized, floating locked, voice on the DJI mic. ISC-35: the script stayed visible and followed a spoken read, longest frame gap 18 ms over 15 s (916 frames). The scroll itself moves line by line, so it holds for several seconds on a long line; that is not a stall. ISC-36: a double-click under the locked window took Zoom out of full screen and the floating window saw no mouse event; the corner handle unlocked it; the next click landed on the prompter. ISC-37 is waiting on the macOS prompt that lets Zoom capture the screen, which is Américo's to answer.
- 2026-11-04: Fable's read of the diff, all dispositioned. Adopted: closing the main view stopped the floating voice (reproduced live, helpers 2 to 0, now ISC-57); Prompter presence read only once (ISC-58); forward loop guard; tests that passed with `window.requestAnimationFrame` tightened. Rebutted: menu bar pushing the last line off the Prompter. Live bounds are y -1650, height 570, ending exactly at the display's bottom edge of -1080, and the capture shows the last line. ISC-57 proven live after the fix: main tab closed, helpers stayed 2, floating script moved 0 to 559 px on spoken text. ISC-58 has tests only, because unplugging the Prompter needs a hand on the cable.
- 2026-11-04: Live evidence, Obsidian 1.12.7 on his Mac. ISC-34/48: with the main window minimized and the input on the MacBook mic, spoken script moved the floating view 0 to 2039 px while the main view stayed at 0, one helper running. Repeated on the DJI mic on the Prompter: 0 to 1346 px, capture viewed. ISC-38: with voice confirmed running, 0 helpers 2 s after closing and the main button back to "Start voice tracking". ISC-30/43: real clicks: locked click reached the test window beneath, the unlocked click stayed on the floating window, the handle unlocked with the pointer resting on it, and the main-window button and command both unlocked. ISC-52/55: Prompter capture viewed. Still owed: ISC-35, 36, 37 need a real Zoom call; ISC-42: killing the helper while floating showed the banner in the window, and Retry brought voice back and cleared it. ISC-56: six open and close cycles without a reload, each floating, none pending. ISC-41 has unit and source-text tests only, because a window without controls could not be forced live. An orphaned helper seen once during the stale-request bug did not recur; plugin reload with voice on left 0 helpers.
- 2026-11-04: Review.ts not run: it refuses a dirty tree and the uncommitted docs-site work is not this run's to commit or stash. Fable read the diff instead, on Américo's offer. absence_review skipped for this slice: Fable's design review and this read cover it.
- 2026-11-04: Live test found a pop-out opening plain, with the float request left pending and consumed by the next pop-out. Cause: Obsidian can run a view's onOpen before its container reaches the pop-out document, so isInPopoutWindow() read false at mount. A source-text test could not have seen it. Fixed by mounting only once the view is in the document its leaf's container reports.
- 2026-11-04: Américo asked that the floating window identify his Elgato Prompter and go there. Electron reports it as label "Elgato Prom." 1024x600 (read live), so detection is by name, never by size. Prompter is the default when connected; the button keeps the over-Zoom mode one click away. Mirroring is unchanged: his saved flipHorizontal is false and he already reads T+ on this display, but no tool here can see the glass, so the reading check is his.
- 2026-11-04: Américo's "yes" to adding the three uncovered design points (ISC-48..50) and building. Runtime probe through the Obsidian CLI: pop-out `window.electronWindow` id 3, main id 1, all needed methods present, so the design holds on Obsidian 1.12.7. All plugin code runs in the main window's realm, so throttling goes off on both windows.
- 2026-10-29: Bug 1 (preset switch kills tracking) judged fixed by f86cc00 per Sol audit (inferred, not reproduced); ISC-4/5 remove the restart that still loses position and re-enters bug 2's window.
- 2026-10-29: Cherry-picked 0c09887 with `dist/` hunks dropped (main no longer tracks dist).
- 2026-10-29: Uncommitted docs-site WIP stashed as "docs-site wip 2026-10-29" before the cherry-pick.
- 2026-10-29: Fable review found ISC-14 false on the real helper (stdout listeners survive killHelper; the helper's SIGTERM "stopped" line flips error→off) with a test that could not see it; FakeProc now mimics the farewell. ISC-20..23 added from that review and Sol's compat finding.
- 2026-10-30: 0.12.0 direction confirmed by Américo ("yes, also use fable and sol"): L3 "during a real Zoom/Teams interview the script floats over the call, the voice keeps following him, and the window never gets in the way of his clicks"; L2 = one button floats the pop-out (always on top, adjustable see-through, outlined text), a lock makes clicks pass through with a corner handle to unlock, voice/presets/clock keep working, position and size restored, hidden on mobile. Criteria come from Fable's design review; Sol audits announced-vs-implemented features. Also found: `src/whats-new-modal.ts` shows a hardcoded old feature list labelled with the current version, so 0.11.9 users see stale "what's new".
- 2026-10-30: Fable design review (vault `01-projects/obsidian-teleprompter-plus/2026-10-30-18-10-fable-janela-flutuante-design.md`): build on Obsidian's pop-out; whole-window opacity only (pop-outs are not created transparent); the bare `requestAnimationFrame` in voice-tracking-service.ts:1163/1165 belongs to the main window's realm and stalls when it is hidden (confirmed by Boy reading the lines); macOS ScreenCaptureKit captures even content-protected windows, so screen-share invisibility is never promised. First runtime probe before building: in the pop-out's DevTools, `window.electronWindow.id` differs from the main window's.
- 2026-10-30: ISC-25 aimed at the wrong cause. Voice trace run ymawb (21:25:53, Obsidian mic off): getUserMedia resolved, status reached listening at +17 s, 0 words heard in 24 s. macOS hands a blocked app a silent stream; it does not hang. ISC-25 stays as a cheap guard; ISC-26 fixes what was seen.
- 2026-10-30: Corrects the entry below: the rebuilt helper did NOT re-prompt; its mic access survived the rebuild and is independent of Obsidian's switch.
- 2026-10-29: The native helper ships by hand build (docs/voice-tracking.md §3.2), ad-hoc signed with a cdhash requirement: a rebuild is a new TCC client and re-prompts (inferred). Acceptance includes the rebuild and expects the prompts.

## Status

acceptance: pass 2026-10-30 (all four runtime checks; mic-blocked Notice + Retry seen on the Vosk path, /tmp/clipboard_image_1793396070.png, /tmp/clipboard_image_1793395959.png; Américo: "It work now". Apple-path denial could not be forced on this Mac, see Decisions) — earlier notes: — Américo at the Mac, rebuilt helper (Oct 30 build) + new main.js: granted start → "Listening…" and tracking followed his reading to the end of the GeoSentinel 2-min script ("the track is almost perfect now"); ~3 min silence held position and kept listening (screenshots /tmp/clipboard_image_1793394059.png, /tmp/clipboard_image_1793394287.png). Preset switch mid-read (Voice Pace Presets menu → Rehearsal) kept listening and position ("working great", /tmp/clipboard_image_1793394390.png). Still owed: mic-denied Notice (ISC-17). Deny test 2026-10-30: the Apple helper kept listening with Obsidian's mic switch OFF (it holds its own TCC grant, not listed in Settings; `tccutil reset Microphone com.teleprompterplus.stt` refused, -10814), so a denial could not be forced on the Apple path. With the helper hidden, the plugin fell back to Vosk; with Obsidian's mic OFF, Vosk sat on "Initializing…" with no message (/tmp/clipboard_image_1793394981.png). Cause not yet known (model load vs a getUserMedia that never settles). The Vosk start path has no start timeout: new gap.

## Changelog

- 2026-11-25: ISC-142 added and ticked: the main view glides with the floating script. The floating view reports a fractional word position on every scroll event (throttle and trailing timer gone); the main view eases toward it on its own window's frames, from a cached line table smoothed over 6 words. The mirror no longer uses isProgrammaticJump; the main view's own scroll skips the section recompute while a script floats. Live probe: maxStep 68 to 1-2 px, worstStall 68 to 1-2 frames.
- 2026-11-25: ISC-141 added and ticked: the floating view reports a passage anchor from its scroll handler (throttled to 150 ms plus a trailing report), and the main view resolves it in its own words and scrolls it to its eyeline. The ISC-140 section scroll was removed so the two cannot fight.
- 2026-11-25: ISC-140 added and ticked: followFloatingSection also scrolls the main script to the section heading with a plain scroll under isProgrammaticJump, never jumpToHeader (which pauses and re-anchors voice).
- 2026-11-25: ISC-139 added and ticked. FloatingSession.reportSection carries the floating view's section title to the main view, which highlights it in its list and syncs the note pane; the main script does not scroll, so voice tracking is never re-anchored.
- 2026-11-25: release 0.12.1 on Américo's word ("publish a new release of teleprompter plus"): ISC-134..138 plus the read-aloud work (ISC-94..107) and the 120 Hz glide fix. manifest stays isDesktopOnly true, so the mobile work ships dormant; flipping it remains its own release decision.
- 2026-11-25: ISC-138 added and ticked. Two causes: the main view's list click never left the main view (now forwarded, with the title, since header ids are per-instance ordinals), and in a pop-out the header map stayed empty because `instanceof HTMLElement` rejects pop-out-realm headings (1 of 25 passed; Fable's diagnosis). Fixed by dropping the class check; wiring test guards both. Live on the Elgato: Cloud, then SQL.
- 2026-11-25: ISC-137 added and ticked (section sync puts the heading at the top of the note pane; Américo: "can the head line show on the top instead of the middle"). First try forgot Obsidian's inline title and properties offset (~320 px) and still centred; fixed with documentTop. Live: heading 29 px below an 834 px pane top. Commit a482817.
- 2026-11-25: ISC-134..136 ticked: built, 14 unit tests, checked live in Obsidian on the GuruLink script. The marker is drawn on the row, not the title button, because his vault snippet teleprompter-jump-readable numbers titles with ::before and fills the active one with the accent colour.
- 2026-11-25: ISC-134..136 added (Jump to Section follows the reading, compact progress row, stronger current marker; Américo's plan approval "yes, build it after the call").
- 2026-11-05: ISC-108..114 added, 108..113 ticked (iPhone probe, Américo's "Yes").
- 2026-11-05: ISC-94..107 added and ticked (read-aloud fixes, Américo's "favor corrigir os issues acima").
- 2026-10-29: ISA created for release 0.11.9.
- 2026-10-30: ISC-25, ISC-26 added from the runtime test; ISC-17 and ISC-26 ticked on Américo's screenshots of the blocked-mic Notice with Retry. Blocked-mic text in `src/voice/vosk-recognizer.ts` now says choosing "Later" on the macOS dialog is enough before Retry (his finding). Acceptance pass, 26/26.
- 2026-11-05: Release 0.12.0 cut on Américo's yes.
- 2026-10-30: Release 0.11.9 cut on Américo's "yes for boths": version bump (manifest, package, versions.json), CHANGELOG entry, tag pushed to trigger the release workflow.
- 2026-11-05: ISC-80..85 added, ISC-73 moved to 0.13.0, plan approved.
- 2026-11-05: ISC-68..79 added, unbuilt (competitor evaluation, Américo's yes).
- 2026-10-30: ISC-44..47 added and ticked (audit quick fixes, Américo's "yes"). Dead voice controls were removed rather than wired: wiring them would change a follower Américo just called "almost perfect". Config fields stay, so saved settings still load.
