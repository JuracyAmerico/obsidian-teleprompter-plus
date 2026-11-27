/**
 * The remote server's `ws` must travel inside main.js. A directory install gets only main.js,
 * styles.css and manifest.json, and until 0.12.18 `ws` was left external and searched for on disk
 * (vault plugin node_modules, the working directory, Obsidian's app.asar, a bare require), none of
 * which a clean install has: the Stream Deck and the phone remote never connected.
 *
 * These tests bundle websocket-loader.ts with the real vite.config.ts settings and run the result
 * in a sandbox whose `require` can reach Node's own modules and nothing else, the way Obsidian's
 * renderer is on a clean install.
 */
import { describe, expect, test } from 'bun:test'
import { builtinModules, createRequire } from 'node:module'
import vm from 'node:vm'
import path from 'node:path'
import { build, type Rollup, type InlineConfig } from 'vite'
import viteConfig, { NODE_BUILTINS, WS_NODE_ENTRY } from '../vite.config'

const nodeRequire = createRequire(import.meta.url)
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

async function bundleLoader(): Promise<string> {
	const base = viteConfig as InlineConfig
	const output = (await build({
		configFile: false,
		logLevel: 'silent',
		resolve: base.resolve,
		build: {
			write: false,
			minify: false,
			lib: { entry: path.resolve(import.meta.dir, 'websocket-loader.ts'), formats: ['cjs'], fileName: () => 'loader.js' },
			commonjsOptions: base.build?.commonjsOptions,
			rollupOptions: { external: base.build?.rollupOptions?.external },
		},
	})) as Rollup.RollupOutput[] | Rollup.RollupOutput
	const chunk = (Array.isArray(output) ? output[0] : output).output.find((item) => item.type === 'chunk')
	if (!chunk || chunk.type !== 'chunk') throw new Error('vite produced no chunk')
	return chunk.code
}

interface Sandbox {
	exports: { loadWebSocketModule: () => { loaded: boolean; error?: string; WebSocketServer: unknown } }
	requested: string[]
}

/**
 * Obsidian 1.15 runs Node 24, whose `http` has no `websocketMask`, so `ws` masks frames itself or
 * through its optional add-on. Newer Node and Bun have it, which would hide an add-on stub that is
 * wrong, so the sandbox hands `ws` an `http` without it.
 */
function without(id: string, hidden: string[]): unknown {
	const real = nodeRequire(id) as Record<string, unknown>
	return new Proxy(real, { get: (target, key) => (hidden.includes(String(key)) ? undefined : target[key as string]) })
}
// buffer.isUtf8 is hidden too (Obsidian has it), so the utf-8-validate fallback runs as well.
const HIDDEN: Record<string, string[]> = { http: ['websocketMask', 'websocketUnmask'], buffer: ['isUtf8'] }

/** Runs a CommonJS bundle with a `require` that serves Node built-ins only and records each call. */
function runBundle(code: string): Sandbox {
	const requested: string[] = []
	const sandboxRequire = (id: string): unknown => {
		requested.push(id)
		if (!BUILTINS.has(id)) {
			const error = new Error(`Cannot find module '${id}'`) as Error & { code: string }
			error.code = 'MODULE_NOT_FOUND'
			throw error
		}
		const hidden = HIDDEN[id.replace(/^node:/, '')]
		return hidden ? without(id, hidden) : nodeRequire(id)
	}
	const module = { exports: {} as Sandbox['exports'] }
	const wrapper = vm.runInThisContext(`(function (require, module, exports) {${code}\n})`) as (
		r: typeof sandboxRequire, m: typeof module, e: typeof module.exports,
	) => void
	wrapper(sandboxRequire, module, module.exports)
	return { exports: module.exports, requested }
}

describe('ws is bundled into main.js', () => {
	test('the build config bundles ws from its Node entry and keeps Node modules as runtime requires', () => {
		const external = (viteConfig as InlineConfig).build?.rollupOptions?.external as string[]
		expect(external).not.toContain('ws')
		expect(external).toEqual(expect.arrayContaining(['http', 'net', 'crypto', 'node:http']))
		expect(WS_NODE_ENTRY.endsWith(path.join('node_modules', 'ws', 'index.js'))).toBe(true)
		expect(NODE_BUILTINS).not.toContain('ws')
	})

	test('a clean install with no node_modules anywhere starts a real server and a client connects', async () => {
		const sandbox = runBundle(await bundleLoader())

		// Loading main.js touches no Node module: the phone build has none.
		expect(sandbox.requested).toEqual([])
		expect(sandbox.requested).not.toContain('ws')

		const loaded = sandbox.exports.loadWebSocketModule()
		expect(loaded.error).toBeUndefined()
		expect(loaded.loaded).toBe(true)
		// Only Node built-ins were asked for, never `ws` from disk.
		expect(sandbox.requested.length).toBeGreaterThan(0)
		expect(sandbox.requested.every((id) => BUILTINS.has(id))).toBe(true)

		// A real server from the bundled class; the client's message is masked, so the server unmasks
		// it, and both messages are longer than the 32- and 48-byte points where ws hands masking
		// to its optional add-on.
		const http = nodeRequire('node:http') as typeof import('node:http')
		const server = http.createServer()
		type Socket = { send: (data: string) => void; on: (event: 'message', handler: (data: unknown) => void) => void }
		const Wss = loaded.WebSocketServer as new (options: { server: unknown }) => {
			on: (event: 'connection', handler: (socket: Socket) => void) => void
			close: () => void
		}
		const wss = new Wss({ server })
		const command = JSON.stringify({ command: 'set-speed', speed: 3, padding: 'x'.repeat(64) })
		wss.on('connection', (socket) => socket.on('message', (data) => socket.send(`echo:${String(data)}`)))
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
		const { port } = server.address() as { port: number }

		const reply = await new Promise<string>((resolve, reject) => {
			const client = new WebSocket(`ws://127.0.0.1:${port}`)
			const timer = setTimeout(() => reject(new Error('no reply within 5 s')), 5000)
			client.onopen = () => client.send(command)
			client.onmessage = (event) => {
				clearTimeout(timer)
				resolve(String(event.data))
				client.close()
			}
			client.onerror = () => reject(new Error('client error'))
		})
		expect(command.length).toBeGreaterThan(48)
		expect(reply).toBe(`echo:${command}`)
		// ws asked for its add-ons, met the stub's throw, and used its own JavaScript instead.
		expect(sandbox.requested).not.toContain('bufferutil')
		wss.close()
		await new Promise<void>((resolve) => server.close(() => resolve()))
	}, 30000)

	test('a ws that fails to load is reported, not thrown', async () => {
		const { loadWebSocketModule } = await import('./websocket-loader')
		const failed = loadWebSocketModule(() => { throw new Error('boom') })
		expect(failed.loaded).toBe(false)
		expect(failed.error).toContain('boom')
		const empty = loadWebSocketModule(() => ({}))
		expect(empty.loaded).toBe(false)
		expect(empty.error).toContain('no WebSocketServer')
	})
})
