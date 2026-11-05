# obsidian-teleprompter-plus — project rules

## No emoji in the interface

Every icon in the plugin is Obsidian's own Lucide set, through `setIcon`. Américo, 2026-11-05: "I don't wanna
see those emoji icons again on t+". `src/no-emoji.test.ts` fails the build if one comes back. Text a reader
wrote in a note is theirs and is never touched.

## Toolchain: bun, never npm

This is a bun repo. `.github/workflows/release.yml` uses `oven-sh/setup-bun` and
`bun install --frozen-lockfile`. `bun.lock` is the only lockfile; `package-lock.json` was
removed. `bun run build` and `npm run build` produce a byte-identical bundle, so there is no
upside to npm and one downside: `npm install` writes a second lockfile that drifts from
`bun.lock` and breaks CI's `--frozen-lockfile` install.

```bash
bun install            # not npm install
bun run build          # vite build -> dist/main.js + dist/styles.css
bun run check          # svelte-check + tsc
bun test               # src/**/*.test.ts
```

## `bun run build` does not typecheck

Vite emits a clean bundle over a TypeScript error. **`bun run check` is the gate, not the
build.** Never conclude a change compiles because the build exited 0 — run `bun run check`
and confirm `0 ERRORS`. Release CI now runs `check` and `test` before `build` for this reason.

## Verifying that code reached the bundle

`dist/main.js` is minified, so local symbol names are mangled and `rg myNewHelper dist/main.js`
returns nothing on a perfectly good build. Grep for a **string literal** the code contains (a
`debugLog` prefix, an error message), and pair it with a negative probe that the *old* code's
literals are gone.

## `getActiveFile()` is not the prompted note

`app.workspace.getActiveFile()` returns whatever the user last focused in the sidebar. The
teleprompter may be showing a **pinned** note, or one opened from the Stream Deck. Always use
`currentSourcePath()` / `currentSourceFile()` in `TeleprompterApp.svelte`. Three shipped bugs
(image paths, bibliography resolution, remote note title) came from this exact confusion.

Likewise `getActiveViewOfType(MarkdownView)` returns `null` whenever the teleprompter leaf is
active — which is precisely when the user clicks something in the teleprompter. Resolve the
editor via `resolveMarkdownViewForCurrentNote()`, which matches by file path.

## Heading ids carry no position

`header-3` is a render-order **ordinal**, not a line number. To get a source line, use
`sourceLineForHeader()`, which reads `src/parser/heading-source-map.ts`. Never `parseInt` a
header id into a line. Regression tests: `src/parser/heading-source-map.test.ts`.

## Driving the live plugin yourself

Obsidian's CLI reaches the running app, so test real behaviour before asking anyone to look:
`obsidian eval code='...'`, `obsidian plugin:reload id=teleprompter-plus`, `screencapture -x -R<x,y,w,h>`
for a window or display, and `interceptor macos click X,Y` for a real mouse click. Learned the hard way
on 2026-11-04:

- **`obsidian eval` prints nothing when the call opens or closes a window.** Silence is not failure. Do
  the action in one call and read the state in the next. Keep each eval synchronous.
- **`openPopoutLeaf()` returns a leaf still in the main window.** Its `ownerDocument` only becomes the
  pop-out's later, so `view.containerEl.ownerDocument.defaultView.electronWindow.setBounds()` right after
  it moves the main Obsidian window. Use `leaf.getContainer().win`. The same timing is why `view.ts` waits
  for its own window before mounting the app.
- **Pop-outs ignore `window.close()`.** Detach the leaf. Only a live test through the command found this.
- **`getLeaf("tab")` follows the active leaf.** After focusing a floating window it opens the tab inside that
  window, on the Prompter. Check where the leaf landed.
- **Content protection blinds our own captures.** `screencapture` shows what is under a protected window, so
  turn it off before a pixel check. A capture then shows the principal's own apps: delete it after viewing.
- **Collect leaves first, then detach them.** Detaching inside `iterateAllLeaves` skips some.
- **A locked floating window passes real clicks to whatever is under it.** Raise a test window first, or
  the click lands in the principal's own apps. Check a screenshot before any click test.
- **`interceptor macos click` teleports the pointer.** A click on the corner handle right after the
  teleport passes through, because the hover has not landed yet. Click twice; a real mouse hovers first.
- **Label listeners by window and use a fresh log per run.** Listeners from an earlier eval survive and
  report into the same array, which made a correct window look broken.
- **Voice tests need a natural voice and a mic that can hear.** Play real speech through the speakers rather
  than macOS `say`. Check `SwitchAudioSource -c -t input` first, and run the same speech in the main window as a control
  before blaming floating.
- **Counting `teleprompter-stt` processes proves nothing unless voice was running.** One run is two
  processes (launcher and helper). Confirm the count before closing, not only after.

## Adding a setting

`Object.assign({}, DEFAULT_SETTINGS, saved)` means a "done once" flag defaulting to true never runs for
existing users, and `validateSettings()` in `main.ts` can silently overwrite a new value on every load.
Test a new setting through the real defaults and validator, and read it back live after a reload.

## Rebuilding the speech helper

A rebuilt `teleprompter-stt` is a new client to macOS, so it asks for the microphone again and voice
sits on "Initializing" until someone answers. Warn before rebuilding, and look at every display.

## Deploy to the vault for manual testing

```bash
bun run build && cp dist/main.js dist/styles.css \
  ~/Documents/Notes/.obsidian/plugins/teleprompter-plus/
```

Then reload Obsidian (Cmd+R). `~/Documents/Notes` **is** the live vault — `PROJECT.md` in the
notes folder calls it "legacy", which is stale from an old vault move.
