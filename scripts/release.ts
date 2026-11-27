/**
 * Prepare a release: `bun scripts/release.ts X.Y.Z [--date YYYY-MM-DD] [--dry-run]`
 *
 * 1. Moves the content of CHANGELOG.md `## [Unreleased]` under a new dated `## [X.Y.Z]` heading.
 * 2. Bumps manifest.json, package.json and versions.json (newest key first, same minAppVersion as
 *    the previous entry).
 * 3. Asserts all four agree on X.Y.Z.
 * 4. Runs scripts/verify.ts, which holds every gate (freshness of the lint plugin, check, test,
 *    lint, build). This file lists none of them.
 * 5. Looks for a scan receipt for the candidate commit (see checkReceipt). With one it prints the
 *    git commands to commit and tag; without one it prints the command that pushes the candidate
 *    to review/X.Y.Z and stops. It never commits, tags or pushes.
 *
 * Any failure after step 1, and a missing receipt, put the four files back exactly as they were.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verify } from './verify'

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

/** Where the receipt for a candidate commit lives. Committed, so the release can be audited later. */
export const RECEIPT_DIR = '.review-receipts'
export const RECEIPT_SOURCE = 'community.obsidian.md preview scan'

export function receiptPath(sha: string): string {
	return `${RECEIPT_DIR}/${sha}.json`
}

export type ReceiptCheck = { ok: true } | { ok: false; reason: string }

/**
 * A receipt says the directory's own Review branch scan ran on exactly this commit and found no
 * errors: {sha, ref, date, status, errors, warnings, source}. `text` is the file's content, or null
 * when there is no file. Anything short of status Completed with 0 errors is a refusal.
 */
export function checkReceipt(sha: string, text: string | null): ReceiptCheck {
	if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, reason: `"${sha}" is not a full commit SHA` }
	if (text === null) return { ok: false, reason: `no receipt at ${receiptPath(sha)}` }
	let receipt: Record<string, unknown>
	try {
		receipt = JSON.parse(text) as Record<string, unknown>
	} catch {
		return { ok: false, reason: `${receiptPath(sha)} is not valid JSON` }
	}
	if (typeof receipt !== 'object' || receipt === null) return { ok: false, reason: `${receiptPath(sha)} is not an object` }
	if (receipt.sha !== sha) return { ok: false, reason: `the receipt is for ${String(receipt.sha)}, not ${sha}` }
	if (receipt.source !== RECEIPT_SOURCE) return { ok: false, reason: `the receipt source is not "${RECEIPT_SOURCE}"` }
	for (const key of ['ref', 'date'] as const) {
		if (typeof receipt[key] !== 'string' || !receipt[key]) return { ok: false, reason: `the receipt has no ${key}` }
	}
	if (receipt.status !== 'Completed') return { ok: false, reason: `the scan status is "${String(receipt.status)}", not Completed` }
	if (typeof receipt.warnings !== 'number') return { ok: false, reason: 'the receipt has no warnings count' }
	if (receipt.errors !== 0) return { ok: false, reason: `the scan found ${String(receipt.errors)} errors, not 0` }
	return { ok: true }
}

/** The command that sends the candidate to the directory's Review branch scan. */
export function reviewBranchCommand(version: string, sha: string): string {
	return `git push origin ${sha}:refs/heads/review/${version}`
}

/** Reads git: stdout, or null when git fails. Injected so the walk below is testable without a repository. */
export type Git = (args: string[]) => string | null

/**
 * The commit that gets scanned: HEAD, or the nearest ancestor that is not only a receipt commit.
 * Committing a receipt moves HEAD, and a receipt cannot sit in the commit it describes.
 */
export function candidateSha(git: Git): string {
	const head = git(['rev-parse', 'HEAD'])?.trim()
	if (!head) throw new Error('cannot read HEAD')
	let sha: string = head
	for (let steps = 0; steps < 20; steps++) {
		const files = git(['show', '--name-only', '--pretty=format:', sha])
			?.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
		const receiptOnly = files && files.length > 0 && files.every((file) => file.startsWith(`${RECEIPT_DIR}/`))
		if (!receiptOnly) return sha
		const parent: string | undefined = git(['rev-parse', `${sha}^`])?.trim()
		if (!parent) throw new Error(`cannot walk back from ${sha}`)
		sha = parent
	}
	throw new Error('twenty receipt-only commits in a row: something is wrong')
}

function readGit(root: string): Git {
	return (args) => {
		const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
		return result.exitCode === 0 ? result.stdout.toString() : null
	}
}

function today(): string {
	const now = new Date()
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function main(): Promise<void> {
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
	let candidate: string
	let receipt: ReceiptCheck
	try {
		const git = readGit(root)
		candidate = candidateSha(git)
		// Read from HEAD's tree, so only a committed receipt counts.
		receipt = checkReceipt(candidate, git(['show', `HEAD:${receiptPath(candidate)}`]))
	} catch (error) {
		console.error(`Not released: ${(error as Error).message}`)
		process.exit(1)
	}
	try {
		for (const key of Object.keys(paths) as Array<keyof ReleaseFiles>) writeFileSync(paths[key], next[key])
		const written = Object.fromEntries(
			Object.entries(paths).map(([k, p]) => [k, readFileSync(p, 'utf8')])
		) as unknown as ReleaseFiles
		assertAgree(written, version)
		console.log(`Bumped to ${version}: manifest.json, package.json, versions.json and CHANGELOG.md agree.`)

		const verdict = await verify(root)
		if (!verdict.ok) throw new Error(`gate "${verdict.failed}": ${verdict.message}`)
	} catch (error) {
		restore()
		console.error(`\nNot released: ${(error as Error).message}\nThe four files are back as they were.`)
		process.exit(1)
	}

	if (!receipt.ok) {
		restore()
		console.error(
			`\nAll gates pass, but there is no clean scan receipt for the candidate ${candidate}: ${receipt.reason}.\n` +
				`The four files are back as they were. To get one, push the candidate to the directory's Review branch scan:\n\n` +
				`${reviewBranchCommand(version, candidate)}\n\n` +
				`Run the scan on community.obsidian.md, write ${receiptPath(candidate)}, commit it, and run this again.`
		)
		process.exit(1)
	}

	console.log(`\nReady (scan receipt for ${candidate}: Completed, 0 errors). Nothing was committed or pushed. Run:\n\n${gitCommands(version).join('\n')}`)
}

if (import.meta.main) await main()
