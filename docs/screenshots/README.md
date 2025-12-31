# Screenshots for README

Place the following screenshot files in this folder:

## Required Screenshots

| Filename | Description | Recommended Size |
|----------|-------------|------------------|
| `main-interface.png` | Main teleprompter view with navigation panel visible | 1600x900 or similar |
| `mobile-remote.png` | Mobile remote web interface (phone screenshot) | 375x812 (iPhone) or similar |
| `stream-deck.png` | Stream Deck with Teleprompter Plus buttons | 600x400 or similar |
| `settings.png` | Settings panel in Obsidian | 800x600 or similar |

## Tips for Taking Screenshots

### Main Interface
- Open Teleprompter Plus with a sample document
- Show navigation panel expanded
- Have eyeline guide visible
- Show some content scrolled for context

### Mobile Remote
- Use browser developer tools (Cmd+Opt+I → Toggle Device Toolbar)
- Or take actual screenshot from phone
- Show playback controls and section list

### Stream Deck
- Screenshot Stream Deck app with buttons configured
- Or photo of physical Stream Deck with buttons
- Show variety of actions (play, speed, navigation)

### Settings
- Scroll to show key settings
- Show WebSocket server status
- Highlight important options

## Image Optimization

Before committing, optimize images:
```bash
# Using ImageOptim (macOS)
open -a ImageOptim *.png

# Or using pngquant
pngquant --force --quality=80-90 *.png
```

Target file sizes:
- Each image should be under 500KB
- Total screenshots folder under 2MB
