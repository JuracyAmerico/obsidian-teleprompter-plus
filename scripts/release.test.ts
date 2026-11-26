import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assertAgree, gitCommands, prepareRelease, promoteChangelog, type ReleaseFiles } from './release'

const root = path.resolve(import.meta.dir, '..')
const read = (name: string) => readFileSync(path.join(root, name), 'utf8')

const files = (): ReleaseFiles => ({
	manifest: '{\n  "id": "x",\n  "version": "0.12.11",\n  "minAppVersion": "1.8.7"\n}\n',
	pkg: '{\n  "name": "x",\n  "version": "0.12.11"\n}\n',
	versions: '{\n  "0.12.11": "1.8.7",\n  "0.12.10": "1.8.6"\n}\n',
	changelog: '# Changelog\n\n## [Unreleased]\n\n### Fixed\n- **A fix.** Done.\n\n## [0.12.11] - 2026-11-26\n\n### Fixed\n- Old\n',
})

describe('release script', () => {
	test('moves Unreleased under a dated heading and leaves an empty Unreleased', () => {
		const next = prepareRelease(files(), '0.12.12', '2026-12-01')
		expect(next.changelog).toBe(
			'# Changelog\n\n## [Unreleased]\n\n## [0.12.12] - 2026-12-01\n\n### Fixed\n- **A fix.** Done.\n\n## [0.12.11] - 2026-11-26\n\n### Fixed\n- Old\n'
		)
	})

	test('bumps manifest, package and versions: newest key first, minAppVersion copied from the previous entry', () => {
		const next = prepareRelease(files(), '0.12.12', '2026-12-01')
		expect(JSON.parse(next.manifest).version).toBe('0.12.12')
		expect(JSON.parse(next.pkg).version).toBe('0.12.12')
		expect(next.versions).toBe('{\n  "0.12.12": "1.8.7",\n  "0.12.11": "1.8.7",\n  "0.12.10": "1.8.6"\n}\n')
		expect(Object.keys(JSON.parse(next.versions))[0]).toBe('0.12.12')
		expect(() => assertAgree(next, '0.12.12')).not.toThrow()
	})

	test('keeps the files format: 2 spaces and one trailing newline, other fields untouched', () => {
		const next = prepareRelease(files(), '0.12.12', '2026-12-01')
		expect(next.manifest).toBe('{\n  "id": "x",\n  "version": "0.12.12",\n  "minAppVersion": "1.8.7"\n}\n')
	})

	test('rewriting the real files with their current version changes nothing but the version (format round-trips)', () => {
		const manifest = read('manifest.json')
		const pkg = read('package.json')
		const versions = read('versions.json')
		expect(JSON.stringify(JSON.parse(manifest), null, 2) + '\n').toBe(manifest)
		expect(JSON.stringify(JSON.parse(pkg), null, 2) + '\n').toBe(pkg)
		expect(JSON.stringify(JSON.parse(versions), null, 2) + '\n').toBe(versions)
	})

	test('refuses an empty Unreleased, a missing one, and an existing section', () => {
		expect(() => promoteChangelog('## [Unreleased]\n\n## [0.1.0] - x\n- a\n', '0.2.0', '2026-01-01')).toThrow('empty')
		expect(() => promoteChangelog('## [0.1.0] - x\n- a\n', '0.2.0', '2026-01-01')).toThrow('Unreleased')
		expect(() => promoteChangelog('## [Unreleased]\n- a\n## [0.2.0] - x\n- b\n', '0.2.0', '2026-01-01')).toThrow('already')
	})

	test('refuses a bad, repeated or older version, and writes nothing', () => {
		expect(() => prepareRelease(files(), 'v0.12.12', '2026-12-01')).toThrow('X.Y.Z')
		expect(() => prepareRelease(files(), '0.12.11', '2026-12-01')).toThrow('not newer')
		expect(() => prepareRelease(files(), '0.12.9', '2026-12-01')).toThrow('not newer')
		expect(() => prepareRelease(files(), '0.12.12', '12/01/2026')).toThrow('YYYY-MM-DD')
	})

	test('numeric comparison: 0.12.12 is newer than 0.12.9', () => {
		const f = files()
		f.manifest = f.manifest.replace('0.12.11', '0.12.9')
		f.pkg = f.pkg.replace('0.12.11', '0.12.9')
		expect(() => prepareRelease(f, '0.12.12', '2026-12-01')).not.toThrow()
	})

	test('assertAgree names the file that disagrees', () => {
		const next = prepareRelease(files(), '0.12.12', '2026-12-01')
		expect(() => assertAgree({ ...next, pkg: next.pkg.replace('0.12.12', '0.12.11') }, '0.12.12')).toThrow('package.json has 0.12.11')
		expect(() => assertAgree({ ...next, changelog: files().changelog }, '0.12.12')).toThrow('CHANGELOG.md')
	})

	test('prints commit and tag commands, and the script itself never runs git', () => {
		expect(gitCommands('0.12.12')).toEqual([
			'git add manifest.json package.json versions.json CHANGELOG.md',
			'git commit -m "release: 0.12.12"',
			'git push origin main',
			'git tag 0.12.12',
			'git push origin 0.12.12',
		])
		const source = read('scripts/release.ts')
		expect(source).not.toMatch(/spawnSync\(\s*\[?\s*['"]git/)
		expect(source).toContain("['bun', 'run', 'check'], ['bun', 'test'], ['bun', 'run', 'lint'], ['bun', 'run', 'build']")
	})
})
