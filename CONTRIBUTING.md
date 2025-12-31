# Contributing to Teleprompter Plus

Thank you for your interest in contributing to Teleprompter Plus! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites
- Node.js 18+
- Bun (recommended) or npm
- Obsidian installed for testing

### Development Setup

1. Fork and clone the repository:
```bash
git clone https://github.com/YOUR-USERNAME/obsidian-teleprompter-plus.git
cd obsidian-teleprompter-plus
```

2. Install dependencies:
```bash
bun install
```

3. Build the plugin:
```bash
bun run build
```

4. Copy to your Obsidian vault for testing:
```bash
cp dist/main.js dist/styles.css /path/to/your/vault/.obsidian/plugins/teleprompter-plus/
```

5. Reload Obsidian (Cmd+R / Ctrl+R)

## Making Changes

### Branch Naming
- `feature/` - New features (e.g., `feature/voice-commands`)
- `fix/` - Bug fixes (e.g., `fix/scroll-speed-issue`)
- `docs/` - Documentation updates

### Code Style
- Use TypeScript for all source files
- Follow existing code patterns and naming conventions
- Add comments for complex logic
- Keep functions focused and small

### Testing
Before submitting a PR:
- Test on your local Obsidian installation
- Test with different content (short notes, long notes, notes with headers)
- If applicable, test with Stream Deck
- Check the developer console for errors

## Submitting Changes

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Update documentation if needed
4. Test thoroughly
5. Submit a PR with a clear description

### PR Guidelines
- Reference any related issues
- Describe what changes were made and why
- Include screenshots for UI changes
- Keep PRs focused on a single feature/fix

## Reporting Issues

### Before Reporting
- Check existing issues to avoid duplicates
- Try the latest version
- Check the developer console for errors

### Bug Reports Should Include
- Obsidian version
- Plugin version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

## Questions?

- Open an issue for bugs or feature requests
- Check the [Obsidian Forum](https://forum.obsidian.md/) for general questions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
