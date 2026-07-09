# obsidian-teleprompter-plus — project rules

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

## Deploy to the vault for manual testing

```bash
bun run build && cp dist/main.js dist/styles.css \
  ~/Documents/Notes/.obsidian/plugins/teleprompter-plus/
```

Then reload Obsidian (Cmd+R). `~/Documents/Notes` **is** the live vault — `PROJECT.md` in the
notes folder calls it "legacy", which is stale from an old vault move.
