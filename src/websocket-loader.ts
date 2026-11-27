/**
 * The `ws` module for the remote server (Stream Deck, phone remote).
 *
 * `ws` is bundled into main.js (vite.config.ts) and required on first use through load-ws.cjs, so
 * a directory install, which ships only main.js, styles.css and manifest.json, has it. Nothing is
 * read from disk: before 0.12.18 this loader searched the vault's plugin folder, the working
 * directory and Obsidian's app.asar for a `node_modules/ws` that a clean install never has.
 */
import loadBundledWs from './load-ws.cjs'

// Constructor types for the parts of `ws` the server uses.
type WebSocketServerConstructor = new (_options: { server: unknown }) => {
	on: (_event: string, _handler: (..._args: unknown[]) => void) => void
	close: (_callback?: () => void) => void
}

export interface WebSocketModule {
	WebSocketServer: WebSocketServerConstructor | null
	loaded: boolean
	error?: string
}

/** What `require('ws')` is expected to hand back; checked before it is trusted. */
interface WsExports {
	WebSocketServer?: unknown
	Server?: unknown
}

/**
 * Loads the bundled `ws`. Never throws: a failure comes back as `loaded: false` with the reason,
 * so the caller can tell the user the remote server is off and why.
 * @param load - how `ws` is required; tests pass their own.
 */
export function loadWebSocketModule(load: () => unknown = loadBundledWs): WebSocketModule {
	let ws: WsExports | undefined
	try {
		ws = load() as WsExports | undefined
	} catch (error) {
		return {
			WebSocketServer: null,
			loaded: false,
			error: `Could not load the bundled ws module: ${error instanceof Error ? error.message : String(error)}`,
		}
	}

	const server = ws?.WebSocketServer ?? ws?.Server
	if (typeof server !== 'function') {
		return { WebSocketServer: null, loaded: false, error: 'The bundled ws module has no WebSocketServer' }
	}
	return { WebSocketServer: server as WebSocketServerConstructor, loaded: true }
}

/** Environment facts logged when the module fails to load. */
export function getDiagnostics(): Record<string, unknown> {
	return {
		platform: typeof process === 'undefined' ? 'unknown' : process.platform,
		versions: typeof process === 'undefined' ? {} : process.versions,
	}
}
