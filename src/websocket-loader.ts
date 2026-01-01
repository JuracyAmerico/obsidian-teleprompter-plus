/**
 * WebSocket Module Loader for Obsidian
 *
 * This module attempts to load the ws library using various strategies
 * that work in Obsidian's Electron environment.
 */

// Node.js module types for dynamic require
type NodeModule = Record<string, unknown>
declare function require(name: string): NodeModule

// WebSocket Server and WebSocket constructor types (from ws package)
// Using generic constructor types since we're loading dynamically
type WebSocketServerConstructor = new (options: { server: unknown }) => {
	on: (event: string, handler: (...args: unknown[]) => void) => void
	close: (callback?: () => void) => void
}
type WebSocketConstructor = new (url: string) => {
	on: (event: string, handler: (...args: unknown[]) => void) => void
	send: (data: string) => void
	close: () => void
	readyState: number
}

export interface WebSocketModule {
	WebSocketServer: WebSocketServerConstructor | null
	WebSocket: WebSocketConstructor | null
	loaded: boolean
	error?: string
}

/**
 * Load the ws module using multiple fallback strategies
 */
export function loadWebSocketModule(): WebSocketModule {
	const result: WebSocketModule = {
		WebSocketServer: null,
		WebSocket: null,
		loaded: false
	}

	// Strategy 1: Try to use Electron's built-in WebSocket APIs via remote
	try {
		const electron = require('electron')

		if (electron && electron.remote) {
			const remote = electron.remote
			const ws = remote.require('ws')

			if (ws) {
				result.WebSocketServer = ws.WebSocketServer || ws.Server
				result.WebSocket = ws.WebSocket || ws
				result.loaded = true
				return result
			}
		}
	} catch (e) {
		// Continue to next strategy
	}

	// Strategy 2: Try standard require with full module path
	try {
		const path = require('path')

		// Get Obsidian's app path - use configDir instead of hardcoded .obsidian
		const app = (window as unknown as { app?: { vault?: { adapter?: { basePath?: string }, configDir?: string } } }).app
		if (app?.vault?.adapter?.basePath && app.vault.configDir) {
			const vaultPath = app.vault.adapter.basePath
			const configDir = app.vault.configDir
			const wsPath = path.join(vaultPath, configDir, 'plugins', 'teleprompter-plus', 'node_modules', 'ws')

			const ws = require(wsPath)

			if (ws) {
				result.WebSocketServer = ws.WebSocketServer || ws.Server
				result.WebSocket = ws.WebSocket || ws
				result.loaded = true
				return result
			}
		}
	} catch (e) {
		// Continue to next strategy
	}

	// Strategy 3: Try using process.cwd() to build path
	try {
		const path = require('path')
		const process = require('process')

		const cwd = process.cwd()
		// Get configDir from app if available
		const app = (window as unknown as { app?: { vault?: { configDir?: string } } }).app
		const configDir = app?.vault?.configDir

		// Try various possible paths
		const possiblePaths = configDir
			? [
				path.join(cwd, 'node_modules', 'ws'),
				path.join(cwd, configDir, 'plugins', 'teleprompter-plus', 'node_modules', 'ws'),
			]
			: [path.join(cwd, 'node_modules', 'ws')]

		for (const wsPath of possiblePaths) {
			try {
				const ws = require(wsPath)

				if (ws) {
					result.WebSocketServer = ws.WebSocketServer || ws.Server
					result.WebSocket = ws.WebSocket || ws
					result.loaded = true
					return result
				}
			} catch (e) {
				// Continue to next path
			}
		}
	} catch (e) {
		// Continue to next strategy
	}

	// Strategy 4: Try to load from Obsidian's app resources
	try {
		const path = require('path')
		const process = require('process')

		// Electron apps often have resources in app.asar
		const appPath = process.resourcesPath || ''
		const wsPath = path.join(appPath, 'app.asar', 'node_modules', 'ws')

		const ws = require(wsPath)

		if (ws) {
			result.WebSocketServer = ws.WebSocketServer || ws.Server
			result.WebSocket = ws.WebSocket || ws
			result.loaded = true
			return result
		}
	} catch (e) {
		// Continue to next strategy
	}

	// Strategy 5: Last resort - try just 'ws'
	try {
		const ws = require('ws')

		if (ws) {
			result.WebSocketServer = ws.WebSocketServer || ws.Server
			result.WebSocket = ws.WebSocket || ws
			result.loaded = true
			return result
		}
	} catch (e) {
		// All strategies failed
	}

	// All strategies failed
	result.error = 'Could not load ws module using any strategy'
	console.error('[Teleprompter] WebSocket module failed to load - Stream Deck integration unavailable')

	return result
}

/**
 * Get diagnostic information about the environment
 */
export function getDiagnostics(): Record<string, unknown> {
	const diagnostics: Record<string, unknown> = {}

	try {
		const process = require('process')
		diagnostics.cwd = process.cwd()
		diagnostics.execPath = process.execPath
		diagnostics.resourcesPath = process.resourcesPath
		diagnostics.platform = process.platform
		diagnostics.arch = process.arch
		diagnostics.versions = process.versions
	} catch (e) {
		diagnostics.processError = e instanceof Error ? e.message : String(e)
	}

	try {
		const path = require('path')
		const app = (window as unknown as { app?: { vault?: { adapter?: { basePath?: string }, configDir?: string } } }).app

		if (app?.vault?.adapter?.basePath && app.vault.configDir) {
			diagnostics.vaultPath = app.vault.adapter.basePath
			diagnostics.pluginPath = path.join(
				app.vault.adapter.basePath,
				app.vault.configDir,
				'plugins',
				'teleprompter-plus'
			)
		}
	} catch (e) {
		diagnostics.pathError = e instanceof Error ? e.message : String(e)
	}

	return diagnostics
}
