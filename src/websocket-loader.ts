/**
 * WebSocket Module Loader for Obsidian
 *
 * This module attempts to load the ws library using various strategies
 * that work in Obsidian's Electron environment.
 */

declare function require(name: string): any

export interface WebSocketModule {
	WebSocketServer: any
	WebSocket: any
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

	console.log('[WS Loader] Attempting to load WebSocket module...')

	// Strategy 1: Try to use Electron's built-in WebSocket APIs via remote
	try {
		console.log('[WS Loader] Strategy 1: Trying electron remote...')
		const electron = require('electron')

		if (electron && electron.remote) {
			const remote = electron.remote
			const ws = remote.require('ws')

			if (ws) {
				result.WebSocketServer = ws.WebSocketServer || ws.Server
				result.WebSocket = ws.WebSocket || ws
				result.loaded = true
				console.log('[WS Loader] ✅ Loaded via electron.remote')
				return result
			}
		}
	} catch (e) {
		console.log('[WS Loader] Strategy 1 failed:', e.message)
	}

	// Strategy 2: Try standard require with full module path
	try {
		console.log('[WS Loader] Strategy 2: Trying standard require...')
		const path = require('path')

		// Get Obsidian's app path
		const app = (window as any).app
		if (app?.vault?.adapter?.basePath) {
			const vaultPath = app.vault.adapter.basePath
			const wsPath = path.join(vaultPath, '.obsidian', 'plugins', 'teleprompter-plus', 'node_modules', 'ws')

			console.log('[WS Loader] Trying absolute path:', wsPath)
			const ws = require(wsPath)

			if (ws) {
				result.WebSocketServer = ws.WebSocketServer || ws.Server
				result.WebSocket = ws.WebSocket || ws
				result.loaded = true
				console.log('[WS Loader] ✅ Loaded via absolute path')
				return result
			}
		}
	} catch (e) {
		console.log('[WS Loader] Strategy 2 failed:', e.message)
	}

	// Strategy 3: Try using process.cwd() to build path
	try {
		console.log('[WS Loader] Strategy 3: Trying process.cwd()...')
		const path = require('path')
		const process = require('process')

		const cwd = process.cwd()
		console.log('[WS Loader] Current working directory:', cwd)

		// Try various possible paths
		const possiblePaths = [
			path.join(cwd, 'node_modules', 'ws'),
			path.join(cwd, '.obsidian', 'plugins', 'teleprompter-plus', 'node_modules', 'ws'),
		]

		for (const wsPath of possiblePaths) {
			try {
				console.log('[WS Loader] Trying:', wsPath)
				const ws = require(wsPath)

				if (ws) {
					result.WebSocketServer = ws.WebSocketServer || ws.Server
					result.WebSocket = ws.WebSocket || ws
					result.loaded = true
					console.log('[WS Loader] ✅ Loaded from:', wsPath)
					return result
				}
			} catch (e) {
				// Continue to next path
			}
		}
	} catch (e) {
		console.log('[WS Loader] Strategy 3 failed:', e.message)
	}

	// Strategy 4: Try to load from Obsidian's app resources
	try {
		console.log('[WS Loader] Strategy 4: Trying app.asar resources...')
		const path = require('path')
		const process = require('process')

		// Electron apps often have resources in app.asar
		const appPath = process.resourcesPath || ''
		const wsPath = path.join(appPath, 'app.asar', 'node_modules', 'ws')

		console.log('[WS Loader] Trying app.asar path:', wsPath)
		const ws = require(wsPath)

		if (ws) {
			result.WebSocketServer = ws.WebSocketServer || ws.Server
			result.WebSocket = ws.WebSocket || ws
			result.loaded = true
			console.log('[WS Loader] ✅ Loaded from app.asar')
			return result
		}
	} catch (e) {
		console.log('[WS Loader] Strategy 4 failed:', e.message)
	}

	// Strategy 5: Last resort - try just 'ws'
	try {
		console.log('[WS Loader] Strategy 5: Trying simple require("ws")...')
		const ws = require('ws')

		if (ws) {
			result.WebSocketServer = ws.WebSocketServer || ws.Server
			result.WebSocket = ws.WebSocket || ws
			result.loaded = true
			console.log('[WS Loader] ✅ Loaded via simple require')
			return result
		}
	} catch (e) {
		console.log('[WS Loader] Strategy 5 failed:', e.message)
	}

	// All strategies failed
	result.error = 'Could not load ws module using any strategy'
	console.error('[WS Loader] ❌ All loading strategies failed')
	console.error('[WS Loader] WebSocket server will not be available')

	return result
}

/**
 * Get diagnostic information about the environment
 */
export function getDiagnostics(): Record<string, any> {
	const diagnostics: Record<string, any> = {}

	try {
		const process = require('process')
		diagnostics.cwd = process.cwd()
		diagnostics.execPath = process.execPath
		diagnostics.resourcesPath = process.resourcesPath
		diagnostics.platform = process.platform
		diagnostics.arch = process.arch
		diagnostics.versions = process.versions
	} catch (e) {
		diagnostics.processError = e.message
	}

	try {
		const path = require('path')
		const app = (window as any).app

		if (app?.vault?.adapter?.basePath) {
			diagnostics.vaultPath = app.vault.adapter.basePath
			diagnostics.pluginPath = path.join(
				app.vault.adapter.basePath,
				'.obsidian',
				'plugins',
				'teleprompter-plus'
			)
		}
	} catch (e) {
		diagnostics.pathError = e.message
	}

	return diagnostics
}
