# Changelog

All notable changes to Obsidian Teleprompter Plus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.2] - 2026-11-25

### Added
- **The main window follows the floating window.** While the script floats (on an Elgato Prompter or over a call), the main window's script glides along with it, line by line, as you read. Its Jump to Section list highlights the section you are in, and the note beside it follows. Scroll the main window yourself and it waits two seconds before following again.

## [0.12.1] - 2026-11-25

### Added
- **Jump to Section follows you.** While you read, the list scrolls to the section you are in and keeps the next few titles in view. Scroll the list yourself and it waits a few seconds before following again.
- **Pronunciations.** A list in settings replaces whole words before they are spoken, in every read-aloud engine. The text on screen never changes.
- **ElevenLabs stability and similarity** are now settings. The defaults keep the old sound.

### Changed
- **Compact progress row.** Percent, time left and word count share one line, so the section list has room for more titles.
- **Clearer current section.** The section you are in has a stronger fill and a marker, readable from teleprompter distance.
- **The note follows to the top.** When the prompter enters a section, the note pane puts that heading at the top instead of the middle.
- **Read-aloud language** comes from the note's properties, then your setting, then the script itself.
- **Read-aloud says things the way people do:** money with currency and K/M/B suffixes, Canadian province codes, months, e-mail addresses, phone numbers and job numbers. Links keep their text, and a line break is a short pause.

### Fixed
- **Section clicks reach the floating window.** Clicking a title in the main window's list now moves the floating window (and the Elgato Prompter) too. Inside the floating window, every section jump used to be ignored.
- **Choosing a read-aloud voice** changes the next ElevenLabs sentence and is saved as the ElevenLabs voice. Engine, key and voice changes apply at the next start, with no reopen.
- **Voice tracking glides at the same speed** on 60 Hz and 120 Hz screens.

## [0.12.0] - 2026-11-05

### Added
- **Floating window.** One button keeps the script on top of other apps, including full-screen video calls. Adjust how see-through it is, and lock it so clicks pass through to the app underneath. Find it in the toolbar's More menu.
- **Hide from capture.** A box on the floating bar asks macOS to leave the window out of screen capture. It worked on entire-screen shares in Zoom, Google Meet in Chrome and Microsoft Teams on macOS 26.5. Test your own setup before relying on it.
- **Elgato Prompter support.** When a Prompter is connected, the floating window finds it and fills it, showing only the script. A button sends it back to your main screen.
- **Portuguese voice tracking.** The prompter detects each script's language, or reads `voice-language` from the note's properties. Audio stays on your computer.
- **Live refresh.** Saving the note updates the prompter in place, keeping your passage, playback and voice tracking.
- **Reading a line again.** Go back and repeat a line, and voice tracking moves back to it after about six words.
- **Remembered position.** Each note reopens where you left it, even after a font change or an edit. A note read to its end starts from the top.
- **Stage cues.** `[pause]` and other bracket notes are hidden on screen and never read aloud or tracked. A setting shows them dimmed or normally.
- **Pedal keys.** PageDown and PageUp turn a page, with an option for pedals that send arrow keys. Stream Deck scrolls, including from an Elgato pedal, now move voice tracking with the page.

### Changed
- **Cleaner icons.** Emoji in the interface are gone, replaced by Obsidian's own icons.
- **Keep screen awake works.** The setting did nothing before. It now holds the screen awake while the script plays, voice listens or it reads aloud, and it is on by default.
- **Double-click** jumps to the clicked word's own line, not the first line holding that word, and opens the note if no pane shows it.
- **Voice moves with the script.** Floating while voice tracking runs moves tracking to the floating window, which keeps following with the main window minimized. Stream Deck and remote commands follow it there.

### Fixed
- **Float button and command** now close the floating window every time.
- **Scroll sync** no longer pulls the editor's cursor back to the heading on every scroll, only when the section changes.
- **OBS recording sync works.** Starting playback starts the OBS recording and resetting to the top stops it, when sync is on.
- **What's New can be turned back on** with a new toggle in the About tab.
- **About tab links** now open this plugin's GitHub page and issues instead of a placeholder address.

### Removed
- **Voice settings that did nothing:** scroll behavior, max and min jump distance, animation times, pause detection and its threshold, and scroll trail.

## [0.11.9] - 2026-10-30

### Added
- **Rehearsal pace preset** for interview practice and ad-libbing. Two guards stop wrong jumps: tracking holds its place when a far-away passage matches about as well as the nearby one, and a few recognized words can no longer move the highlight more than 50 words.
- **Rehearsal clock on screen**: target, elapsed and remaining time; picking a section restarts that section's clock.

### Fixed
- **Voice tracking never fails silently.** A start that cannot listen (permission dialog left open, microphone denied, helper crash, recognizer stuck) now shows a notice with the System Settings → Privacy & Security path and a Retry button. The mic button shows active only once the engine is really listening.
- **Microphone blocked by macOS is detected.** When Obsidian's microphone switch is off, macOS hands over pure silence instead of refusing; the fallback engine now spots that within a few seconds and says so. Switching Obsidian back on and choosing "Later" on the macOS dialog is enough before Retry.
- **Changing the pace preset while reading keeps your place** and no longer restarts the speech engine.
- Re-enabling the mic no longer wipes the script from the matcher; listening stops when the teleprompter view closes; spelled-out numbers now track.
- The macOS speech helper bounds its permission request and asks for the microphone explicitly. Rebuild it from `native/` to get these (see docs/voice-tracking.md).

### Changed
- README no longer claims the note updates live while edited or a "Pin window"; neither exists yet.

## [0.11.8] - 2026-09-14

### Fixed
- **Read-aloud now speaks numbers and formulas clearly.** Smaller voices (notably ElevenLabs Flash v2.5) guessed at raw digits and symbols, so `r = +0.012`, `p = .35` or `595,445` came out garbled. Sentences are now converted to spoken form just before they reach the voice — "r equals plus zero point zero one two", "five hundred ninety-five thousand…", "the first of September", "twenty twenty-two". Covers decimals, thousands separators, percentages, currency, ordinals, dash ranges, signs and comparison operators. Identifiers such as `32-10-0231`, `v2.5`, `0.11.7`, times and fractions are left alone. English voices only; the on-screen script is unchanged.
- **Paragraph and heading spacing scales with the prompter font.** Margins are now relative to the text size instead of fixed, so a blank line between paragraphs stays a visible pause at large reading sizes.

### Security
- `ws` updated to 8.21.3 (GHSA-96hv-2xvq-fx4p memory-exhaustion DoS, GHSA-58qx-3vcg-4xpx uninitialized memory disclosure). If you copied `ws` into your plugin folder manually, update that copy too.

### Changed
- `obs-websocket-js` 5.0.8 and `highlight.js` 11.12.0.
- Settings notices reworded to pass Obsidian's automated review lint.

## [0.11.7] - 2026-07-21

### Fixed
- **Remote server now starts reliably from a normal vault install.** The `ws` WebSocket module could resolve to the browser shim (or fall back to a runtime `require('ws')` that was not present in the installed plugin folder), so the remote server failed to start with a "could not load its WebSocket module" error. `ws` now resolves to the Node entry and the loader prefers the packaged module, so no manual `node_modules/ws` copy is needed. (#4, #5)
- Clearer remote-server startup errors for port-in-use, invalid/unavailable host, and WebSocket module load failures.

### Changed
- Added a `bun run package:plugin` workflow that stages a self-contained Obsidian plugin folder, including the runtime `ws` dependency needed for remote-server testing.

## [0.11.2] - 2026-06-22

### Fixed
- **Voice tracking now follows you when you jump to a section.** While voice tracking is listening,
  picking a section from the **Jump to Section** panel (or next/previous-section) re-anchors the
  speech matcher to that section, so it keeps following your voice from there instead of staying
  locked on the section you left. Works both forward and backward through the document.
- **"Jumps then comes back."** A section jump made while reading aloud would scroll to the section
  and then slide back out of it — the auto-follow animation was still easing the page toward the
  last-matched word. The jump now stops that animation and re-points its target, so the page holds
  at the chosen section.

### Technical
- New `VoiceTrackingService.seekToWord(index)` — snaps the matcher's anchor to an exact word, clears
  latch/confirmation/accumulator/pace state, stops the in-flight scroll-follow and realigns its
  target, and repaints the karaoke highlight (clearing stale marks so backward jumps don't leave
  later words dimmed).
- `TeleprompterApp.svelte`: `firstTrackedWordIndexAtOrAfter()` resolves a heading to its first
  `.voice-word` index; `jumpToHeader()` calls `seekToWord()` when voice tracking is active.

## [0.11.1] - 2026-06-04

### Changed
- **What's-new modal refreshed.** The post-update dialog now shows the brand-mark icon
  (matching the ribbon icon and store logo) and the **actual 0.11.0 highlights** — neural
  text-to-speech, voice-tracked scrolling, the redesigned toolbar, native settings, and the
  refreshed look — replacing the stale pre-redesign feature list.
- **Internal:** brand-mark icon id renamed `teleprompter-final` → `teleprompter-plus`.

## [0.11.0] - 2026-06-04

### Changed
- **Reading-view toolbar redesign — hierarchy, grouping, progressive disclosure.** The flat row of equal-weight icons is now organised into scannable zones (Playback · Display/Type · View · Capture · System) separated by dividers, with a dominant **hero** Play/Pause, one consistent active-toggle language (accent fill + ring), the timer pulled into its own right-aligned **readout** zone, and low-frequency controls collapsed into a `⋯ More` overflow menu. Fully theme-driven (Obsidian CSS variables — light/dark/third-party). The settings show/hide/reorder system is preserved; controls pinned to the primary layout always stay on the main bar. See [docs/toolbar.md](docs/toolbar.md).

### Added
- **ElevenLabs cloud TTS engine (bring-your-own-key)** — optional high-quality neural voices via the ElevenLabs API, alongside the offline Kokoro / macOS Say / Web Speech engines.
  - Opt-in and **never auto-selected**: choose "ElevenLabs (cloud, paid — needs API key)" explicitly in Settings → Text-to-speech → Engine.
  - User supplies their own API key (masked field); model picker (Flash v2.5 / Turbo v2.5 / Multilingual v2); voice ID (defaults to Rachel).
  - Per-sentence audio cache + `hintNext` pre-generation so re-reads and look-ahead don't re-bill.
  - One-time cloud/paid/privacy notice on selection; README "Network use & privacy" disclosure.
  - See [docs/elevenlabs-tts.md](docs/elevenlabs-tts.md) for setup.

### Fixed
- **`:::` fenced divs showing on the teleprompter** — Pandoc/Quarto fenced-div markers (`::: {.column}`, `:::`) were rendered literally. They are now stripped from both the on-screen render and the TTS text.
- **TTS reading full URLs aloud** — bare/auto-linked URLs (e.g. long Figma links) were spoken in full. Bare URLs are now stripped during render preprocessing, which also feeds the DOM-based TTS extraction, so they are neither shown huge nor read aloud. Markdown links `[text](url)` keep their visible text.

### Technical
- New `src/tts/elevenlabs-engine.ts` implementing the `TTSEngine` interface (audio via Obsidian `requestUrl`, HTMLAudioElement playback).
- `TTSEngineType` gains `'elevenlabs'`; `createTTSEngine` accepts optional cloud-engine config and falls back to the offline chain when no key is present.
- Settings render helper (`createFeatureGroup`) gains `text` / `password` input rendering (previously absent — also fixes pre-existing free-text settings that rendered no control).
- `stripFencedDivs` and `stripBareUrls` exported from `src/parser/text-cleaner.ts` and reused by the on-screen renderer.

---

## [0.9.0] - 2025-12-30

### Added
- **Remote Web Interface** - Control teleprompter from any device on your network
  - Mobile-optimized responsive design
  - Real-time state sync via WebSocket
  - Full playback controls (play/pause, speed, countdown)
  - Section navigation with jump-to-header
  - All settings accessible from phone/tablet

### Fixed
- **Section headers display** - Fixed headers showing as `[object Object]` in remote interface
- **Countdown events** - Added missing countdown events to wsEvents array (`set-countdown`, `start-countdown`, `countdown-increase`, `countdown-decrease`)
- **Mobile touch reliability** - Improved section tap handling during scroll with `touchend` events and `touch-action: manipulation`
- **State broadcast on jump** - Remote interface now updates to show paused state when jumping to section

### Technical
- Added countdown events to window event listener registration
- Bigger touch targets for mobile (16px padding, 16px font)
- Visual feedback on section tap (red flash)
- `preventDefault` and `stopPropagation` for reliable touch handling

---

## [0.7.1] - 2025-12-19

### Security
- **Rate limiting** - Added 50 messages/second per client limit to prevent DoS
- **Input validation** - Added range validation for all numeric parameters (speed, fontSize, countdown, scroll amounts)
- **String sanitization** - Added XSS prevention for string parameters (headerId)
- **Optional authentication** - Added `authToken` config option with 5-second handshake timeout
- **Error message sanitization** - Removed internal details from error responses
- **Non-localhost warning** - Console warning when binding to non-localhost addresses
- **URI protocol security** - Added path traversal prevention in `obsidian://teleprompter` handler
- **Settings validation** - Added validation and clamping on settings load

### Changed
- Enhanced WebSocket server security configuration options
- Improved settings UI with host validation feedback
- Updated LICENSE year to 2024-2025

### Technical
- Added `validateCommand()` method in WebSocket server
- Added `sanitizeString()` and `sanitizeErrorMessage()` helpers
- Added `checkRateLimit()` with per-client tracking
- Added `validateSettings()` and `clamp()` in main plugin
- Added `sanitizeNotePath()` for URI protocol handler

---

## [0.7.0] - 2025-12-15

### Added

#### Speed Presets
- **Cycle through speed presets** - Quickly switch between 6 preset speeds (0.5x, 1x, 1.5x, 2x, 3x, 5x)
- **Next/Previous preset navigation** - Step through presets in order
- **WebSocket commands** - `cycle-speed-preset`, `next-speed-preset`, `prev-speed-preset`
- **Stream Deck integration** - New actions for speed preset control

#### Custom Hotkeys
- **User-configurable keyboard shortcuts** - Define custom hotkeys for 12 common actions
- **Settings UI** - Record new hotkeys directly in settings panel
- **Default hotkeys preserved** - Original keys still work alongside custom hotkeys
- **Actions available**: Toggle play, speed up/down, scroll, reset, navigation, sections, presets, fullscreen, eyeline

#### Double-Click to Edit
- **Jump to source line** - Double-click any text in teleprompter to jump to that line in the editor
- **Auto-focus editor** - Editor receives focus and cursor is positioned at the matching line
- **Works with pinned notes** - Correctly finds editor even when teleprompter view is focused
- **Toggle in settings** - Enable/disable via settings or WebSocket command

#### Diagram Placeholders
- **Mermaid diagram support** - Replaces raw mermaid code with clean "📊 Flowchart" style placeholders
- **Smart type detection** - Detects specific diagram types (Flowchart, Sequence Diagram, Gantt Chart, Mind Map, etc.)
- **Multiple formats** - Also supports PlantUML, Graphviz, Ditaa, and TikZ code blocks
- **Clean presentation** - Keeps teleprompter readable while indicating diagram locations

#### Progress Indicator Styles
- **Cycle through styles** - Toggle between progress bar, scrollbar, and none
- **WebSocket command** - `cycle-progress-indicator`
- **Stream Deck action** - Quick access button

#### Text Alignment
- **Cycle through alignments** - Left, center, right, and RTL alignment options
- **WebSocket command** - `cycle-alignment`

### Changed
- **Improved WebSocket state broadcasting** - Now includes all v0.7.0 feature states
- **Enhanced test script** - `test-websocket.js` now verifies all v0.7.0 features
- **Lighter bundle** - Removed heavy dependencies, bundle now ~1.6MB

### Fixed
- **Double-click not finding editor** - Fixed issue where clicking in teleprompter couldn't find the MarkdownView (now searches all workspace leaves)
- **CSS warnings** - Removed unused minimap CSS selectors and fixed dynamically-created class warnings

### Removed
- **Voice Scroll feature** - Removed due to incompatibility with Obsidian's Electron environment
  - Web Speech API: Unreliable network errors in Electron
  - Whisper (transformers.js): Electron detected as Node.js, causing ONNX runtime failures (see [GitHub Issue #1240](https://github.com/huggingface/transformers.js/issues/1240))
  - See `docs/voice-scroll-research.md` for full research notes and future options

### Icon Design System
- **Complete icon library** - 82 SVG icons (41 key icons + 41 action icons)
- **Elgato compliant** - All icons follow official Stream Deck guidelines
- **Consistent theme** - Brand color palette with Teleprompter Blue (#4A90E2) accent
- **Action icons** - Monochrome white (#FFFFFF) for sidebar list display
- **Key icons** - Full color support for Stream Deck button display
- **PNG exports** - 164 PNG files at all required sizes (20×20, 40×40, 72×72, 144×144)
- **Design tokens** - CSS and JSON tokens for consistent styling
- **Documentation** - Complete design system docs in `docs/DESIGN-SYSTEM.md`

### Technical
- Updated manifest to version 0.7.0
- Added type-only imports for better tree-shaking
- Enhanced WebSocket capabilities list
- Removed `@huggingface/transformers` and `vosk-browser` dependencies
- Added diagram block detection and replacement in markdown pipeline
- Bundle size reduced from ~64MB to ~1.6MB
- Added comprehensive icon design system with Elgato compliance

## [0.5.0] - 2024-10-15

### Added

#### Core Features
- **Abstract scrollbar minimap** - Visual position indicator with header markers when navigation panel is hidden
- **Active section highlighting** - Current section highlighted in navigation panel
- **Single-use countdown timer** - Countdown only triggers once per document, resets on document change or explicit reset
- **Complete hotkey system** - 25+ commands accessible via Command Palette with customizable keyboard shortcuts
- **Debug mode** - Optional verbose console logging for troubleshooting (default: disabled)

#### Advanced Settings
- Default scroll speed configuration
- Minimum/maximum scroll speed limits
- Speed increment customization
- Default navigation width setting
- Remember navigation state preference
- Auto-start playing option
- Debug mode toggle

#### Performance Optimizations
- Debounced scroll event handling (50ms with passive listeners)
- Memoized markdown rendering (skip unchanged content)
- requestAnimationFrame for smooth 60fps auto-scrolling
- Batch DOM operations for header registration
- Time-based delta calculations for consistent speed

#### Commands (25+ total)
- **Playback**: Toggle play/pause, play, pause, reset to top
- **Speed**: Increase, decrease, set speed
- **Font**: Increase, decrease, reset font size
- **Navigation**: Next section, previous section, toggle navigation panel
- **Display**: Toggle fullscreen, keep awake, pin window, minimap
- **Advanced**: Scroll sync, countdown controls, flip modes

### Changed
- **Countdown default** - Changed from 4 seconds to 0 (disabled by default)
- **Minimap viewport visibility** - Increased opacity from 0.12 to 0.35, border from 2px to 3px
- **Minimap design** - Converted standalone minimap from text preview to abstract scrollbar
- **Countdown behavior** - Now single-use per document instead of triggering on every play at document start
- **Scroll position tracking** - Made reactive for real-time minimap updates
- **Console logging** - 78+ debug logs now hidden by default, controllable via debug mode setting

### Fixed
- **Minimap viewport indicator** - Now properly tracks scroll position in real-time
- **Countdown triggering repeatedly** - Fixed countdown firing on every play/pause action
- **Duplicate plugin declaration** - Resolved variable collision in WebSocket initialization
- **Scroll position reactivity** - Added `scrollPosition` state variable for proper Svelte reactivity

### Technical
- Updated manifest to version 0.5.0
- Enhanced documentation with comprehensive README
- Added performance optimization patterns
- Improved state management with Svelte 5 runes
- Better separation of concerns in component architecture

## [0.4.0] - 2024-10-13

### Added
- Full-screen mode
- Keep awake functionality
- Pin window (macOS/Windows)
- Scroll sync with editor
- Flip modes (horizontal/vertical)
- Line height control
- Speed range configuration

### Changed
- Improved navigation panel resizing
- Enhanced Stream Deck state synchronization
- Better error handling for WebSocket connections

## [0.3.0] - 2024-10-12

### Added
- Hierarchical header navigation panel
- Collapsible section tree view
- One-click section jumping
- Real-time position tracking
- Navigation panel resize functionality
- State persistence (localStorage)

### Changed
- Improved markdown rendering with highlight.js
- Better theme integration
- Enhanced header detection algorithm

## [0.2.0] - 2024-10-11

### Added
- WebSocket server for external control (port 8765)
- Stream Deck integration with 55+ actions
- Real-time state broadcasting
- Auto-reconnection for WebSocket clients
- Settings tab for configuration
- WebSocket server management UI

### Changed
- Refactored component structure for better maintainability
- Improved settings organization
- Enhanced error handling

## [0.1.0] - 2024-10-10

### Added
- Initial release
- Core teleprompter functionality
- Auto-scrolling with variable speed
- Play/pause controls
- Font size adjustment
- Reset to top
- Manual scroll up/down
- Full Markdown support
- YAML frontmatter stripping
- Image rendering
- Code block syntax highlighting
- Real-time note content updates
- Basic settings panel

### Technical
- Built with Svelte 5 + TypeScript
- Vite build system
- Tailwind CSS styling
- marked.js for markdown parsing
- Obsidian Plugin API integration

---

## Release Types

### Major (x.0.0)
- Breaking changes
- Major feature overhauls
- API changes

### Minor (0.x.0)
- New features
- Non-breaking enhancements
- Significant improvements

### Patch (0.0.x)
- Bug fixes
- Minor improvements
- Documentation updates

---

## Upcoming

See [Feature Comparison and Roadmap](context/projects/obsidian-teleprompter-plus/2025-10-12-22-00-Feature-Comparison-And-Roadmap.md) for planned features.

### Phase 4: Enhanced UX
- Multiple teleprompter themes
- Customizable color schemes
- Font family selection
- Eye-level indicator line
- Focus mode

### Phase 5: Advanced Features
- Bookmarks and position markers
- Session recording and playback
- Export with timing information
- Speaker notes panel
- Presentation mode

---

**Note**: Dates use YYYY-MM-DD format. All changes are documented from the perspective of the end user.
