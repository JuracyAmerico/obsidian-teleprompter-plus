# Changelog

All notable changes to Obsidian Teleprompter Plus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
