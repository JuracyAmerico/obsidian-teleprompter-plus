# Teleprompter Plus Design Documentation

**Version:** 1.0.0
**Created:** 2025-12-15
**Author:** Américo

Complete design system and icon guidelines for Teleprompter Plus.

---

## 📚 Documentation Overview

This directory contains the complete design system for Teleprompter Plus, including:

- **Design System Specification** - Grid systems, colors, typography, spacing rules
- **Icon Catalog** - Visual reference of all 34+ icons
- **Implementation Guide** - How to use the design system in code
- **Design Tokens** - CSS and JSON variables for consistent styling
- **Icon Examples** - SVG source files for key icons

---

## 🚀 Quick Start

### For Designers

1. Read **[DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)** - Complete design rules
2. Browse **[ICON-CATALOG.md](./ICON-CATALOG.md)** - See all icons
3. Use **[design-tokens.css](./design-tokens.css)** - Apply consistent styles
4. Reference **[icons/](./icons/)** - Copy and adapt SVG examples

### For Developers

1. Import **[design-tokens.css](./design-tokens.css)** or **[design-tokens.json](./design-tokens.json)**
2. Read **[IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)** - Code examples
3. Use icon SVGs from **[icons/](./icons/)** directory
4. Follow build workflow in implementation guide

### For Icon Creation

1. Review **[DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)** → Icon Style Guide section
2. Check **[ICON-CATALOG.md](./ICON-CATALOG.md)** → Designing New Icons section
3. Use design tokens for measurements and colors
4. Test against accessibility checklist
5. Export using build scripts in **[IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)**

---

## 📁 File Structure

```
docs/
├── README.md                    (this file)
├── DESIGN-SYSTEM.md             (complete design specification)
├── ICON-CATALOG.md              (visual icon reference)
├── IMPLEMENTATION-GUIDE.md      (code integration guide)
├── design-tokens.css            (CSS custom properties)
├── design-tokens.json           (JSON design tokens)
└── icons/                       (SVG icon examples)
    ├── icon-play.svg
    ├── icon-pause.svg
    ├── icon-reset.svg
    ├── icon-font.svg
    ├── icon-timer.svg
    ├── streamdeck-icon-speed-up.svg
    ├── streamdeck-icon-speed-down.svg
    ├── streamdeck-icon-fullscreen.svg
    ├── streamdeck-icon-flip-horizontal.svg
    ├── streamdeck-icon-flip-vertical.svg
    ├── streamdeck-icon-section-next.svg
    └── streamdeck-icon-section-previous.svg
```

---

## 📖 Documentation Files

### [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)

**Complete design system specification (13,000+ words)**

**Contents:**
- Design principles and philosophy
- Grid system (24×24px, 72×72px, 144×144px)
- Color palette (brand, semantic, theme colors)
- Icon style guide (visual language, stroke rules, spacing)
- Typography & spacing guidelines
- Stream Deck specific requirements
- Icon library reference
- Usage guidelines
- Export & implementation instructions
- Design tokens (CSS variables)

**When to use:** Designing new icons, establishing brand consistency, understanding the visual system

---

### [ICON-CATALOG.md](./ICON-CATALOG.md)

**Visual reference of all 34+ icons**

**Contents:**
- Obsidian plugin icons (5 core icons)
- Stream Deck action icons (29+ actions)
- Icon descriptions and usage
- Visual representations (ASCII art)
- State conventions (colors, opacity)
- Icon combinations
- Design workflow for new icons
- File organization

**When to use:** Looking up existing icons, understanding icon states, planning new icons

---

### [IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)

**Practical code integration guide**

**Contents:**
- Quick start instructions
- Using design tokens (CSS/JS/Svelte)
- Obsidian plugin icon integration
- Stream Deck manifest configuration
- Creating new icons (step-by-step)
- Build & export workflow (scripts)
- Testing checklist
- Troubleshooting

**When to use:** Integrating icons into code, setting up build pipeline, debugging icon issues

---

### [design-tokens.css](./design-tokens.css)

**CSS custom properties for consistent styling**

**Variables:**
- Colors (brand, semantic, theme)
- Sizes (icons, canvas, safe zones)
- Spacing (padding, margins)
- Stroke (widths, styles)
- Opacity levels
- Typography settings

**Usage:**
```css
@import './docs/design-tokens.css';

.icon {
  width: var(--tp-icon-size-md);
  color: var(--tp-color-brand);
  stroke-width: var(--tp-stroke-width);
}
```

---

### [design-tokens.json](./design-tokens.json)

**JSON format design tokens for JavaScript/TypeScript**

**Usage:**
```typescript
import tokens from './docs/design-tokens.json';

const iconSize = tokens.size.icon.md; // "24px"
const brandColor = tokens.color.brand.primary; // "#4A90E2"
```

---

### [icons/](./icons/)

**SVG source files for key icons**

**Obsidian Icons (24×24px):**
- `icon-play.svg` - Start auto-scrolling
- `icon-pause.svg` - Stop auto-scrolling
- `icon-reset.svg` - Return to top
- `icon-font.svg` - Adjust font size
- `icon-timer.svg` - Countdown timer

**Stream Deck Icons (72×72px):**
- `streamdeck-icon-speed-up.svg` - Increase speed
- `streamdeck-icon-speed-down.svg` - Decrease speed
- `streamdeck-icon-fullscreen.svg` - Toggle fullscreen
- `streamdeck-icon-flip-horizontal.svg` - Mirror horizontally
- `streamdeck-icon-flip-vertical.svg` - Mirror vertically
- `streamdeck-icon-section-next.svg` - Next section
- `streamdeck-icon-section-previous.svg` - Previous section

**Usage:** Copy and adapt these examples for new icons

---

## 🎨 Design System Overview

### Grid System

| Platform | Canvas | Safe Zone | Icon Zone | Stroke |
|----------|--------|-----------|-----------|--------|
| Obsidian | 24×24px | 20×20px | 16×16px | 2px |
| Stream Deck | 72×72px | 64×64px | 52×52px | 6px |
| Stream Deck @2x | 144×144px | 128×128px | 104×104px | 12px |

**Scaling:** Stream Deck = Obsidian × 3, Retina = Standard × 2

---

### Color Palette

**Primary Brand Color:**
- `#4A90E2` - Teleprompter Blue

**Semantic Colors:**
- Active: `#27AE60` (Green)
- Inactive: `#7F8C8D` (Gray)
- Warning: `#E67E22` (Orange)
- Danger: `#E74C3C` (Red)
- Info: `#3498DB` (Blue)

**Stream Deck Pure Pack:**
- Charcoal: `#3A3A3A`
- Blue: `#4A90E2`
- Green: `#27AE60`
- Orange: `#E67E22`
- Purple: `#9B59B6`
- Pink: `#E91E63`

---

### Visual Language

**Scrolling & Motion:**
- Horizontal lines = text
- Vertical arrow = scroll direction
- Opacity gradient = time (past → present → future)

**Playback:**
- ▶ Play (filled triangle)
- ⏸ Pause (two bars)
- ↺ Reset (curved arrow)

**Navigation:**
- → Next (right chevron)
- ← Previous (left chevron)
- ⇅ Sync (bidirectional arrows)

**Layout:**
- Four corners = Fullscreen
- 📌 Pushpin = Pin window
- ☀️ Sun = Keep awake

---

## 🔧 Common Tasks

### Import Design Tokens

**CSS:**
```css
@import './docs/design-tokens.css';
```

**JavaScript/TypeScript:**
```typescript
import tokens from './docs/design-tokens.json';
```

---

### Create New Icon

```bash
# 1. Design SVG (24×24 or 72×72)
# 2. Save to docs/icons/
# 3. Optimize
svgo docs/icons/icon-new.svg --pretty

# 4. Export PNG for Stream Deck
magick convert -background none -resize 72x72 docs/icons/streamdeck-icon-new.svg output/icon.png
magick convert -background none -resize 144x144 docs/icons/streamdeck-icon-new.svg output/icon@2x.png
```

---

### Use Icon in Obsidian Plugin

**Method 1: Import SVG**
```typescript
import IconPlay from './icons/icon-play.svg?raw';

buttonEl.innerHTML = IconPlay;
```

**Method 2: Inline**
```typescript
const ICONS = {
  play: `<svg>...</svg>`
};
```

---

### Use Icon in Stream Deck

**1. Add to manifest.json:**
```json
{
  "UUID": "com.americo.obsidian-teleprompter.action",
  "Icon": "imgs/actions/action/icon",
  "States": [
    { "Image": "imgs/actions/action/state1" }
  ]
}
```

**2. Copy PNG files:**
```bash
cp icon.png imgs/actions/action/icon.png
cp icon@2x.png imgs/actions/action/icon@2x.png
```

---

## ✅ Quality Checklist

### Before Committing New Icon

- [ ] Follows grid system (correct canvas, safe zone, stroke width)
- [ ] Uses design tokens for colors
- [ ] SVG optimized (SVGO)
- [ ] PNG exported at correct sizes (72×72, 144×144)
- [ ] Contrast ratio ≥ 4.5:1
- [ ] Recognizable at actual size
- [ ] Tested in light and dark modes
- [ ] Consistent with existing icon style
- [ ] Documented in ICON-CATALOG.md

---

## 🎯 Design Principles

1. **Clarity First** - Instantly recognizable at small sizes
2. **Motion-Focused** - Visual language centered around scrolling and control
3. **Professional** - Clean, modern aesthetic
4. **Accessible** - High contrast, works in all modes
5. **Consistent** - Same stroke, spacing, and style across all icons
6. **Scalable** - Works at 24px, 72px, and 144px

---

## 📊 Icon Statistics

- **Total Icons:** 34+
- **Obsidian Plugin:** 5 core icons (24×24px SVG)
- **Stream Deck Actions:** 29+ actions (72×72px PNG + @2x)
- **Icon Categories:** 6 (Playback, Colors, Typography, Layout, Transform, Navigation)
- **Design Token Variables:** 50+
- **Supported Platforms:** Obsidian, Stream Deck (macOS/Windows)

---

## 🔗 Related Documentation

**Feature Guides:**
- [tts-setup.md](./tts-setup.md) - Text-to-Speech setup and configuration (Kokoro, macOS Say, Web Speech)

**Main Project:**
- [README.md](../README.md) - Teleprompter Plus overview
- [CHANGELOG.md](../CHANGELOG.md) - Version history

**Stream Deck Plugin:**
- [Stream Deck README](../../com.americo.obsidian-teleprompter.sdPlugin/README.md)
- [Elgato Icons Guide](../../com.americo.obsidian-teleprompter.sdPlugin/README-ELGATO-ICONS.md)

---

## 🤝 Contributing

When creating new icons or updating the design system:

1. Follow existing design principles
2. Use design tokens (don't hardcode values)
3. Test at actual sizes on real hardware
4. Update documentation (ICON-CATALOG.md)
5. Add SVG examples to `icons/` directory
6. Follow file naming conventions
7. Optimize before committing (SVGO for SVG)

---

## 📝 License

Same as Teleprompter Plus: **MIT License**

---

## 📧 Questions?

For design system questions or icon requests:
- Open an issue on GitHub
- Reference this design documentation
- Include mockups or examples when possible

---

**Created:** 2025-12-15
**Version:** 1.0.0
**Maintained By:** Américo
