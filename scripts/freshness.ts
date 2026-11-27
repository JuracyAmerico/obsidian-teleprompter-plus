/**
 * Freshness of the lint plugin. The Obsidian review bot runs the newest eslint-plugin-obsidianmd,
 * so a lint that runs an older one can pass here and fail review (0.12.14: installed 0.1.9, the
 * bot ran 0.6.0). This refuses when the installed plugin is behind npm latest. It never upgrades.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN = 'eslint-plugin-obsidianmd'
const REGISTRY = 'https://registry.npmjs.org'

export type LatestVersion = (name: string) => Promise<string>

export interface Freshness {
	ok: boolean
	message: string
}

function parts(version: string): number[] | null {
	const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** True when `a` is an older version than `b` (major.minor.patch; a pre-release tag is ignored). */
export function isBehind(a: string, b: string): boolean {
	const x = parts(a)
	const y = parts(b)
	if (!x || !y) throw new Error(`cannot compare versions "${a}" and "${b}"`)
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]
	return false
}

/** Asks the npm registry for the `latest` dist-tag. Throws if it cannot be reached or answers badly. */
export const registryLatest: LatestVersion = async (name) => {
	const response = await fetch(`${REGISTRY}/${name}/latest`, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(15_000),
	})
	if (!response.ok) throw new Error(`the registry answered ${response.status}`)
	const body = (await response.json()) as { version?: unknown }
	if (typeof body.version !== 'string') throw new Error('the registry answer has no version')
	return body.version
}

/** ok only when `installed` is not behind the registry's latest. Registry failure is a refusal, not a pass. */
export async function checkFreshness(installed: string, latest: LatestVersion): Promise<Freshness> {
	let newest: string
	try {
		newest = await latest(PLUGIN)
	} catch (error) {
		return {
			ok: false,
			message: `Cannot tell whether ${PLUGIN} is current: ${(error as Error).message}. Refusing, because the review bot runs the newest version. Check your network and run again.`,
		}
	}
	if (isBehind(installed, newest)) {
		return {
			ok: false,
			message: `${PLUGIN} ${installed} is behind npm latest ${newest}. The review bot runs the newest rules, so this lint can pass here and fail review. Upgrade it on purpose (bun add -d ${PLUGIN}@${newest} --exact), read the new findings, then run again.`,
		}
	}
	return { ok: true, message: `${PLUGIN} ${installed} is current (npm latest ${newest}).` }
}

export function installedVersion(root: string): string {
	const file = path.join(root, 'node_modules', PLUGIN, 'package.json')
	try {
		return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version
	} catch {
		throw new Error(`${PLUGIN} is not installed (${file} unreadable): run bun install`)
	}
}

export async function runFreshness(root: string, latest: LatestVersion = registryLatest): Promise<Freshness> {
	try {
		return await checkFreshness(installedVersion(root), latest)
	} catch (error) {
		return { ok: false, message: (error as Error).message }
	}
}

if (import.meta.main) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
	const result = await runFreshness(root)
	console.log(result.message)
	process.exit(result.ok ? 0 : 1)
}
