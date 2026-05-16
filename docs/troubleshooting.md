# Troubleshooting

A quick top-10 lives in the [README](../README.md#troubleshooting). This page covers the full set.

If you don't see your issue here, open [Developer Console](#how-to-read-the-developer-console) and look for red errors first — they usually name the file and line, which speeds up diagnosis dramatically.

---

## WebSocket server

### Server won't start — "Port already in use"

The default port `8765` is bound by another process (often a second Obsidian instance).

1. Check whether another Obsidian instance is running.
2. Settings → Connection → change *WebSocket Port* (any free port works).
3. Click *Restart server*.
4. Update your Stream Deck plugin and any custom scripts to point at the new port.

### Stream Deck not connecting

1. Confirm Obsidian is running with Teleprompter Plus enabled.
2. Command palette → *Show WebSocket Server Info* — confirms the server is up and shows the port.
3. Settings → Connection → *Restart server*. The April release made this safe to do at runtime.
4. In the Stream Deck plugin settings, confirm the port matches.
5. Check firewall rules — the server binds to `127.0.0.1`, so loopback must be allowed.

### Server hangs after toggling settings

If you're on an older version (pre-`0.10.1`), upgrade. A lifecycle fix in `0.10.1` resolved five interacting bugs around stop/restart that could leave the server in a dead state.

---

## Content

### Content not updating when switching notes

1. Close and reopen the teleprompter view.
2. Ensure the source note is *active* (clicked into in the editor).
3. Open Developer Console (`Cmd/Ctrl + Shift + I`) and look for errors.
4. Enable Debug Mode in Settings → Developer for verbose logging.

### Images not displaying

1. Use proper Markdown syntax: `![alt text](image.png)`.
2. Make sure the image is in the vault (or use an absolute path).
3. Check the file exists and is readable.
4. Confirm the format is supported (PNG, JPG, GIF, SVG).

### YAML frontmatter showing in teleprompter

The plugin strips frontmatter automatically. If it's still visible:

1. Confirm the frontmatter has correct `---` delimiters at the top of the file.
2. Confirm no whitespace or characters precede the opening `---`.
3. Open an issue if the problem persists.

### Citations not resolving in TTS

The TTS engine resolves `[@key]` citations to spoken form like *"(Author, Year)"* using your bibliography.

1. Ensure a `.bib` file exists in the same folder as the note, or set its path explicitly in the note's frontmatter.
2. Confirm the citation key matches a `@type{key, ...}` entry in the bib file.
3. Check the parser handled braces correctly — see `src/parser/citation-resolver.ts`. (The 0.10.1 release added brace-aware splitting for corporate names like `{Agriculture and Agri-Food Canada}`.)

---

## Performance

### Laggy scrolling with large documents

The plugin is optimized for typical notes, but documents above ~10,000 lines can stutter on slower hardware.

1. Collapse nested navigation sections to reduce DOM weight.
2. Disable Debug Mode if it's on.
3. Temporarily disable other resource-heavy Obsidian plugins.
4. Consider splitting very long scripts across multiple notes.

### High CPU usage

1. Check Settings → Developer for Debug Mode. If on, the constant logging dominates CPU — turn it off.
2. Disable scroll sync if you're not using it (the editor↔teleprompter coupling adds work on every scroll).
3. Close the navigation panel if not in use.
4. Restart Obsidian to clear any memory leaks from a long session.

---

## Display

### Fullscreen looks wrong

The plugin's fullscreen mode expands within the Obsidian window, not the OS. For a true edge-to-edge fullscreen:

1. Obsidian → View → Toggle Fullscreen (`Cmd/Ctrl + Shift + F` on most platforms).
2. Then toggle the plugin's fullscreen mode on top of that.
3. macOS users: ensure Obsidian has display permissions in System Preferences.

### Pin window does nothing

- macOS and Windows only — this feature uses Electron's always-on-top API.
- Some Linux window managers override it (Linux is best-effort for this feature).
- Try closing other always-on-top windows that may be fighting for the topmost slot.

### Mobile remote can't reach Obsidian

1. The mobile remote talks to Obsidian over your LAN; both devices need to be on the same network.
2. Settings → Connection → confirm *Auto-Start Server* is on and the port is open.
3. On the phone, the URL is `http://<your-mac-or-pc-IP>:<port>`. Find the IP with `ipconfig` (Windows) or `ifconfig`/`ipconfig getifaddr en0` (macOS).
4. Firewall on the desktop machine may need to allow inbound on the configured port from your LAN.

---

## Installation

### Plugin not appearing after install

1. Confirm files are in `<vault>/.obsidian/plugins/teleprompter-plus/` (folder name must match the plugin ID exactly).
2. Required files: `main.js`, `styles.css`, `manifest.json`.
3. Obsidian → Settings → Community plugins → click *Reload plugins*.
4. If still missing, reload Obsidian (`Cmd/Ctrl + R`).

### "Module not found: ws" error

The WebSocket module didn't get bundled. If you built from source:

```bash
bun install
bun run build
```

Then redeploy the built `dist/main.js` to your vault's plugin folder.

### Plugin fails to load

1. Check Obsidian version — the plugin requires `1.8.7` or newer.
2. Open Developer Console (`Cmd/Ctrl + Shift + I`) and look for red errors.
3. Validate `manifest.json` is well-formed JSON.
4. Try a clean reinstall: delete the plugin folder, redownload, redeploy.
5. Enable Debug Mode for detailed startup logs.

---

## How to read the Developer Console

`Cmd/Ctrl + Shift + I` opens Chrome DevTools inside Obsidian. The *Console* tab shows everything the plugin (and Obsidian) logs.

- **Red lines** are errors — usually with a file path and line number. Copy these into issue reports.
- **Yellow lines** are warnings — usually safe to ignore unless they correlate with a visible problem.
- Enable Settings → Developer → Debug Mode for verbose logs from Teleprompter Plus specifically. Turn it off when you're done — it generates a lot of output.

---

## Getting help

If nothing here resolved your issue:

1. **Issue report** — [GitHub Issues](https://github.com/JuracyAmerico/obsidian-teleprompter-plus/issues). Include: Obsidian version, plugin version, OS, exact error from Developer Console, steps to reproduce. Screenshots or a 10-second screen recording help a lot.
2. **Discussion** — [GitHub Discussions](https://github.com/JuracyAmerico/obsidian-teleprompter-plus/discussions) for usage questions and feature ideas.
3. **Obsidian Forum** — [forum.obsidian.md](https://forum.obsidian.md/) — search "teleprompter" before posting.
