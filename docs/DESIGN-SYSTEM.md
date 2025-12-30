# Teleprompter Plus Icon Design System

**Version:** 1.0.0
**Last Updated:** 2025-12-15
**Product:** Teleprompter Plus - Professional Teleprompter for Obsidian
**Author:** Américo

---

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Grid System](#grid-system)
4. [Color Palette](#color-palette)
5. [Icon Style Guide](#icon-style-guide)
6. [Typography & Spacing](#typography--spacing)
7. [Stream Deck Specific](#stream-deck-specific)
8. [Icon Library](#icon-library)
9. [Usage Guidelines](#usage-guidelines)
10. [Export & Implementation](#export--implementation)

---

## Overview

Teleprompter Plus is a professional teleprompter plugin with extensive Stream Deck integration. This design system ensures visual consistency across:

- **Obsidian Plugin UI** - 5 core icons (24×24px)
- **Stream Deck Actions** - 29+ action icons (72×72px, 144×144px)
- **Documentation & Marketing** - Brand assets

### Design Philosophy

**Clarity First** - Icons must be instantly recognizable at small sizes
**Motion-Focused** - Visual language centered around scrolling, playback, and control
**Professional** - Clean, modern aesthetic suitable for content creators
**Accessible** - High contrast, clear shapes, works in light/dark modes

---

## Design Principles

### 1. Minimal & Functional

Icons use the minimum elements needed to communicate function. No decorative flourishes.

**Good:** Simple play triangle
**Bad:** Play triangle with shadow, gradient, and border

### 2. Consistent Visual Language

All icons share:
- Same stroke width (2px base)
- Same corner radius rules
- Same spacing relationships
- Same level of detail

### 3. Motion-Aware

Teleprompter is about movement. Icons should suggest:
- **Direction** - Arrows, chevrons for navigation
- **Speed** - Spacing in motion indicators
- **State** - Opacity for active/inactive

### 4. Scalable

Icons must work at multiple sizes:
- **24×24px** - Obsidian plugin ribbon
- **72×72px** - Stream Deck standard resolution
- **144×144px** - Stream Deck retina (@2x)

---

## Grid System

### Base Grid: 24×24px (Obsidian Icons)

```
Canvas: 24×24px
Safe Zone: 20×20px (2px padding all sides)
Icon Zone: 16×16px (4px padding all sides for complex icons)
Stroke Width: 2px
Corner Radius: 2px (when applicable)
```

**Grid Structure:**
```
┌─────────────────────────┐
│ ┌─────────────────────┐ │ ← 2px outer padding
│ │                     │ │
│ │   ┌───────────┐     │ │
│ │   │           │     │ │ ← Safe zone (20×20)
│ │   │   ICON    │     │ │
│ │   │           │     │ │
│ │   └───────────┘     │ │
│ │                     │ │
│ └─────────────────────┘ │
└─────────────────────────┘
    24×24px canvas
```

### Stream Deck Grid: 72×72px / 144×144px

```
Canvas: 72×72px (144×144px @2x)
Safe Zone: 64×64px (4px padding) / 128×128px @2x (8px padding)
Icon Zone: 52×52px (10px padding) / 104×104px @2x (20px padding)
Stroke Width: 6px (12px @2x)
Corner Radius: 4px (8px @2x)
```

**Scaling Formula:**
```
Stream Deck = Obsidian × 3
@2x = Standard × 2
```

### Alignment & Positioning

**Vertical Center:** Elements align to mathematical center (12px on 24px grid)
**Horizontal Center:** Icons centered unless directional (arrows may offset)
**Optical Center:** Fine-tune by 1px if mathematical center looks off-balance

**Pixel Precision:**
- Always align to pixel grid (no half-pixels)
- Stroke centers fall on grid lines
- For 2px stroke: place stroke center at odd pixels (1, 3, 5...)

---

## Color Palette

### Primary Brand Color

**Teleprompter Blue**
`#4A90E2` - Primary brand color
Use: Main branding, primary actions, selected states

**Rationale:** Professional, tech-forward, high visibility without being aggressive

### Neutral Colors

```css
/* Light Mode */
--icon-foreground: #2C3E50      /* Dark gray - primary icon color */
--icon-background: #FFFFFF      /* White background */
--icon-muted: #7F8C8D          /* Muted gray - 60% opacity elements */
--icon-subtle: #BDC3C7         /* Subtle gray - 40% opacity elements */

/* Dark Mode */
--icon-foreground: #ECF0F1      /* Light gray - primary icon color */
--icon-background: #1E1E1E      /* Dark background */
--icon-muted: #95A5A6          /* Muted gray - 60% opacity elements */
--icon-subtle: #34495E         /* Subtle gray - 40% opacity elements */
```

### Semantic Colors

```css
/* State Colors */
--color-active: #27AE60        /* Green - active, playing, success */
--color-inactive: #7F8C8D      /* Gray - paused, disabled */
--color-warning: #E67E22       /* Orange - caution, decrease */
--color-danger: #E74C3C        /* Red - stop, delete, error */
--color-info: #3498DB          /* Blue - info, neutral actions */

/* Stream Deck Theme Colors (from Elgato Pure Pack) */
--pure-charcoal: #3A3A3A       /* Neutral actions */
--pure-blue: #4A90E2           /* Increase, forward */
--pure-green: #27AE60          /* Active, success */
--pure-orange: #E67E22         /* Decrease, backward */
--pure-purple: #9B59B6         /* Alternative actions */
--pure-pink: #E91E63           /* Accent actions */
```

### Color Usage Matrix

| Action Type | Light Mode | Dark Mode | Stream Deck |
|-------------|------------|-----------|-------------|
| Play/Resume | `--color-active` | `--color-active` | Pure Green |
| Pause | `--icon-foreground` | `--icon-foreground` | Pure Charcoal |
| Stop/Reset | `--color-warning` | `--color-warning` | Pure Orange |
| Increase | `--color-info` | `--color-info` | Pure Blue |
| Decrease | `--color-warning` | `--color-warning` | Pure Orange |
| Active State | `--color-active` | `--color-active` | Pure Green |
| Inactive State | `--icon-muted` | `--icon-muted` | Pure Charcoal |

### Opacity Levels

Use opacity to create visual hierarchy:

```css
/* Opacity Scale */
--opacity-primary: 1.0      /* Current focus, active element */
--opacity-secondary: 0.8    /* Important but not current */
--opacity-tertiary: 0.6     /* Supporting elements */
--opacity-subtle: 0.4       /* Background elements */
--opacity-ghost: 0.2        /* Barely visible guides */
```

**Application in Icons:**

- **Main Icon (current icon):** 100% opacity
- **Fading text lines (scrolled past):** 40% opacity
- **Upcoming text lines:** 60% opacity
- **Motion indicators (arrow):** 100% opacity
- **Background guides:** 20% opacity

---

## Icon Style Guide

### Visual Language Vocabulary

#### Scrolling & Motion

**Concept:** Text moving upward on teleprompter

**Elements:**
- Horizontal lines = text lines
- Vertical arrow = scroll direction
- Opacity gradient = time (past → present → future)

**Example (Current Main Icon):**
```svg
<!-- Top line (fading) - text that has passed -->
<line x1="6" y1="6" x2="18" y2="6" opacity="0.4"/>

<!-- Middle line (full) - current reading position -->
<line x1="5" y1="12" x2="19" y2="12"/>

<!-- Bottom line (fading) - text coming up -->
<line x1="7" y1="18" x2="17" y2="18" opacity="0.4"/>

<!-- Upward arrow - scrolling direction -->
<path d="M12 20 L12 8 M9 11 L12 8 L15 11"/>
```

#### Playback Controls

**Play:**
```
▶ Right-pointing triangle
- Simple, universally recognized
- Optical center (slightly right of mathematical center)
```

**Pause:**
```
⏸ Two vertical bars
- Equal width, equal spacing
- Bars: 3px wide, 10px tall (on 24px grid)
- Gap: 3px between bars
```

**Stop/Reset:**
```
⏹ Square or return arrow
- Return arrow: curved arrow pointing left and up
- Circular path with arrowhead
```

#### Speed & Timing

**Speed Indicators:**
- **Fast:** Multiple chevrons (`>>>`)
- **Slow:** Single chevron (`>`)
- **Timer:** Clock face (circle + hands)

**Typography Controls:**

**Font Size:**
- Two "A" letters, different sizes
- Or: Single "A" with +/- indicator

**Font Family:**
- Serif "A" for serif fonts
- Sans "A" for sans-serif
- Mono "M" for monospace

#### Navigation

**Section Navigation:**
- **Next:** Right arrow or chevron `→`
- **Previous:** Left arrow or chevron `←`
- **Jump to Section:** Hamburger menu or list icon

**Scroll Sync:**
- Two parallel arrows (bidirectional sync)
- Or: circular sync icon

#### Layout & Display

**Fullscreen:**
- Four corner brackets
- Or: Rectangle with expansion arrows

**Pin Window:**
- Pushpin icon (angled)
- Or: Lock icon

**Keep Awake:**
- Sun/lightbulb (on state)
- Moon/crossed-out sleep (off state)

**Flip:**
- Horizontal flip: ⇄ horizontal arrows
- Vertical flip: ⇅ vertical arrows

### Stroke & Fill Rules

**Default:** Stroke-only (outline), no fill

**Exceptions:**
1. Play button: Fill triangle (more recognizable)
2. Active state indicators: Filled shapes
3. Accent elements: Small filled circles/dots

**Stroke Properties:**
```css
stroke-width: 2px           /* Base size (24×24 icons) */
stroke-linecap: round      /* Rounded ends */
stroke-linejoin: round     /* Rounded corners */
stroke: currentColor       /* Inherits text color (theme-aware) */
```

### Corner Radius Rules

**Sharp Corners (0px radius):**
- Text lines (horizontal strokes)
- Geometric shapes (squares, triangles)
- Technical elements (brackets, cursors)

**Rounded Corners (2px radius):**
- Buttons and controls
- Containers (rectangles)
- Human-friendly elements

**Fully Rounded (50% radius):**
- Circles (dots, indicators)
- Pills (elongated buttons)
- Speed dots/meters

### Spacing Rules

**Internal Spacing:**
- Minimum gap between elements: 2px
- Related elements: 3-4px apart
- Unrelated elements: 6-8px apart

**Breathing Room:**
- Elements never touch canvas edge
- 2px minimum padding from safe zone
- 4px preferred padding for comfort

**Proportional Spacing:**
```
1 unit = 2px

Tight:    1 unit (2px)
Normal:   2 units (4px)
Relaxed:  3 units (6px)
Loose:    4 units (8px)
```

---

## Typography & Spacing

### Icon Typography

When icons include letters (Font controls):

**Typeface:** Sans-serif, bold weight
**Sizes:**
- Large "A": 12px height
- Small "A": 8px height
- Mono "M": 10px height

**Letter Spacing:** Tight (-0.5px)
**Baseline Alignment:** Mathematically centered

**Example (Font Size Icon):**
```svg
<svg viewBox="0 0 24 24">
  <!-- Large A -->
  <text x="8" y="16" font-size="12" font-weight="bold">A</text>
  <!-- Small A -->
  <text x="16" y="18" font-size="8" font-weight="bold">A</text>
</svg>
```

### Number & Counter Display

For countdown timer, speed indicators:

**Font:** Tabular numerals (monospace digits)
**Weight:** Medium
**Size:** 10-14px (depending on icon size)

---

## Stream Deck Specific

### Resolution & Export

**Standard Resolution:** 72×72px PNG
**Retina Resolution:** 144×144px PNG (@2x)

**Export Settings:**
- Format: PNG-24
- Transparency: Yes
- Color Space: sRGB
- DPI: 72dpi (standard), 144dpi (@2x)

### Dark Background Optimization

Stream Deck has a dark button background (~#1A1A1A).

**Guidelines:**
1. Icons must have sufficient contrast (4.5:1 minimum)
2. Use light strokes on dark background
3. Test icons on actual Stream Deck hardware
4. Avoid very thin lines (minimum 6px stroke at 72×72)

**Recommended Icon Color:**
```css
/* On Stream Deck dark background */
--streamdeck-icon-light: #FFFFFF     /* White - high contrast */
--streamdeck-icon-muted: #AAAAAA    /* Light gray - secondary */
--streamdeck-icon-subtle: #666666   /* Dark gray - tertiary */
```

### State Visualization

Stream Deck actions can show state through:

1. **Icon Swap** - Different icon for different states
   - Play → Pause button
   - Pinned → Unpinned

2. **Color Change** - Same icon, different color
   - Active (green) → Inactive (gray)

3. **Overlay Elements** - Add indicator to base icon
   - Small dot in corner for "on" state
   - Badge with number/letter

**Preferred Method:** Icon swap (clearest feedback)

### Multi-Action Icons

Some Stream Deck actions combine multiple states:

**Example: Play/Pause Toggle**
- Needs two icons: `play.png`, `pause.png`
- Both must be same visual weight
- Both must align to same grid

**Example: Font Size Up/Down**
- Needs two icons: `up.png`, `down.png`
- Use same base icon with directional indicator
- Keep consistent visual style

### Testing Checklist

- [ ] Icon visible on Stream Deck LCD at arm's length
- [ ] Icon recognizable within 0.5 seconds
- [ ] No confusion with similar icons
- [ ] Works in bright ambient light
- [ ] Works in dim ambient light
- [ ] Retina version matches standard (just 2x scale)
- [ ] Active/inactive states clearly different

---

## Icon Library

### Obsidian Plugin Icons (24×24px)

#### 1. Play Icon
**File:** `icon-play.svg`
**Purpose:** Start auto-scrolling
**Description:** Right-pointing triangle, filled

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title>Play</title>
  <polygon points="8,6 18,12 8,18" fill="currentColor" stroke="none"/>
</svg>
```

#### 2. Pause Icon
**File:** `icon-pause.svg`
**Purpose:** Stop auto-scrolling
**Description:** Two vertical bars, stroked

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title>Pause</title>
  <rect x="7" y="6" width="3" height="12" fill="currentColor"/>
  <rect x="14" y="6" width="3" height="12" fill="currentColor"/>
</svg>
```

#### 3. Reset Icon
**File:** `icon-reset.svg`
**Purpose:** Return to top of document
**Description:** Curved arrow pointing up-left (return)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title>Reset to Top</title>
  <!-- Curved arrow path -->
  <path d="M3 12 L3 7 L8 7"/>
  <path d="M3 7 C3 7, 3 3, 12 3 C21 3, 21 7, 21 12 C21 17, 21 21, 12 21"/>
  <!-- Arrow head -->
  <path d="M9 19 L12 21 L15 19"/>
</svg>
```

#### 4. Font Size Icon
**File:** `icon-font.svg`
**Purpose:** Adjust text size
**Description:** Two "A" letters (large and small)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title>Font Size</title>
  <!-- Large A -->
  <path d="M5 18 L9 6 L13 18 M6.5 14 L11.5 14" stroke-width="2.5"/>
  <!-- Small A -->
  <path d="M15 18 L17.5 10 L20 18 M15.8 15.5 L19.2 15.5" stroke-width="1.5"/>
</svg>
```

#### 5. Timer Icon
**File:** `icon-timer.svg`
**Purpose:** Countdown timer before playback
**Description:** Clock face with emphasis on countdown

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title>Countdown Timer</title>
  <!-- Clock circle -->
  <circle cx="12" cy="13" r="8"/>
  <!-- Clock hands pointing to 12 (start position) -->
  <path d="M12 13 L12 7"/>
  <path d="M12 13 L15 13" opacity="0.6"/>
  <!-- Timer indicator (small arc or dots) -->
  <path d="M8 5 L10 5 M14 5 L16 5" stroke-width="2.5" stroke-linecap="round"/>
</svg>
```

### Stream Deck Action Icons (72×72px)

All Stream Deck icons follow the same design principles, scaled up 3x:
- Stroke width: 6px (instead of 2px)
- Safe zone: 64×64px (4px padding)
- Icon zone: 52×52px (10px padding)

**Icon Categories:**

#### Playback (4 icons)
1. **playpause** - Toggle play/pause (needs play.png + pause.png)
2. **reset** - Return to top
3. **speed** - Increase/decrease speed (needs up.png + down.png)
4. **countdown** - Toggle countdown timer

#### Colors (6 icons)
1. **color-amber** - Amber/sepia theme
2. **color-black** - Black background
3. **color-dark** - Dark theme
4. **color-green** - Green theme
5. **color-light** - Light theme
6. **color-sepia** - Sepia theme

*Note: Color preset icons use filled rectangles with theme color*

#### Typography (7 icons)
1. **font-mono** - Monospace font
2. **font-readable** - Readable serif
3. **font-sans** - Sans-serif
4. **font-serif** - Serif
5. **font-slab** - Slab serif
6. **font-system** - System default
7. **fontsize** - Increase/decrease (needs up.png + down.png)

*Note: Font icons use letter "A" styled in respective typeface*

#### Layout (8 icons)
1. **fullscreen** - Toggle fullscreen
2. **pin** - Pin window on top
3. **keepawake** - Prevent sleep
4. **eyeline** - Reading guide indicator
5. **minimap** - Document overview
6. **lineheight** - Line spacing (needs up.png + down.png)
7. **paddinghorizontal** - Horizontal padding (needs up.png + down.png)
8. **paddingvertical** - Vertical padding (needs up.png + down.png)

#### Transform (2 icons)
1. **flip-horizontal** - Mirror horizontally
2. **flip-vertical** - Mirror vertically

#### Navigation (2 icons)
1. **section** - Next/previous section (needs next.png + previous.png)
2. **scroll-sync** - Sync editor and teleprompter

#### v0.7.0 New (5 icons)
1. **cycle-speed-preset** - Cycle through speed presets
2. **next-speed-preset** - Next preset
3. **prev-speed-preset** - Previous preset
4. **cycle-alignment** - Cycle text alignment
5. **cycle-progress-indicator** - Cycle progress styles

---

## Usage Guidelines

### When to Create New Icons

**Do create a new icon when:**
- Introducing a new action or feature
- Existing icon would be ambiguous
- Icon needs to be distinct from similar actions

**Don't create new icon when:**
- Existing icon can be reused
- Feature is temporary or experimental
- Icon would be too similar to existing icon

### Icon Selection Process

1. **Define function** - What does this action do?
2. **Check existing** - Can we reuse or adapt an existing icon?
3. **Research conventions** - How do other apps represent this?
4. **Sketch concepts** - 3-5 quick sketches
5. **Test at size** - View at actual display size
6. **Get feedback** - Show to team/users
7. **Iterate** - Refine based on feedback

### Accessibility Requirements

**Contrast:**
- Light mode: Minimum 4.5:1 against white
- Dark mode: Minimum 4.5:1 against dark gray
- Stream Deck: Minimum 4.5:1 against button background

**Clarity:**
- Icon must be recognizable without color
- Shape alone must communicate function
- No reliance on fine details

**Consistency:**
- Similar actions use similar visual metaphors
- Icon style remains consistent across plugin
- Animation/state changes are predictable

### Localization Considerations

**Language-Independent:**
- Avoid text in icons (except single letters like "A")
- Use universal symbols (arrows, geometric shapes)
- Don't use culturally-specific metaphors

**RTL Support:**
- Directional icons (arrows) may need flipping for RTL languages
- Create mirrored versions if supporting RTL

---

## Export & Implementation

### File Naming Convention

**Obsidian Plugin Icons:**
```
icon-{name}.svg
```
Examples: `icon-play.svg`, `icon-pause.svg`, `icon-reset.svg`

**Stream Deck Action Icons:**
```
{action-name}/{state}.png
{action-name}/{state}@2x.png
```
Examples:
- `playpause/play.png` + `playpause/play@2x.png`
- `playpause/pause.png` + `playpause/pause@2x.png`
- `fontsize/up.png` + `fontsize/up@2x.png`

### Directory Structure

```
obsidian-teleprompter-plus/
├── src/
│   ├── icon.svg                    (main plugin icon)
│   ├── icon-play.svg
│   ├── icon-pause.svg
│   ├── icon-reset.svg
│   ├── icon-font.svg
│   └── icon-timer.svg

com.americo.obsidian-teleprompter.sdPlugin/
├── imgs/
│   ├── plugin/
│   │   └── icon.png                (plugin icon for Stream Deck store)
│   ├── category/
│   │   └── icon.png                (category icon)
│   └── actions/
│       ├── playpause/
│       │   ├── icon.png            (action icon in Stream Deck UI)
│       │   ├── icon@2x.png
│       │   ├── play.png            (state icon on button)
│       │   ├── play@2x.png
│       │   ├── pause.png
│       │   └── pause@2x.png
│       ├── reset/
│       │   ├── icon.png
│       │   └── icon@2x.png
│       └── ... (other actions)
```

### SVG Optimization

Before using SVG icons, optimize them:

```bash
# Using SVGO
svgo icon-play.svg --multipass --pretty

# Or manually:
# 1. Remove unnecessary metadata
# 2. Combine paths where possible
# 3. Round coordinates to 2 decimal places
# 4. Remove unused attributes
```

**Optimized SVG Template:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <title>Icon Name</title>
  <desc>Brief description of icon purpose</desc>
  <!-- Icon paths here -->
</svg>
```

### PNG Export Settings (Stream Deck)

**Using Figma/Sketch:**
1. Select icon artboard
2. Export as PNG
3. Settings:
   - Scale: 1x (for 72×72) and 2x (for 144×144)
   - Format: PNG
   - Color profile: sRGB
4. Append `@2x` to retina version filename

**Using Inkscape:**
```bash
# Export standard resolution
inkscape icon.svg --export-filename=icon.png --export-width=72

# Export retina resolution
inkscape icon.svg --export-filename=icon@2x.png --export-width=144
```

**Using ImageMagick (from SVG):**
```bash
# Standard resolution
magick convert -background none -resize 72x72 icon.svg icon.png

# Retina resolution
magick convert -background none -resize 144x144 icon.svg icon@2x.png
```

### Implementation in Code

**Obsidian Plugin (Svelte):**
```svelte
<script>
  import IconPlay from './icon-play.svg';
</script>

<button on:click={handlePlay}>
  {@html IconPlay}
</button>
```

**Stream Deck Plugin (TypeScript):**
```typescript
// In manifest.json
{
  "UUID": "com.americo.obsidian-teleprompter.playpause",
  "Icon": "imgs/actions/playpause/icon",  // .png extension implied
  "States": [
    {
      "Image": "imgs/actions/playpause/play",
      "Name": "Play"
    },
    {
      "Image": "imgs/actions/playpause/pause",
      "Name": "Pause"
    }
  ]
}
```

### Version Control

**Include in Git:**
- All source SVG files
- Design system documentation
- Design tokens (CSS/JSON)

**Exclude from Git (Generated Files):**
- Optimized/minified SVGs (generate on build)
- PNG exports (generate on build)
- Intermediate design files (Sketch/Figma originals)

**Build Script Example:**
```json
{
  "scripts": {
    "icons:optimize": "svgo -f src/icons",
    "icons:export": "node scripts/export-stream-deck-icons.js",
    "icons": "npm run icons:optimize && npm run icons:export"
  }
}
```

---

## Appendix

### Design Tokens (CSS Variables)

```css
:root {
  /* Colors */
  --tp-color-brand: #4A90E2;
  --tp-color-active: #27AE60;
  --tp-color-inactive: #7F8C8D;
  --tp-color-warning: #E67E22;
  --tp-color-danger: #E74C3C;
  --tp-color-info: #3498DB;

  /* Icon Sizes */
  --tp-icon-size-sm: 16px;
  --tp-icon-size-md: 24px;
  --tp-icon-size-lg: 32px;
  --tp-icon-size-xl: 48px;

  /* Spacing */
  --tp-spacing-unit: 2px;
  --tp-spacing-xs: 2px;
  --tp-spacing-sm: 4px;
  --tp-spacing-md: 8px;
  --tp-spacing-lg: 16px;

  /* Stroke */
  --tp-stroke-width: 2px;
  --tp-stroke-width-bold: 2.5px;
  --tp-stroke-width-thin: 1.5px;

  /* Opacity */
  --tp-opacity-primary: 1.0;
  --tp-opacity-secondary: 0.8;
  --tp-opacity-tertiary: 0.6;
  --tp-opacity-subtle: 0.4;
  --tp-opacity-ghost: 0.2;
}
```

### Design Tokens (JSON)

```json
{
  "color": {
    "brand": "#4A90E2",
    "active": "#27AE60",
    "inactive": "#7F8C8D",
    "warning": "#E67E22",
    "danger": "#E74C3C",
    "info": "#3498DB"
  },
  "size": {
    "icon": {
      "sm": "16px",
      "md": "24px",
      "lg": "32px",
      "xl": "48px"
    }
  },
  "spacing": {
    "unit": "2px",
    "xs": "2px",
    "sm": "4px",
    "md": "8px",
    "lg": "16px"
  },
  "stroke": {
    "width": "2px",
    "widthBold": "2.5px",
    "widthThin": "1.5px"
  },
  "opacity": {
    "primary": 1.0,
    "secondary": 0.8,
    "tertiary": 0.6,
    "subtle": 0.4,
    "ghost": 0.2
  }
}
```

### Quick Reference Chart

| Aspect | Obsidian | Stream Deck | Stream Deck @2x |
|--------|----------|-------------|-----------------|
| Canvas | 24×24px | 72×72px | 144×144px |
| Safe Zone | 20×20px | 64×64px | 128×128px |
| Icon Zone | 16×16px | 52×52px | 104×104px |
| Stroke Width | 2px | 6px | 12px |
| Corner Radius | 2px | 4px | 8px |
| Format | SVG | PNG | PNG |

### Resources

**Design Tools:**
- Figma (recommended for icon design)
- Inkscape (free SVG editor)
- SVGO (SVG optimizer)
- ImageMagick (batch image processing)

**Inspiration:**
- Lucide Icons - https://lucide.dev/
- Feather Icons - https://feathericons.com/
- Heroicons - https://heroicons.com/
- Material Icons - https://fonts.google.com/icons

**Testing:**
- Contrast Checker - https://webaim.org/resources/contrastchecker/
- Elgato Stream Deck Simulator - Built into Stream Deck software

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-15
**Maintained By:** Américo
**License:** MIT (same as Teleprompter Plus plugin)
