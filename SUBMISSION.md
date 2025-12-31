# Obsidian Community Plugin Submission

## Plugin Entry for community-plugins.json

Add this to `community-plugins.json` in the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository:

```json
{
  "id": "obsidian-teleprompter-plus",
  "name": "Teleprompter Plus",
  "author": "JuracyAmerico",
  "description": "Professional teleprompter with mobile remote control, Stream Deck integration, countdown timer, and voice tracking",
  "repo": "JuracyAmerico/obsidian-teleprompter-plus"
}
```

## Submission Steps

1. Go to https://github.com/obsidianmd/obsidian-releases
2. Fork the repository
3. Edit `community-plugins.json`
4. Add the JSON entry above (maintain alphabetical order by id)
5. Create a Pull Request with title: "Add plugin: Teleprompter Plus"
6. Wait for review (typically 1-7 days)

## PR Description Template

```markdown
## New Plugin Submission: Teleprompter Plus

**Plugin ID:** obsidian-teleprompter-plus
**Repository:** https://github.com/JuracyAmerico/obsidian-teleprompter-plus

### Description
Professional teleprompter for Obsidian with:
- Mobile remote control (v0.9.0) - control from your phone
- Stream Deck integration (55+ actions)
- Countdown timer for smooth starts
- Section navigation with headers
- Focus mode and eyeline guide
- Voice tracking (experimental)

### Checklist
- [x] Plugin has a valid manifest.json
- [x] Plugin is MIT licensed
- [x] Plugin README explains functionality
- [x] Plugin follows Obsidian plugin guidelines
- [x] No malicious code or external network calls
- [x] Desktop only (uses WebSocket for local control)
```

## After Approval

Once approved, users can install via:
1. Settings → Community plugins → Browse
2. Search "Teleprompter Plus"
3. Click Install → Enable

---

*This file is for reference only. Delete after submission.*
