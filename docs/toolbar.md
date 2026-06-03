# Reading-view toolbar

The toolbar that floats above the prompt while you read. It was redesigned around
**hierarchy, grouping, and progressive disclosure** so that a dense row of equal-weight
icons becomes a calm, scannable control surface you can operate live.

Implementation lives in `src/TeleprompterApp.svelte` (control catalog, derived layout,
markup, and CSS). It layers on top of — and fully preserves — the settings-driven
show/hide/reorder system (`Settings → Toolbar`, persisted in `toolbarLayout`).

## The five ideas

1. **Hero action.** Play/Pause is visually dominant — larger, filled with the accent,
   pinned first in the Playback zone (`.btn-play.is-hero`). The single most-used control
   is never a same-size peer of a rare toggle. It keeps its dominant fill while playing.
2. **Grouped zones.** Controls are chunked into scannable zones separated by a thin
   divider (`.tp-divider`). Chunking turns ~20 icons into a few groups the eye parses
   instantly.
3. **One toggle language.** An active/on toggle is filled accent + `--text-on-accent`
   icon + a soft accent ring; inactive is a ghost outline. One shared rule covers every
   toggle (`.controls .icon-btn.active, .btn-*.active`) so the active state is never
   applied inconsistently.
4. **Readout zone.** The timer (`time-display`) is a *status readout*, not a button — it
   is pulled out of the button stream, right-aligned after a flex spacer, with
   `font-variant-numeric: tabular-nums`.
5. **Progressive disclosure.** Low-frequency controls collapse into a `⋯ More` overflow
   popover (`showMoreMenu` / `.tp-more-menu`), grouped under small uppercase zone
   sub-labels, so they are present when needed but never tax the main bar.

## Zones

Order on the bar: **Playback → Display/Type → View → Capture → System → Readout**
(`TOOLBAR_ZONE_ORDER`). Each control declares its `zone` in `TOOLBAR_CONTROL_DEFS`.

| Zone | Controls (main bar) | Notes |
|------|--------------------|-------|
| **Playback** | Play/pause (hero), Speed, Countdown, Reset | Hero is always first. |
| **Display / type** | Font size, Line height, Font family | Letter spacing, Opacity, Padding, Text/Bg color, Alignment default into **More**. |
| **View** | Fullscreen, Flip H, Flip V, Eyeline, Focus mode | Minimap, Navigation, Progress indicator default into **More**. |
| **Capture** | Voice tracking, Text-to-speech | |
| **System** | — | Auto-Pause, Keep awake, Pin, Open in Window, Quick presets default into **More**. |
| **Readout** | Time display | Rendered separately, right-aligned; never a button. |

## How it interacts with show / hide / reorder

The redesign is additive — it does **not** replace `toolbarLayout`:

- **Hidden** controls (`toolbarLayout.hidden`) never render anywhere.
- **Order within a zone** follows the user's existing `orderedControls` order; zones are
  never re-sorted internally.
- **`defaultMore`** marks a control as low-frequency, so it starts in the **More** menu —
  *unless* the user has explicitly placed it in `toolbarLayout.primary`, in which case it
  stays on the main bar. User intent always wins over the default.
- Derived state: `mainBarControls`, `moreControls`, and `readoutControl` are computed
  from the catalog + `orderedControls`; empty zones render no divider.

## Theming

No hardcoded colors. The toolbar uses Obsidian CSS variables throughout
(`--interactive-accent`, `--text-on-accent`, `--background-secondary`,
`--background-modifier-border`, `--text-muted`, `--background-primary`, …) so it adapts to
light, dark, and third-party themes. Icons are Lucide via `setIcon()`.

## Responsive behavior

When width is tight, secondary controls collapse into the **More** menu rather than the
bar wrapping to a second row — the bar never wraps. In fullscreen the toolbar follows the
existing show/hide-on-interaction behavior.

## Related

- Settings UI for show/hide/reorder: `src/settings.ts` (Toolbar tab).
- Design tokens and icon vocabulary: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md),
  [ICON-CATALOG.md](ICON-CATALOG.md).
