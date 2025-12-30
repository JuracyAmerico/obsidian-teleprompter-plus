# Teleprompter Plus Icon Implementation Guide

**Version:** 1.0.0
**Last Updated:** 2025-12-15

Quick start guide for implementing the Teleprompter Plus design system in your code.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Using Design Tokens](#using-design-tokens)
3. [Obsidian Plugin Icons](#obsidian-plugin-icons)
4. [Stream Deck Icons](#stream-deck-icons)
5. [Creating New Icons](#creating-new-icons)
6. [Build & Export Workflow](#build--export-workflow)

---

## Quick Start

### 1. Review Design Documentation

Read these documents in order:

1. **[DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)** - Complete design system specification
2. **[ICON-CATALOG.md](./ICON-CATALOG.md)** - Visual reference of all icons
3. **[IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)** - This document

### 2. Import Design Tokens

**CSS (for Obsidian plugin):**
```css
@import './docs/design-tokens.css';
```

**JavaScript/TypeScript (JSON tokens):**
```typescript
import designTokens from './docs/design-tokens.json';

// Access token values
const brandColor = designTokens.color.brand.primary; // "#4A90E2"
const iconSize = designTokens.size.icon.md; // "24px"
```

### 3. Use Existing Icons

**Copy from design examples:**
```bash
# Copy example SVG icons to your src directory
cp docs/icons/icon-play.svg src/icons/
cp docs/icons/icon-pause.svg src/icons/
# ... etc
```

---

## Using Design Tokens

### In CSS

```css
/* Use CSS custom properties */
.teleprompter-button {
  width: var(--tp-icon-size-md); /* 24px */
  height: var(--tp-icon-size-md);
  color: var(--tp-icon-foreground);
  border-radius: var(--tp-radius-obsidian); /* 2px */
  padding: var(--tp-spacing-sm); /* 4px */
}

.teleprompter-button:hover {
  color: var(--tp-color-brand); /* Teleprompter Blue */
}

.teleprompter-button.active {
  color: var(--tp-color-active); /* Green */
}
```

### In JavaScript/TypeScript

```typescript
import tokens from './docs/design-tokens.json';

// Use in code
const iconConfig = {
  size: tokens.size.icon.md,
  strokeWidth: tokens.stroke.obsidian.width,
  color: tokens.color.brand.primary
};
```

### In Svelte Components

```svelte
<script>
  import { onMount } from 'svelte';
  import IconPlay from './icons/icon-play.svg';
</script>

<style>
  .icon {
    width: var(--tp-icon-size-md);
    height: var(--tp-icon-size-md);
    color: var(--tp-icon-foreground);
    transition: color 0.2s ease;
  }

  .icon.active {
    color: var(--tp-color-active);
  }
</style>

<button class="icon" class:active={isPlaying} on:click={handlePlay}>
  {@html IconPlay}
</button>
```

---

## Obsidian Plugin Icons

### File Structure

```
src/
├── icons/
│   ├── icon-play.svg
│   ├── icon-pause.svg
│   ├── icon-reset.svg
│   ├── icon-font.svg
│   └── icon-timer.svg
└── main.ts
```

### Import in TypeScript

**Method 1: Direct import (Vite/Webpack with SVG loader)**
```typescript
import IconPlay from './icons/icon-play.svg?raw';

// Use in HTML
const buttonEl = createEl('button');
buttonEl.innerHTML = IconPlay;
```

**Method 2: Fetch at runtime**
```typescript
async function loadIcon(name: string): Promise<string> {
  const response = await fetch(`/icons/icon-${name}.svg`);
  return response.text();
}

// Use
const playIcon = await loadIcon('play');
```

**Method 3: Inline in code**
```typescript
const ICONS = {
  play: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <polygon points="8,6 18,12 8,18" fill="currentColor"/>
  </svg>`,
  pause: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect x="7" y="6" width="3" height="12" fill="currentColor"/>
    <rect x="14" y="6" width="3" height="12" fill="currentColor"/>
  </svg>`
};
```

### Dynamic Icon Rendering

```typescript
class IconRenderer {
  private icons: Map<string, string> = new Map();

  async loadIcon(name: string): Promise<void> {
    const svg = await this.fetchIconSVG(name);
    this.icons.set(name, svg);
  }

  render(name: string, container: HTMLElement): void {
    const svg = this.icons.get(name);
    if (svg) {
      container.innerHTML = svg;
    }
  }

  // Apply design tokens
  applyState(element: HTMLElement, state: 'active' | 'inactive'): void {
    if (state === 'active') {
      element.style.color = 'var(--tp-color-active)';
      element.style.opacity = 'var(--tp-opacity-primary)';
    } else {
      element.style.color = 'var(--tp-color-inactive)';
      element.style.opacity = 'var(--tp-opacity-subtle)';
    }
  }

  private async fetchIconSVG(name: string): Promise<string> {
    // Implementation depends on your build setup
    return '';
  }
}
```

### Icon Button Component

```typescript
function createIconButton(
  icon: string,
  tooltip: string,
  onClick: () => void
): HTMLButtonElement {
  const button = createEl('button', {
    cls: 'tp-icon-button',
    attr: {
      'aria-label': tooltip
    }
  });

  button.innerHTML = icon;
  button.addEventListener('click', onClick);

  return button;
}

// Usage
const playButton = createIconButton(
  ICONS.play,
  'Start scrolling',
  () => this.startScrolling()
);
```

---

## Stream Deck Icons

### Directory Structure

```
com.americo.obsidian-teleprompter.sdPlugin/
└── imgs/
    └── actions/
        ├── playpause/
        │   ├── icon.png       (72×72 - shown in Stream Deck UI)
        │   ├── icon@2x.png    (144×144 - retina)
        │   ├── play.png       (72×72 - button state)
        │   ├── play@2x.png    (144×144 - retina)
        │   ├── pause.png
        │   └── pause@2x.png
        └── reset/
            ├── icon.png
            └── icon@2x.png
```

### Manifest Configuration

**manifest.json**
```json
{
  "Actions": [
    {
      "UUID": "com.americo.obsidian-teleprompter.playpause",
      "Icon": "imgs/actions/playpause/icon",
      "Name": "Play/Pause",
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
    },
    {
      "UUID": "com.americo.obsidian-teleprompter.reset",
      "Icon": "imgs/actions/reset/icon",
      "Name": "Reset to Top"
    }
  ]
}
```

**Notes:**
- Omit `.png` extension in manifest (Stream Deck adds it)
- Standard and `@2x` versions must be in same directory
- `icon.png` = Action icon in Stream Deck UI
- State images = What appears on the physical button

### TypeScript Action Implementation

```typescript
import { action, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';

@action({ UUID: 'com.americo.obsidian-teleprompter.playpause' })
export class PlayPauseAction extends SingletonAction {
  private isPlaying = false;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    // Set initial state
    await ev.action.setState(this.isPlaying ? 1 : 0);
  }

  override async onKeyDown(): Promise<void> {
    this.isPlaying = !this.isPlaying;

    // Update button to show play (0) or pause (1)
    await this.setState(this.isPlaying ? 1 : 0);

    // Send WebSocket command to Obsidian
    this.sendCommand({ action: 'playpause' });
  }

  private sendCommand(data: any): void {
    // WebSocket implementation
  }
}
```

### State Management

```typescript
// Update all buttons of this action
await streamDeck.actions.setState(0); // Show play icon

// Update specific button
await ev.action.setState(1); // Show pause icon

// Set title
await ev.action.setTitle('Playing');

// Set title color (use design tokens)
await ev.action.setTitleColor('#27AE60'); // --tp-color-active
```

---

## Creating New Icons

### Step-by-Step Workflow

#### 1. Design in Figma/Sketch/Inkscape

**Obsidian Icon (24×24px):**
1. Create 24×24px artboard
2. Add 2px padding guides (safe zone: 20×20px)
3. Design icon with 2px stroke
4. Use design tokens for colors
5. Export as SVG

**Stream Deck Icon (72×72px):**
1. Create 72×72px artboard
2. Add 4px padding guides (safe zone: 64×64px)
3. Design icon with 6px stroke
4. Use white (#FFFFFF) for icon color
5. Export as PNG (72×72 and 144×144)

#### 2. Optimize SVG (Obsidian)

```bash
# Install SVGO
npm install -g svgo

# Optimize
svgo icon-new.svg --multipass --pretty

# Manual optimization checklist:
# - Remove unnecessary groups
# - Combine paths where possible
# - Round coordinates to 2 decimals
# - Use currentColor for stroke/fill
# - Add <title> and <desc>
```

#### 3. Export PNG (Stream Deck)

**From SVG using ImageMagick:**
```bash
# Standard resolution (72×72)
magick convert -background none -resize 72x72 icon.svg icon.png

# Retina resolution (144×144)
magick convert -background none -resize 144x144 icon.svg icon@2x.png
```

**From Figma:**
1. Select artboard
2. Click "Export" in right panel
3. Add export settings:
   - Format: PNG
   - Size: 1x and 2x
4. Export both versions

#### 4. Validate Icon

**Checklist:**
- [ ] Follows grid system (safe zones, stroke width)
- [ ] Uses design token colors
- [ ] SVG optimized (no unnecessary code)
- [ ] PNG at correct sizes (72×72 and 144×144)
- [ ] High contrast (4.5:1 minimum)
- [ ] Recognizable at actual size
- [ ] Consistent with existing icons

#### 5. Add to Codebase

**Obsidian:**
```bash
# Copy to src/icons/
cp icon-new.svg src/icons/

# Import in code
import IconNew from './icons/icon-new.svg';
```

**Stream Deck:**
```bash
# Create action directory
mkdir -p imgs/actions/new-action

# Copy files
cp icon-new.png imgs/actions/new-action/icon.png
cp icon-new@2x.png imgs/actions/new-action/icon@2x.png

# Update manifest.json
# Add new action entry
```

---

## Build & Export Workflow

### Automated Build Script

**package.json**
```json
{
  "scripts": {
    "icons:optimize": "svgo -f src/icons --config svgo.config.js",
    "icons:streamdeck": "node scripts/export-streamdeck-icons.js",
    "icons:build": "npm run icons:optimize && npm run icons:streamdeck",
    "build": "npm run icons:build && vite build"
  }
}
```

### SVGO Configuration

**svgo.config.js**
```javascript
module.exports = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false, // Keep viewBox
          cleanupIds: false,    // Preserve IDs
        },
      },
    },
    {
      name: 'addAttributesToSVGElement',
      params: {
        attributes: [
          { stroke: 'currentColor' }, // Use currentColor
        ],
      },
    },
  ],
};
```

### Stream Deck Export Script

**scripts/export-streamdeck-icons.js**
```javascript
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const ICONS_DIR = path.join(__dirname, '../docs/icons');
const OUTPUT_DIR = path.join(__dirname, '../com.americo.obsidian-teleprompter.sdPlugin/imgs/actions');

async function exportStreamDeckIcons() {
  const svgFiles = fs.readdirSync(ICONS_DIR)
    .filter(file => file.startsWith('streamdeck-') && file.endsWith('.svg'));

  for (const file of svgFiles) {
    const inputPath = path.join(ICONS_DIR, file);
    const baseName = file.replace('streamdeck-icon-', '').replace('.svg', '');
    const outputDir = path.join(OUTPUT_DIR, baseName);

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });

    // Export standard resolution (72×72)
    await execAsync(
      `magick convert -background none -resize 72x72 "${inputPath}" "${outputDir}/icon.png"`
    );

    // Export retina resolution (144×144)
    await execAsync(
      `magick convert -background none -resize 144x144 "${inputPath}" "${outputDir}/icon@2x.png"`
    );

    console.log(`✓ Exported ${baseName}`);
  }

  console.log('✨ All Stream Deck icons exported successfully!');
}

exportStreamDeckIcons().catch(console.error);
```

**Run export:**
```bash
npm run icons:streamdeck
```

### Git Workflow

**What to commit:**
- Source SVG files (`src/icons/`, `docs/icons/`)
- Design system documentation
- Design tokens (JSON/CSS)
- Build scripts

**What to ignore (`.gitignore`):**
```
# Generated PNG files (can be rebuilt)
*.png
!docs/assets/*.png  # Except documentation screenshots

# Optimized SVGs (generate on build)
dist/
build/
```

**Alternative: Commit PNGs**
If you want reproducible builds without requiring ImageMagick:
```
# Commit Stream Deck PNGs
!imgs/actions/**/*.png
```

---

## Testing Checklist

### Visual Testing

**Obsidian Plugin:**
- [ ] Icons visible in ribbon (left sidebar)
- [ ] Icons visible in command palette
- [ ] Icons match design system colors
- [ ] Icons scale correctly at different sizes
- [ ] Dark mode compatibility

**Stream Deck:**
- [ ] Icons visible on Stream Deck LCD
- [ ] Icons recognizable at arm's length
- [ ] Active/inactive states clearly different
- [ ] Icons match brand style
- [ ] Test on actual Stream Deck hardware

### Accessibility Testing

- [ ] Contrast ratio ≥ 4.5:1 (WCAG AA)
- [ ] Icons recognizable without color
- [ ] Tooltips/labels provided
- [ ] Keyboard accessible
- [ ] Screen reader compatible (aria-label)

### Performance Testing

- [ ] Icons load quickly (<100ms)
- [ ] No layout shift during icon load
- [ ] SVG file sizes reasonable (<5KB)
- [ ] PNG file sizes reasonable (<10KB)

---

## Troubleshooting

### SVG Not Displaying in Obsidian

**Issue:** SVG appears blank or broken

**Solutions:**
1. Check `fill="currentColor"` or `stroke="currentColor"`
2. Verify viewBox matches canvas size
3. Remove width/height attributes (let CSS control size)
4. Check for invalid paths

### Stream Deck Icon Blurry

**Issue:** Icon looks pixelated on Stream Deck

**Solutions:**
1. Ensure @2x version exists (144×144px)
2. Check PNG export quality (use lossless)
3. Verify stroke width (6px minimum)
4. Test on actual hardware (not just simulator)

### Colors Not Matching Design System

**Issue:** Icon colors don't match design tokens

**Solutions:**
1. Import design-tokens.css in your stylesheet
2. Use `var(--tp-color-*)` instead of hardcoded colors
3. Check theme-dark overrides
4. Verify CSS custom property support

### Build Script Failing

**Issue:** `npm run icons:build` errors

**Solutions:**
1. Install dependencies: `npm install -g svgo imagemagick`
2. Check file paths in scripts
3. Verify SVG files are valid
4. Check permissions on output directories

---

## Quick Reference

### Design Token Variables

```css
/* Most commonly used */
--tp-color-brand: #4A90E2;
--tp-color-active: #27AE60;
--tp-color-inactive: #7F8C8D;

--tp-icon-size-md: 24px;
--tp-icon-size-streamdeck: 72px;

--tp-stroke-width: 2px;
--tp-stroke-width-streamdeck: 6px;

--tp-spacing-sm: 4px;
--tp-spacing-md: 8px;

--tp-opacity-subtle: 0.4;
--tp-opacity-tertiary: 0.6;
```

### File Naming

```
Obsidian:      icon-{name}.svg
Stream Deck:   streamdeck-icon-{name}.svg
Exported PNG:  {action}/{state}.png and {action}/{state}@2x.png
```

### Common Commands

```bash
# Optimize SVG
svgo icon.svg --pretty

# Export Stream Deck PNG (standard)
magick convert -background none -resize 72x72 icon.svg icon.png

# Export Stream Deck PNG (retina)
magick convert -background none -resize 144x144 icon.svg icon@2x.png

# Build all icons
npm run icons:build

# Test on Stream Deck
streamdeck restart com.americo.obsidian-teleprompter
```

---

## Additional Resources

### Design Tools
- **Figma:** https://figma.com (recommended)
- **Inkscape:** https://inkscape.org (free)
- **SVGO:** https://github.com/svg/svgo (optimization)
- **ImageMagick:** https://imagemagick.org (conversion)

### Icon Inspiration
- **Lucide Icons:** https://lucide.dev/
- **Heroicons:** https://heroicons.com/
- **Feather Icons:** https://feathericons.com/
- **Material Icons:** https://fonts.google.com/icons

### Documentation
- **Elgato Stream Deck SDK:** https://developer.elgato.com/documentation/stream-deck/
- **Obsidian Plugin API:** https://github.com/obsidianmd/obsidian-api

---

**Document Version:** 1.0.0
**Maintained By:** Américo
**License:** MIT
