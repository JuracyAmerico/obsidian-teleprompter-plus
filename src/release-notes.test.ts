import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import path from 'path'
import { MAX_HIGHLIGHTS, compareVersions, dialogHighlights, parseReleaseNotes, parseSkippedReleaseNotes } from './release-notes'

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
		expect(modal).toContain('dialogHighlights(features)')
		expect(modal).toContain('more} more')
	})
})

describe('notes for every skipped version', () => {
	const log = [
		'# Changelog',
		'## [Unreleased]',
		'- **Not shipped.** Must never show.',
		'## [0.12.11] - 2026-11-26',
		'### Fixed',
		'- **Eleven fix.** Newest.',
		'## [0.12.10] - 2026-11-26',
		'### Security',
		'- **Remote key.** Needs a key.',
		'### Fixed',
		'- **Ten fix.** Middle.',
		'## [0.12.9] - 2026-11-26',
		'### Added',
		'- **Nine add.** Oldest skipped.',
		'## [0.12.8] - 2026-11-26',
		'### Fixed',
		'- **Eight fix.** Already seen.',
	].join('\n')
	const titles = (notes: Array<{ title: string }>) => notes.map(n => n.title)

	test('every version after the last one seen is included, the seen one and Unreleased are not', () => {
		const notes = parseSkippedReleaseNotes(log, '0.12.8', '0.12.11')
		expect(new Set(notes.map(n => n.version))).toEqual(new Set(['0.12.11', '0.12.10', '0.12.9']))
		expect(titles(notes)).not.toContain('Eight fix')
		expect(titles(notes)).not.toContain('Not shipped')
	})

	test('newest version first, compared as numbers (0.12.11 comes before 0.12.9)', () => {
		const notes = parseSkippedReleaseNotes(log, '0.12.8', '0.12.11')
		expect(titles(notes).filter(t => t !== 'Remote key')).toEqual(['Eleven fix', 'Ten fix', 'Nine add'])
		expect(compareVersions('0.12.11', '0.12.9')).toBeGreaterThan(0)
	})

	test('Security items come before everything else, even from an older skipped version', () => {
		const notes = parseSkippedReleaseNotes(log, '0.12.8', '0.12.11')
		expect(titles(notes)[0]).toBe('Remote key')
		expect(notes[0].security).toBe(true)
		expect(notes.slice(1).every(n => !n.security)).toBe(true)
	})

	test('a version newer than the running one is left out', () => {
		expect(parseSkippedReleaseNotes(log, '0.12.8', '0.12.10').map(n => n.version)).not.toContain('0.12.11')
	})

	test('first install shows the current version only', () => {
		const notes = parseSkippedReleaseNotes(log, '', '0.12.11')
		expect(titles(notes)).toEqual(['Eleven fix'])
		expect(parseSkippedReleaseNotes(log, undefined, '0.12.11')).toEqual(notes)
	})

	test('one version behind shows just that version; same or newer last-seen shows the current one', () => {
		expect(titles(parseSkippedReleaseNotes(log, '0.12.10', '0.12.11'))).toEqual(['Eleven fix'])
		expect(titles(parseSkippedReleaseNotes(log, '0.12.11', '0.12.11'))).toEqual(['Eleven fix'])
		expect(titles(parseSkippedReleaseNotes(log, '0.13.0', '0.12.11'))).toEqual(['Eleven fix'])
	})

	test('a last-seen version that is not a version still shows the current one', () => {
		expect(titles(parseSkippedReleaseNotes(log, 'garbage', '0.12.11'))).toEqual(['Eleven fix'])
	})

	test('the real changelog: every release since 0.12.9 has a note, and the remote-key Security note leads', () => {
		const notes = parseSkippedReleaseNotes(changelog, '0.12.9', manifest.version)
		expect(notes.length).toBeGreaterThan(0)
		const versions = notes.map(n => n.version)
		expect(versions).toContain('0.12.10')
		expect(notes[0].security).toBe(true)
		expect(notes.find(n => n.version === '0.12.10' && n.security)?.title).toBe('The remote needs a key off this computer')
	})

	test('the dialog reads from the skipped-versions parser and the plugin version it last saw', () => {
		const modal = readFileSync(path.join(import.meta.dir, 'whats-new-modal.ts'), 'utf8')
		expect(modal).toContain('parseSkippedReleaseNotes(changelog, this.lastSeenVersion, this.version)')
	})
})

describe('dialog cap with Security', () => {
	test('the cap never hides a Security item', () => {
		const many = Array.from({ length: 12 }, (_, i) => ({ icon: '', title: `s${i}`, description: '', security: true }))
		expect(dialogHighlights(many)).toHaveLength(12)
		const mixed = [...many.slice(0, 2), ...Array.from({ length: 20 }, (_, i) => ({ icon: '', title: `n${i}`, description: '', security: false }))]
		expect(dialogHighlights(mixed)).toHaveLength(MAX_HIGHLIGHTS)
		expect(dialogHighlights(mixed).filter(n => n.security)).toHaveLength(2)
	})
})
