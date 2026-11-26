/**
 * Prepare a release: `bun scripts/release.ts X.Y.Z [--date YYYY-MM-DD] [--dry-run]`
 *
 * 1. Moves the content of CHANGELOG.md `## [Unreleased]` under a new dated `## [X.Y.Z]` heading.
 * 2. Bumps manifest.json, package.json and versions.json (newest key first, same minAppVersion as
 *    the previous entry).
 * 3. Asserts all four agree on X.Y.Z.
 * 4. Runs check, test, lint and build.
 * 5. Prints the git commands to commit and tag. It never commits, tags or pushes.
 *
 * Any failure after step 1 puts the four files back exactly as they were.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ReleaseFiles {
	manifest: string
	pkg: string
	versions: string
	changelog: string
}

const VERSION = /^\d+\.\d+\.\d+$/

function numbers(version: string): number[] {
	return version.split('.').map(Number)
}

function isNewer(candidate: string, base: string): boolean {
	const a = numbers(candidate)
	const b = numbers(base)
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
	return false
}

function readJson(text: string, name: string): Record<string, string> {
	try {
		return JSON.parse(text) as Record<string, string>
	} catch {
		throw new Error(`${name} is not valid JSON`)
	}
}

/** JSON back to text in the repo's format: 2 spaces, one trailing newline. */
function writeJson(value: unknown): string {
	return JSON.stringify(value, null, 2) + '\n'
}

/** The CHANGELOG with `## [Unreleased]` emptied and its content under `## [version] - date`. */
export function promoteChangelog(changelog: string, version: string, date: string): string {
	const eol = changelog.includes('\r\n') ? '\r\n' : '\n'
	const lines = changelog.split(/\r?\n/)
	const start = lines.findIndex((line) => /^## \[Unreleased\]/i.test(line))
	if (start === -1) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading')
	let end = lines.findIndex((line, i) => i > start && line.startsWith('## '))
	if (end === -1) end = lines.length
	const body = lines.slice(start + 1, end)
	while (body.length && body[0].trim() === '') body.shift()
	while (body.length && body[body.length - 1].trim() === '') body.pop()
	if (!body.some((line) => line.trim() !== '')) {
		throw new Error('"## [Unreleased]" in CHANGELOG.md is empty: write the release notes first')
	}
	if (lines.some((line) => line.startsWith(`## [${version}]`))) {
		throw new Error(`CHANGELOG.md already has a section for ${version}`)
	}
	const next = [
		...lines.slice(0, start + 1),
		'',
		`## [${version}] - ${date}`,
		'',
		...body,
		'',
		...lines.slice(end),
	]
	return next.join(eol)
}

/** All four files bumped to `version`, or an Error and nothing changed. */
export function prepareRelease(files: ReleaseFiles, version: string, date: string): ReleaseFiles {
	if (!VERSION.test(version)) throw new Error(`"${version}" is not X.Y.Z (no "v" prefix)`)
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not YYYY-MM-DD`)

	const manifest = readJson(files.manifest, 'manifest.json')
	const pkg = readJson(files.pkg, 'package.json')
	const versions = readJson(files.versions, 'versions.json')

	if (manifest.version !== pkg.version) {
		throw new Error(`manifest.json (${manifest.version}) and package.json (${pkg.version}) disagree before the bump`)
	}
	if (!isNewer(version, manifest.version)) {
		throw new Error(`${version} is not newer than the current ${manifest.version}`)
	}
	if (version in versions) throw new Error(`versions.json already has ${version}`)

	const previous = Object.keys(versions)[0]
	if (!previous) throw new Error('versions.json has no entry to take minAppVersion from')

	manifest.version = version
	pkg.version = version
	return {
		manifest: writeJson(manifest),
		pkg: writeJson(pkg),
		versions: writeJson({ [version]: versions[previous], ...versions }),
		changelog: promoteChangelog(files.changelog, version, date),
	}
}

/** Throws unless manifest.json, package.json, versions.json (first key) and the newest CHANGELOG section all say `version`. */
export function assertAgree(files: ReleaseFiles, version: string): void {
	const found = {
		'manifest.json': readJson(files.manifest, 'manifest.json').version,
		'package.json': readJson(files.pkg, 'package.json').version,
		'versions.json': Object.keys(readJson(files.versions, 'versions.json'))[0],
		'CHANGELOG.md': /^## \[(\d+\.\d+\.\d+)\]/m.exec(files.changelog)?.[1],
	}
	const wrong = Object.entries(found).filter(([, v]) => v !== version)
	if (wrong.length) {
		throw new Error(`Version mismatch, expected ${version}: ${wrong.map(([f, v]) => `${f} has ${v ?? 'nothing'}`).join(', ')}`)
	}
}

export function gitCommands(version: string): string[] {
	return [
		'git add manifest.json package.json versions.json CHANGELOG.md',
		`git commit -m "release: ${version}"`,
		'git push origin main',
		`git tag ${version}`,
		`git push origin ${version}`,
	]
}

const GATES: string[][] = [['bun', 'run', 'check'], ['bun', 'test'], ['bun', 'run', 'lint'], ['bun', 'run', 'build']]

function today(): string {
	const now = new Date()
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function main(): void {
	const args = process.argv.slice(2)
	const dryRun = args.includes('--dry-run')
	const dateAt = args.indexOf('--date')
	const date = dateAt >= 0 ? args[dateAt + 1] : today()
	const version = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--date')
	if (!version) {
		console.error('Usage: bun scripts/release.ts X.Y.Z [--date YYYY-MM-DD] [--dry-run]')
		process.exit(2)
	}

	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
	const names = { manifest: 'manifest.json', pkg: 'package.json', versions: 'versions.json', changelog: 'CHANGELOG.md' } as const
	const paths = Object.fromEntries(Object.entries(names).map(([k, n]) => [k, path.join(root, n)])) as Record<keyof ReleaseFiles, string>
	const original = Object.fromEntries(
		Object.entries(paths).map(([k, p]) => [k, readFileSync(p, 'utf8')])
	) as unknown as ReleaseFiles

	let next: ReleaseFiles
	try {
		next = prepareRelease(original, version, date)
		assertAgree(next, version)
	} catch (error) {
		console.error(`Not released: ${(error as Error).message}`)
		process.exit(1)
	}

	if (dryRun) {
		console.log(`Dry run: ${version} (${date}) would update ${Object.values(names).join(', ')}. Nothing written.`)
		return
	}

	const restore = () => {
		for (const key of Object.keys(paths) as Array<keyof ReleaseFiles>) writeFileSync(paths[key], original[key])
	}
	try {
		for (const key of Object.keys(paths) as Array<keyof ReleaseFiles>) writeFileSync(paths[key], next[key])
		const written = Object.fromEntries(
			Object.entries(paths).map(([k, p]) => [k, readFileSync(p, 'utf8')])
		) as unknown as ReleaseFiles
		assertAgree(written, version)
		console.log(`Bumped to ${version}: manifest.json, package.json, versions.json and CHANGELOG.md agree.`)

		for (const gate of GATES) {
			console.log(`\n$ ${gate.join(' ')}`)
			const result = Bun.spawnSync(gate, { cwd: root, stdout: 'inherit', stderr: 'inherit' })
			if (result.exitCode !== 0) throw new Error(`"${gate.join(' ')}" failed (exit ${result.exitCode})`)
		}
	} catch (error) {
		restore()
		console.error(`\nNot released: ${(error as Error).message}\nThe four files are back as they were.`)
		process.exit(1)
	}

	console.log(`\nReady. Nothing was committed or pushed. Run:\n\n${gitCommands(version).join('\n')}`)
}

if (import.meta.main) main()
