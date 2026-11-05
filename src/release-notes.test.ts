import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import path from 'path'
import { parseReleaseNotes } from './release-notes'

const root = path.resolve(import.meta.dir, '..')
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as { version: string }

describe('release notes', () => {
  test('current version has release notes', () => {
    // A release whose CHANGELOG has no entry for manifest.json's version fails here, in CI, before
    // users would see an empty or stale What's New dialog.
    expect(parseReleaseNotes(changelog, manifest.version).length).toBeGreaterThan(0)
  })

  test('bold lead becomes the title, section sets the icon', () => {
    const md = [
      '## [1.2.0] - 2026-01-01',
      '### Added',
      '- **Floating window.** Reads over a call.',
      '### Fixed',
      '- Plain fix line',
      '## [1.1.0] - 2025-12-01',
      '- **Old thing** should not appear',
    ].join('\n')
    expect(parseReleaseNotes(md, '1.2.0')).toEqual([
      { icon: 'plus-circle', title: 'Floating window', description: 'Reads over a call.' },
      { icon: 'wrench', title: '', description: 'Plain fix line' },
    ])
  })

  test('unknown version gives no notes', () => {
    expect(parseReleaseNotes(changelog, '0.0.0')).toEqual([])
  })
})

describe('dialog text', () => {
	test('code marks do not show as raw backticks', () => {
		const notes = parseReleaseNotes('## [1.0.0]\n\n### Added\n- **Lang.** Reads `voice-language` from the note.\n', '1.0.0')
		expect(notes[0].description).toBe('Reads voice-language from the note.')
	})

	test('the dialog shows a capped list and says how many more', () => {
		const modal = readFileSync(path.join(import.meta.dir, 'whats-new-modal.ts'), 'utf8')
		expect(modal).toContain('features.slice(0, MAX_HIGHLIGHTS)')
		expect(modal).toContain('more} more')
	})
})
