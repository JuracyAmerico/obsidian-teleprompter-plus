/**
 * Every gate a change must pass, in one place: `bun scripts/verify.ts`.
 * scripts/release.ts, .github/workflows/ci.yml and .github/workflows/release.yml call this and
 * list no gates of their own, so a gate added here is a gate everywhere.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runFreshness, type LatestVersion, registryLatest } from './freshness'

export interface Gate {
	name: string
	/** A command to spawn from the repo root, or an in-process check. */
	run: string[] | ((root: string) => Promise<{ ok: boolean; message: string }>)
}

export function gates(latest: LatestVersion = registryLatest): Gate[] {
	return [
		// node_modules must be exactly what bun.lock says before any other gate reads it: a stale
		// install once made the icon test compare against lucide-static 1.17 while the lockfile said
		// 1.79 (2026-11-27). Fails if bun.lock is out of date with package.json.
		{ name: 'deps', run: ['bun', 'install', '--frozen-lockfile'] },
		{ name: 'freshness', run: (root) => runFreshness(root, latest) },
		{ name: 'check', run: ['bun', 'run', 'check'] },
		{ name: 'test', run: ['bun', 'test'] },
		{ name: 'lint', run: ['bun', 'run', 'lint'] },
		{ name: 'build', run: ['bun', 'run', 'build'] },
	]
}

export const GATE_NAMES = gates().map((gate) => gate.name)

export interface Verdict {
	ok: boolean
	failed?: string
	message?: string
}

/** Runs every gate in order and stops at the first that fails. Output goes to the terminal. */
export async function verify(root: string, list: Gate[] = gates()): Promise<Verdict> {
	for (const gate of list) {
		console.log(`\n== ${gate.name}`)
		if (typeof gate.run === 'function') {
			const result = await gate.run(root)
			console.log(result.message)
			if (!result.ok) return { ok: false, failed: gate.name, message: result.message }
		} else {
			console.log(`$ ${gate.run.join(' ')}`)
			const result = Bun.spawnSync(gate.run, { cwd: root, stdout: 'inherit', stderr: 'inherit' })
			if (result.exitCode !== 0) {
				return { ok: false, failed: gate.name, message: `"${gate.run.join(' ')}" failed (exit ${result.exitCode})` }
			}
		}
	}
	return { ok: true }
}

if (import.meta.main) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
	const verdict = await verify(root)
	if (!verdict.ok) {
		console.error(`\nverify failed at "${verdict.failed}": ${verdict.message}`)
		process.exit(1)
	}
	console.log(`\nverify passed: ${GATE_NAMES.join(', ')}`)
}
