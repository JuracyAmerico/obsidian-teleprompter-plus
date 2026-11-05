/**
 * ISC-116: evaluates the built dist/main.js the way a phone would. On iOS `require` returns
 * undefined for Node modules; elsewhere it may throw. Both must leave a loadable plugin class.
 * Run after `bun run build`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const code = readFileSync(join(import.meta.dir, '..', 'dist', 'main.js'), 'utf8')

class Stub {
	constructor(..._args: unknown[]) {}
}

const obsidian = new Proxy({ apiVersion: '1.15.0', Platform: { isMobile: true, isMobileApp: true, isDesktopApp: false, isIosApp: true, isMacOS: false } } as Record<string, unknown>, {
	get(target, key: string | symbol) {
		if (typeof key !== 'string') return undefined
		if (key in target) return target[key]
		return /^[A-Z]/.test(key) ? Stub : () => {}
	},
})

let failed = false
for (const mode of ['undefined', 'throw'] as const) {
	const requireLikePhone = (name: string) => {
		if (name === 'obsidian') return obsidian
		if (mode === 'throw') throw new Error(`Cannot find module '${name}'`)
		return undefined
	}
	const module = { exports: {} as unknown }
	try {
		new Function('require', 'module', 'exports', code)(requireLikePhone, module, module.exports)
		const plugin = (module.exports as { default?: unknown }).default ?? module.exports
		if (typeof plugin !== 'function') throw new Error(`exports a ${typeof plugin}, not a plugin class`)
		console.log(`PASS require ${mode}: plugin class loaded`)
	} catch (err) {
		failed = true
		console.log(`FAIL require ${mode}: ${(err as Error).message}`)
	}
}
process.exit(failed ? 1 : 0)
