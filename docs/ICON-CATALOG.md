# Teleprompter Plus Icon Catalog

**Version:** 1.0.0
**Last Updated:** 2025-12-15

This document provides a visual reference of all icons in the Teleprompter Plus design system.

---

## Obsidian Plugin Icons (24×24px)

### Core Controls

#### Play
**File:** `icon-play.svg`
**Usage:** Start auto-scrolling
**Visual:** Filled right-pointing triangle
```
▶
```

#### Pause
**File:** `icon-pause.svg`
**Usage:** Stop auto-scrolling
**Visual:** Two filled vertical bars
```
⏸
```

#### Reset
**File:** `icon-reset.svg`
**Usage:** Return to top of document
**Visual:** Curved arrow pointing up-left
```
↺
```

#### Font Size
**File:** `icon-font.svg`
**Usage:** Adjust text size
**Visual:** Large "A" and small "a"
```
Aa
```

#### Timer
**File:** `icon-timer.svg`
**Usage:** Countdown timer
**Visual:** Clock face with countdown marks
```
⏱
```

---

## Stream Deck Action Icons (72×72px)

### Playback Category

#### Play/Pause Toggle
**Action:** `playpause`
**Files:**
- `playpause/play.png` - Play state
- `playpause/pause.png` - Pause state
- `playpause/icon.png` - Action icon in Stream Deck UI

**Visual:**
- Play: ▶ (filled triangle)
- Pause: ⏸ (two bars)

#### Reset
**Action:** `reset`
**Files:** `reset/icon.png`
**Visual:** ↺ (return arrow)

#### Speed Control
**Action:** `speed`
**Files:**
- `speed/up.png` - Increase speed
- `speed/down.png` - Decrease speed
- `speed/icon.png` - Action icon

**Visual:**
- Up: >>> (triple chevron right)
- Down: <<< (triple chevron left)

#### Countdown Timer
**Action:** `countdown`
**Files:** `countdown/icon.png`
**Visual:** ⏱ (clock with countdown marks)

---

### Color Presets Category

All color preset icons use filled rectangles displaying the theme color:

#### Amber Theme
**Action:** `color-amber`
**Color:** `#FFA500` (amber/orange)

#### Black Theme
**Action:** `color-black`
**Color:** `#000000` (pure black)

#### Dark Theme
**Action:** `color-dark`
**Color:** `#2C2C2C` (dark gray)

#### Green Theme
**Action:** `color-green`
**Color:** `#27AE60` (green)

#### Light Theme
**Action:** `color-light`
**Color:** `#F5F5F5` (light gray)

#### Sepia Theme
**Action:** `color-sepia`
**Color:** `#704214` (sepia brown)

---

### Typography Category

#### Font Family Icons

Each font icon displays the letter "A" styled in the respective typeface:

**Monospace Font**
- Action: `font-mono`
- Visual: "A" in monospace font (Courier-style)

**Readable Font**
- Action: `font-readable`
- Visual: "A" in optimized reading font (Georgia-style)

**Sans-Serif Font**
- Action: `font-sans`
- Visual: "A" in sans-serif font (Helvetica-style)

**Serif Font**
- Action: `font-serif`
- Visual: "A" in serif font (Times-style)

**Slab Serif Font**
- Action: `font-slab`
- Visual: "A" in slab serif font (Rockwell-style)

**System Font**
- Action: `font-system`
- Visual: "A" in system default font

#### Font Size
**Action:** `fontsize`
**Files:**
- `fontsize/up.png` - Increase font size (Large "A" + ↑)
- `fontsize/down.png` - Decrease font size (Small "a" + ↓)

---

### Layout & Display Category

#### Fullscreen
**Action:** `fullscreen`
**Visual:** Four corner brackets expanding outward
```
┏     ┓


┗     ┛
```

#### Pin Window
**Action:** `pin`
**Files:**
- `pin/pinned.png` - Window is pinned (filled pushpin)
- `pin/unpinned.png` - Window not pinned (outline pushpin)

**Visual:** 📌 (pushpin at angle)

#### Keep Awake
**Action:** `keepawake`
**Files:**
- `keepawake/on.png` - Keep awake active (sun/lightbulb)
- `keepawake/off.png` - Keep awake inactive (moon/sleep)

**Visual:**
- On: ☀️ (sun rays)
- Off: 🌙 (moon)

#### Eyeline Indicator
**Action:** `eyeline`
**Visual:** Horizontal line with centered dot (reading guide)
```
━━━━●━━━━
```

#### Minimap
**Action:** `minimap`
**Visual:** Rectangular overview with position marker
```
┌────┐
│ ▓  │ ← position marker
│    │
└────┘
```

#### Line Height
**Action:** `lineheight`
**Files:**
- `lineheight/up.png` - Increase spacing (wider lines + ↑)
- `lineheight/down.png` - Decrease spacing (tighter lines + ↓)

**Visual:** Three horizontal lines with vertical spacing indicators

#### Horizontal Padding
**Action:** `paddinghorizontal`
**Files:**
- `paddinghorizontal/up.png` - Increase (←→ wider)
- `paddinghorizontal/down.png` - Decrease (→← narrower)

**Visual:** Rectangle with horizontal arrows

#### Vertical Padding
**Action:** `paddingvertical`
**Files:**
- `paddingvertical/up.png` - Increase (↑↓ taller)
- `paddingvertical/down.png` - Decrease (↓↑ shorter)

**Visual:** Rectangle with vertical arrows

---

### Transform Category

#### Flip Horizontal
**Action:** `flip-horizontal`
**Visual:** Two horizontal arrows with vertical mirror line
```
  ← | →
```

#### Flip Vertical
**Action:** `flip-vertical`
**Visual:** Two vertical arrows with horizontal mirror line
```
    ↑
  ─────
    ↓
```

---

### Navigation Category

#### Section Navigation
**Action:** `section`
**Files:**
- `section/next.png` - Next section (document + →)
- `section/previous.png` - Previous section (← + document)

**Visual:**
- Next: Document lines + right chevron
- Previous: Left chevron + document lines

#### Scroll Sync
**Action:** `scroll-sync`
**Visual:** Two parallel vertical arrows (bidirectional sync)
```
⇅
```

---

### v0.7.0 New Actions

#### Cycle Speed Preset
**Action:** `cycle-speed-preset`
**Visual:** Circular arrow around speed indicator (0.5x → 1x → 1.5x → 2x → 3x → 5x)

#### Next Speed Preset
**Action:** `next-speed-preset`
**Visual:** Speed numbers with right arrow (→ faster)

#### Previous Speed Preset
**Action:** `prev-speed-preset`
**Visual:** Speed numbers with left arrow (← slower)

#### Cycle Alignment
**Action:** `cycle-alignment`
**Visual:** Text lines cycling through alignments:
```
Left     Center    Right     RTL
━━━━     ━━━━━     ━━━━     ━━━━
━━━      ━━━━━     ━━━      ━━━
━━━━━    ━━━━━     ━━━━━    ━━━━━
```

#### Cycle Progress Indicator
**Action:** `cycle-progress-indicator`
**Visual:** Three progress styles:
```
Progress Bar: ▓▓▓▓▓░░░░░
Scrollbar:    ┃ with ▓ marker
None:         (empty)
```

---

## Icon State Conventions

### Color Coding (Stream Deck)

| State | Color | Example Actions |
|-------|-------|-----------------|
| Active/On | Green (`#27AE60`) | Playing, Pinned, Awake |
| Inactive/Off | Gray (`#7F8C8D`) | Paused, Unpinned, Sleep |
| Increase | Blue (`#4A90E2`) | Speed Up, Font Bigger |
| Decrease | Orange (`#E67E22`) | Speed Down, Font Smaller |
| Neutral | Charcoal (`#3A3A3A`) | Default state |

### Opacity Conventions

| Element | Opacity | Usage |
|---------|---------|-------|
| Primary | 100% | Main icon element, current focus |
| Secondary | 80% | Important supporting elements |
| Tertiary | 60% | Background elements, past text |
| Subtle | 40% | Guides, future text, hints |
| Ghost | 20% | Grid lines, boundaries |

---

## Icon Combinations

Some Stream Deck actions combine multiple visual elements:

### Font Size Up
```
Large "A" + Upward arrow
  A
  ↑
```

### Font Size Down
```
Small "a" + Downward arrow
  a
  ↓
```

### Speed Up (Fast Forward)
```
Triple chevron right
>>>
```

### Speed Down (Rewind)
```
Triple chevron left
<<<
```

### Section Next
```
Document lines + Forward chevron
━━━  →
━━━
━━━
```

### Section Previous
```
Backward chevron + Document lines
←  ━━━
   ━━━
   ━━━
```

---

## Designing New Icons

When creating new icons for Teleprompter Plus, follow these steps:

### 1. Define Function
What does this action do? Be specific.

### 2. Check Existing Icons
Can an existing icon be reused or adapted?

### 3. Choose Visual Metaphor
- Playback: ▶ ⏸ ⏹ ⏮ ⏭
- Direction: ← → ↑ ↓ ↔ ↕
- Size: Large vs. small elements
- State: Filled vs. outline
- Speed: Single vs. multiple elements (>, >>>, >>>)

### 4. Sketch at Actual Size
- Obsidian: 24×24px
- Stream Deck: 72×72px

### 5. Apply Design System Rules
- Stroke width: 2px (Obsidian), 6px (Stream Deck)
- Safe zones: 2px (Obsidian), 4px (Stream Deck)
- Corner radius: 2px (Obsidian), 4px (Stream Deck)
- Colors: From defined palette

### 6. Test Visibility
- View at actual size on screen
- Test on Stream Deck hardware (if applicable)
- Check in light and dark modes
- Verify contrast ratios (4.5:1 minimum)

### 7. Create Variants
- Standard resolution
- @2x retina resolution
- Different states (active/inactive, on/off)
- Multiple directions (up/down, left/right)

---

## Quick Reference: Icon at Different Sizes

### Play Icon Example

**24×24px (Obsidian):**
```svg
<polygon points="8,6 18,12 8,18" fill="currentColor"/>
```

**72×72px (Stream Deck):**
```svg
<polygon points="24,18 54,36 24,54" fill="currentColor"/>
```

**144×144px (Stream Deck @2x):**
```svg
<polygon points="48,36 108,72 48,108" fill="currentColor"/>
```

**Scaling Factor:**
- Stream Deck = Obsidian × 3
- Retina = Standard × 2

---

## File Organization

```
obsidian-teleprompter-plus/
├── docs/
│   ├── DESIGN-SYSTEM.md          (this file's parent)
│   ├── ICON-CATALOG.md           (this file)
│   └── icons/                     (design examples)
│       ├── icon-play.svg
│       ├── icon-pause.svg
│       ├── icon-reset.svg
│       ├── icon-font.svg
│       ├── icon-timer.svg
│       ├── streamdeck-icon-speed-up.svg
│       ├── streamdeck-icon-speed-down.svg
│       ├── streamdeck-icon-fullscreen.svg
│       ├── streamdeck-icon-flip-horizontal.svg
│       ├── streamdeck-icon-flip-vertical.svg
│       ├── streamdeck-icon-section-next.svg
│       └── streamdeck-icon-section-previous.svg

com.americo.obsidian-teleprompter.sdPlugin/
└── imgs/
    └── actions/
        ├── playpause/
        ├── reset/
        ├── speed/
        ├── countdown/
        ├── color-amber/
        ├── font-mono/
        ├── fullscreen/
        ├── flip-horizontal/
        ├── section/
        └── ... (29+ action folders)
```

---

## Related Documentation

- **[DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)** - Complete design system specification
- **[README-ELGATO-ICONS.md](../../com.americo.obsidian-teleprompter.sdPlugin/README-ELGATO-ICONS.md)** - Using Elgato icon library
- **[ICON-QUICK-REFERENCE.md](../../com.americo.obsidian-teleprompter.sdPlugin/ICON-QUICK-REFERENCE.md)** - Stream Deck icon quick guide

---

**Document Version:** 1.0.0
**Maintained By:** Américo
**License:** MIT
