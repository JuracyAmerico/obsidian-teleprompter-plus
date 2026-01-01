# Rule: Obsidian Plugin Code Standards

**Priority:** HIGH
**Scope:** All Obsidian plugin development
**Created:** 2025-12-31
**Source:** PR #9198 code review - ObsidianReviewBot feedback

---

## The Rule

**Write Obsidian plugin code correctly from the start.** These standards are enforced by ObsidianReviewBot during community plugin submission.

---

## TypeScript Standards

### Never Use `any` Type

| Bad | Good |
|-----|------|
| `data: any` | `data: Record<string, unknown>` |
| `callback: (x: any) => void` | `callback: (x: unknown) => void` |
| `let service: any = null` | `let service: ServiceType \| null = null` |

**For dynamic objects:**
```typescript
// Bad
const settings: any = {}

// Good
const settings: Record<string, unknown> = {}
// Or define a proper interface
interface MySettings { key: string; value: number }
```

**For error handling:**
```typescript
// Bad
catch (error: any) { console.error(error.message) }

// Good
catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
}
```

### Timer Types (Cross-Platform)

| Bad | Good |
|-----|------|
| `interval: NodeJS.Timeout` | `interval: ReturnType<typeof setInterval>` |
| `timeout: NodeJS.Timeout` | `timeout: ReturnType<typeof setTimeout>` |

**Why:** `NodeJS.Timeout` doesn't exist in browser context. `ReturnType<typeof...>` works everywhere.

---

## Console Usage

### Only Use debug/warn/error

| Bad | Good |
|-----|------|
| `console.log('message')` | `console.debug('message')` |
| `console.log('error:', err)` | `console.error('error:', err)` |

**Exception:** Code that runs in browser context (like remote web interfaces) can use `console.log`.

**Pattern for debug logging:**
```typescript
function debugLog(...args: unknown[]) {
  if (debugMode) {
    console.debug(...args)  // NOT console.log
  }
}
```

---

## UI Standards

### Never Use Native Dialogs

| Bad | Good |
|-----|------|
| `confirm('Are you sure?')` | `new ConfirmModal(app, message, onConfirm).open()` |
| `alert('Done!')` | `new Notice('Done!')` |
| `prompt('Enter name')` | Custom modal with input field |

**ConfirmModal Pattern:**
```typescript
import { Modal, App } from 'obsidian'

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private message: string,
    private onConfirm: () => void
  ) {
    super(app)
  }

  onOpen() {
    const { contentEl } = this
    contentEl.createEl('p', { text: this.message })

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' })

    buttonContainer.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close())

    buttonContainer.createEl('button', { text: 'Confirm', cls: 'mod-cta' })
      .addEventListener('click', () => {
        this.onConfirm()
        this.close()
      })
  }
}
```

### CSS Classes Over Inline Styles

| Bad | Good |
|-----|------|
| `el.style.display = 'flex'` | `el.addClass('my-flex-container')` |
| `el.style.border = 'none'` | `el.addClass('my-no-border')` |

**Exception:** Dynamic values from user settings (colors, sizes) can use inline styles.

**CSS utility class pattern:**
```css
/* styles.css */
.tp-flex-container {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.tp-setting-no-border {
  border: none !important;
  padding: 0 !important;
}
```

```typescript
// Usage
const container = containerEl.createDiv('tp-flex-container')
setting.settingEl.addClass('tp-setting-no-border')
```

---

## Settings UI Standards

### Use Setting().setHeading() for Section Headers

| Bad | Good |
|-----|------|
| `containerEl.createEl('h3', { text: 'Section' })` | `new Setting(containerEl).setName('Section').setHeading()` |

### Sentence Case for UI Text

| Bad | Good |
|-----|------|
| `"Enable Dark Mode"` | `"Enable dark mode"` |
| `"Show Line Numbers"` | `"Show line numbers"` |
| `"Auto-Save Settings"` | `"Auto-save settings"` |

**Exception:** Proper nouns and acronyms (e.g., "Stream Deck", "OBS", "WebSocket")

---

## WebSocket Server Patterns

### Type Extensions for Dynamic Properties

```typescript
// Define interface for extended properties
interface WebSocketWithHealth {
  isAlive?: boolean
}

// Use type assertion
;(ws as WebSocketWithHealth).isAlive = true

// Check with type guard
if ((ws as WebSocketWithHealth).isAlive === false) {
  ws.terminate()
}
```

---

## Quick Checklist Before Submitting

```markdown
- [ ] No `: any` types (use `Record<string, unknown>` or proper interfaces)
- [ ] No `NodeJS.Timeout` (use `ReturnType<typeof setInterval>`)
- [ ] No `console.log` (use `console.debug`, `console.warn`, `console.error`)
- [ ] No `confirm()` or `alert()` (use Obsidian modals)
- [ ] No inline styles for static styling (use CSS classes)
- [ ] Sentence case for UI text
- [ ] `Setting().setHeading()` for section headers
```

---

## Portuguese

**Regra:** Escreva código de plugin Obsidian corretamente desde o início - sem `any`, sem `console.log`, sem `confirm()`, use classes CSS.

---

## Related Files

- `/src/confirm-modal.ts` - Reusable confirmation modal
- `/src/styles.css` - CSS utility classes

---

**Remember:** These aren't just preferences - they're enforced by ObsidianReviewBot. Do it right the first time. Nunca seja preguiçoso.

---

**Author:** Américo + Boy
