# Contributing

Thanks for your interest in Teleprompter Plus. This guide covers the dev setup, code conventions, and how to land a change cleanly.

If you only need user docs, the [README](README.md), [WebSocket API](docs/websocket-api.md), and [Stream Deck actions](docs/stream-deck-actions.md) cover those.

---

## Tech stack

| Layer | Tool |
|-------|------|
| UI framework | Svelte 5 (runes: `$state`, `$effect`) |
| Language | TypeScript (strict) |
| Build | Vite |
| Styling | Tailwind CSS + scoped CSS |
| Runtime | Obsidian Plugin API |
| WebSocket | `ws` (Node-side) |
| Markdown | `marked` + `highlight.js` |
| Package manager | Bun |

---

## Setup

```bash
git clone https://github.com/JuracyAmerico/obsidian-teleprompter-plus.git
cd obsidian-teleprompter-plus

bun install

bun run dev      # hot-reload dev build
bun run build    # production build → dist/
bun run check    # svelte-check + tsc
bun run lint     # eslint src/
```

To test in a real vault, symlink (or copy) `dist/main.js`, `dist/styles.css`, and `manifest.json` into `<vault>/.obsidian/plugins/teleprompter-plus/` and reload Obsidian.

---

## Project structure

```
obsidian-teleprompter-plus/
├── src/
│   ├── main.ts                      # plugin lifecycle, command registration, view registration
│   ├── view.ts                      # ItemView for the teleprompter
│   ├── TeleprompterApp.svelte       # main UI component
│   ├── settings.ts                  # settings tab + interface
│   ├── websocket-server.ts          # local WebSocket server
│   ├── websocket-loader.ts          # dynamic ws-module loading for Electron
│   ├── obs-service.ts               # OBS WebSocket integration
│   ├── prompt-modal.ts              # in-app modals
│   ├── whats-new-modal.ts           # release notes modal
│   ├── parser/
│   │   ├── citation-resolver.ts     # @key → "(Author, Year)" using .bib files
│   │   ├── text-cleaner.ts          # frontmatter, code blocks, raw LaTeX commands
│   │   └── index.ts
│   ├── tts/
│   │   ├── kokoro-engine.ts         # MLX neural TTS via Python subprocess
│   │   ├── mac-say-engine.ts        # macOS `say` command
│   │   ├── web-speech-engine.ts     # Web Speech API fallback
│   │   ├── tts-service.ts           # engine selection + state machine
│   │   └── tts-types.ts
│   └── voice/
│       ├── model-manager.ts         # Vosk model download + cache
│       ├── voice-tracking-service.ts # voice-following scroll (beta)
│       └── vosk-recognizer.ts
├── dist/                            # build output (committed for release)
│   ├── main.js
│   └── styles.css
├── docs/                            # design system, screenshots, extended docs
├── .github/workflows/release.yml    # CI: build, attest, GitHub release on tag push
├── manifest.json                    # Obsidian plugin manifest
├── versions.json                    # plugin version → min Obsidian version
├── package.json
├── tsconfig.app.json
├── vite.config.ts
└── eslint.config.js
```

---

## Code conventions

- **TypeScript** — strict mode. Prefer explicit types over `any`; the lint config rejects `any` (use `unknown` if you really mean it).
- **Naming** — `camelCase` for variables and functions, `PascalCase` for classes and Svelte components, `UPPER_SNAKE_CASE` for module-level constants.
- **Comments** — JSDoc on public functions where the *why* isn't obvious. Don't restate the code in prose.
- **Svelte 5 runes** — use `$state`, `$derived`, `$effect`. Don't reach back to Svelte 4 stores in new code.
- **Obsidian APIs** — prefer `activeWindow.setTimeout` over `setTimeout` for popout-window compatibility. Prefer `parent.createSpan({...})` over `document.createElement('span', {...})`. The Obsidian ESLint plugin will flag these.
- **No inline styles** — use a class in `styles.css` (the portal scanner rejects inline styles).
- **No `console.log` in shipping code** — wrap in `if (this.settings.debugMode)` or remove.

---

## Workflow

1. Branch from `main`: `git checkout -b feature/short-description` or `fix/short-description`.
2. Make changes. Run `bun run check` and `bun run lint` as you go.
3. Test in Obsidian against a real vault — both light and dark themes, both small (~50 lines) and large (>1000 lines) documents.
4. Test WebSocket changes against the Stream Deck plugin OR a one-off script (see [WebSocket API](docs/websocket-api.md)).
5. Update `CHANGELOG.md` with a one-line entry under "Unreleased".
6. Commit with a clear message. Conventional Commits style preferred (`fix:`, `feat:`, `chore:`, `docs:`, `ci:`, `refactor:`).
7. Push and open a PR. Describe what you changed, why, and how you tested it.

---

## Releasing

Maintainer-only:

1. Bump `manifest.json` `version` and add the corresponding entry to `versions.json` mapping the version to the minimum Obsidian version it requires.
2. Run `bun run build` and commit `dist/main.js` (and `dist/styles.css` if changed).
3. Tag: `git tag -a 0.X.Y -m "0.X.Y — ..."`.
4. Push: `git push origin main && git push origin 0.X.Y`.
5. The `Release` GitHub Actions workflow builds, attests, and publishes the GitHub Release automatically.
6. The Obsidian Community Portal's automated scanner picks up the new release within minutes.

---

## Performance considerations

The plugin runs in Obsidian's Electron process and shares CPU with everything else the user has open. Some patterns to follow:

- **Debounce scroll handlers** (~50ms is the sweet spot). Use passive listeners.
- **Memoize markdown rendering.** Track last-rendered content; skip if unchanged.
- **`requestAnimationFrame` for animation.** Time-delta calculations keep speed consistent across frame rates.
- **Batch DOM operations.** Header registration runs inside a single RAF callback.
- **Guard logs.** Debug-mode logs should never run in the hot scroll path when debug mode is off.

---

## Tips

- Use Debug Mode (Settings → Developer) to see detailed plugin logs in the console.
- Test long documents (>1,000 lines) before committing scroll-path changes.
- Test both themes — light and dark — for any UI change.
- For TTS changes, test on Apple Silicon (Kokoro) and on a non-Mac (Web Speech fallback).
- Check the Developer Console regularly for warnings; the Obsidian API team adds deprecations between minor versions.

---

## Questions

Open a [Discussion](https://github.com/JuracyAmerico/obsidian-teleprompter-plus/discussions) for design questions, or an [Issue](https://github.com/JuracyAmerico/obsidian-teleprompter-plus/issues) for confirmed bugs.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
