/**
 * WebSocket Server for Teleprompter Plus
 *
 * This module provides a WebSocket server that enables external devices (like Stream Deck)
 * to control the teleprompter and receive real-time state updates.
 *
 * Architecture:
 * - Runs as part of the Obsidian plugin lifecycle
 * - Bidirectional communication: commands in, state updates out
 * - Supports multiple concurrent clients
 * - Auto-reconnection support
 * - Type-safe message protocol
 */

import type { Plugin } from 'obsidian'
import { loadWebSocketModule, getDiagnostics } from './websocket-loader'

// Load WebSocket module at startup
const wsModule = loadWebSocketModule()
const WebSocketServer = wsModule.WebSocketServer
const WebSocket = wsModule.WebSocket

// Log diagnostics if loading failed
if (!wsModule.loaded) {
	console.error('[TeleprompterWS] WebSocket module failed to load')
	console.error('[TeleprompterWS] Error:', wsModule.error)
	console.error('[TeleprompterWS] Diagnostics:', getDiagnostics())
	console.error('[TeleprompterWS] Plugin will continue without WebSocket support')
}

// ============================================================================
// Protocol Type Definitions
// ============================================================================

/**
 * Commands that can be sent FROM external devices TO the teleprompter
 */
export type TeleprompterCommand =
	| { command: 'toggle-play' }
	| { command: 'play' }
	| { command: 'pause' }
	| { command: 'increase-speed' }
	| { command: 'decrease-speed' }
	| { command: 'set-speed'; speed: number }
	| { command: 'reset-to-top' }
	| { command: 'scroll-up'; amount?: number }
	| { command: 'scroll-down'; amount?: number }
	| { command: 'jump-to-header'; index: number }
	| { command: 'jump-to-header-by-id'; headerId: string }
	| { command: 'next-section' }
	| { command: 'previous-section' }
	| { command: 'toggle-navigation' }
	| { command: 'show-navigation' }
	| { command: 'hide-navigation' }
	| { command: 'increase-font-size' }
	| { command: 'decrease-font-size' }
	| { command: 'set-font-size'; fontSize: number }
	| { command: 'countdown-increase' }
	| { command: 'countdown-decrease' }
	| { command: 'set-countdown'; seconds: number }
	| { command: 'toggle-pin' }
	| { command: 'pin-note' }
	| { command: 'unpin-note' }
	| { command: 'refresh-pinned' }
	| { command: 'toggle-keep-awake' }
	| { command: 'enable-keep-awake' }
	| { command: 'disable-keep-awake' }
	| { command: 'toggle-fullscreen' }
	| { command: 'enable-fullscreen' }
	| { command: 'disable-fullscreen' }
	| { command: 'toggle-eyeline' }
	| { command: 'cycle-speed-preset' }
	| { command: 'next-speed-preset' }
	| { command: 'prev-speed-preset' }
	| { command: 'cycle-alignment' }
	| { command: 'cycle-progress-indicator' }
	| { command: 'broadcast-state' }
	| { command: 'get-state' } // Request current state

/**
 * State updates sent FROM the teleprompter TO external devices
 */
export interface TeleprompterState {
	isPlaying: boolean
	speed: number
	fontSize: number
	scrollPosition: number
	maxScroll: number
	scrollPercentage: number
	currentNote: string | null
	currentNoteTitle: string | null
	headers: Array<{
		id: string
		text: string
		level: number
	}>
	navigationVisible: boolean
	countdownSeconds?: number
	isCountingDown?: boolean
	currentCountdown?: number
	isPinned?: boolean
	pinnedNotePath?: string | null
	isKeepAwake?: boolean
	isFullScreen?: boolean
	eyelineVisible?: boolean
	speedPresets?: number[]
	currentSpeedPresetIndex?: number
	textAlignment?: string
	doubleClickToEdit?: boolean
	autoPauseOnEdit?: boolean
	progressIndicatorStyle?: string
	timestamp: number // When this state was captured
}

/**
 * Messages sent FROM the teleprompter TO external devices
 */
export type TeleprompterMessage =
	| { type: 'state'; data: TeleprompterState }
	| { type: 'error'; message: string; code?: string }
	| { type: 'connected'; serverVersion: string; capabilities: string[] }
	| { type: 'pong'; timestamp: number }

/**
 * Messages sent FROM external devices TO the teleprompter
 */
export type ClientMessage =
	| TeleprompterCommand
	| { type: 'ping'; timestamp: number }
	| { type: 'subscribe'; events: string[] }

// ============================================================================
// WebSocket Server Implementation
// ============================================================================

export interface WebSocketServerConfig {
	port: number
	host?: string
	maxClients?: number
	heartbeatInterval?: number
}

/**
 * WebSocket server for controlling the teleprompter from external devices
 */
export class TeleprompterWebSocketServer {
	private wss: WebSocketServer | null = null
	private clients: Set<WebSocket> = new Set()
	private plugin: Plugin
	private config: Required<WebSocketServerConfig>
	private commandHandlers: Map<string, (params?: any) => void | Promise<void>> = new Map()
	private currentState: TeleprompterState
	private heartbeatInterval: NodeJS.Timeout | null = null
	private isShuttingDown = false

	// Server version for compatibility tracking
	private readonly SERVER_VERSION = '1.0.0'
	private readonly CAPABILITIES = [
		'state-sync',
		'header-navigation',
		'speed-control',
		'scroll-control',
		'font-size-control',
		'countdown-control',
		'pin-control',
		'keep-awake-control',
		'fullscreen-control',
		'eyeline-control',
		'speed-presets',
		'text-alignment',
		'progress-indicator',
	]

	constructor(plugin: Plugin, config: WebSocketServerConfig) {
		this.plugin = plugin
		this.config = {
			port: config.port,
			host: config.host || '127.0.0.1', // Only bind to localhost for security
			maxClients: config.maxClients || 10,
			heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
		}

		// Initialize with default state
		this.currentState = this.getDefaultState()
	}

	/**
	 * Start the WebSocket server
	 */
	async start(): Promise<void> {
		if (this.wss) {
			console.warn('[TeleprompterWS] Server already running')
			return
		}

		return new Promise((resolve, reject) => {
			try {
				this.wss = new WebSocketServer({
					host: this.config.host,
					port: this.config.port,
				})

				this.wss.on('connection', this.handleConnection.bind(this))

				this.wss.on('listening', () => {
					console.log(
						`[TeleprompterWS] Server listening on ${this.config.host}:${this.config.port}`
					)
					this.startHeartbeat()
					resolve()
				})

				this.wss.on('error', (error) => {
					console.error('[TeleprompterWS] Server error:', error)
					// If server hasn't started yet, reject the promise
					if (!this.wss || this.clients.size === 0) {
						reject(error)
					}
				})
			} catch (error) {
				console.error('[TeleprompterWS] Failed to start server:', error)
				reject(error)
			}
		})
	}

	/**
	 * Stop the WebSocket server and cleanup resources
	 */
	async stop(): Promise<void> {
		if (!this.wss) return

		this.isShuttingDown = true

		// Stop heartbeat
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval)
			this.heartbeatInterval = null
		}

		// Close all client connections gracefully
		const closePromises: Promise<void>[] = []
		this.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				closePromises.push(
					new Promise((resolve) => {
						client.once('close', () => resolve())
						client.close(1000, 'Server shutting down')
					})
				)
			}
		})

		// Wait for all clients to close (with timeout)
		await Promise.race([
			Promise.all(closePromises),
			new Promise((resolve) => setTimeout(resolve, 2000)), // 2 second timeout
		])

		this.clients.clear()

		// Close the server
		return new Promise((resolve) => {
			if (this.wss) {
				this.wss.close(() => {
					console.log('[TeleprompterWS] Server stopped')
					this.wss = null
					resolve()
				})
			} else {
				resolve()
			}
		})
	}

	/**
	 * Handle new client connection
	 */
	private handleConnection(ws: WebSocket): void {
		// Check max clients
		if (this.clients.size >= this.config.maxClients) {
			ws.close(1008, 'Server at maximum capacity')
			return
		}

		console.log('[TeleprompterWS] Client connected')
		this.clients.add(ws)

		// Send welcome message with server info
		this.sendToClient(ws, {
			type: 'connected',
			serverVersion: this.SERVER_VERSION,
			capabilities: this.CAPABILITIES,
		})

		// Send current state immediately
		this.sendToClient(ws, {
			type: 'state',
			data: this.currentState,
		})

		// Setup client event handlers
		ws.on('message', (data: Buffer) => this.handleClientMessage(ws, data))
		ws.on('close', () => this.handleClientDisconnect(ws))
		ws.on('error', (error) => this.handleClientError(ws, error))

		// Setup ping/pong for connection health
		ws.on('pong', () => {
			;(ws as any).isAlive = true
		})
	}

	/**
	 * Handle message from client
	 */
	private handleClientMessage(ws: WebSocket, data: Buffer): void {
		try {
			const message: ClientMessage = JSON.parse(data.toString())

			// Handle ping
			if (message.type === 'ping') {
				this.sendToClient(ws, {
					type: 'pong',
					timestamp: Date.now(),
				})
				return
			}

			// Handle subscribe
			if (message.type === 'subscribe') {
				// Future: Handle event subscriptions
				console.log('[TeleprompterWS] Client subscribed to events:', message.events)
				return
			}

			// Handle command
			if ('command' in message) {
				this.handleCommand(message)
				return
			}

			// If we get here, it's an unrecognized message format
			console.warn('[TeleprompterWS] Unrecognized message format:', message)
			this.sendToClient(ws, {
				type: 'error',
				message: 'Unrecognized message format. Expected: {"command": "..."} or {"type": "ping"}',
				code: 'INVALID_MESSAGE',
			})
		} catch (error) {
			console.error('[TeleprompterWS] Invalid message:', error)
			this.sendToClient(ws, {
				type: 'error',
				message: `Invalid JSON or message format. Error: ${error.message}`,
				code: 'PARSE_ERROR',
			})
		}
	}

	/**
	 * Handle client disconnect
	 */
	private handleClientDisconnect(ws: WebSocket): void {
		console.log('[TeleprompterWS] Client disconnected')
		this.clients.delete(ws)
	}

	/**
	 * Handle client error
	 */
	private handleClientError(ws: WebSocket, error: Error): void {
		console.error('[TeleprompterWS] Client error:', error)
		this.clients.delete(ws)
	}

	/**
	 * Handle command from client
	 */
	private async handleCommand(command: TeleprompterCommand): Promise<void> {
		console.log(`[TeleprompterWS] 📥 Received command: ${command.command}`)
		const handler = this.commandHandlers.get(command.command)

		if (handler) {
			try {
				await handler(command)
				console.log(`[TeleprompterWS] ✅ Executed command: ${command.command}`)
			} catch (error) {
				console.error(`[TeleprompterWS] Command handler error for '${command.command}':`, error)
				this.broadcast({
					type: 'error',
					message: `Failed to execute command: ${command.command}`,
					code: 'COMMAND_ERROR',
				})
			}
		} else {
			console.warn(`[TeleprompterWS] Unknown command: ${command.command}`)
			this.broadcast({
				type: 'error',
				message: `Unknown command: ${command.command}`,
				code: 'UNKNOWN_COMMAND',
			})
		}
	}

	/**
	 * Register a command handler
	 */
	registerCommand(
		command: string,
		handler: (params?: any) => void | Promise<void>
	): void {
		this.commandHandlers.set(command, handler)
	}

	/**
	 * Unregister a command handler
	 */
	unregisterCommand(command: string): void {
		this.commandHandlers.delete(command)
	}

	/**
	 * Update the current state and broadcast to all clients
	 */
	updateState(partialState: Partial<TeleprompterState>): void {
		this.currentState = {
			...this.currentState,
			...partialState,
			timestamp: Date.now(),
		}
		this.broadcastState()
	}

	/**
	 * Get the current state
	 */
	getState(): TeleprompterState {
		return { ...this.currentState }
	}

	/**
	 * Broadcast current state to all connected clients
	 */
	private broadcastState(): void {
		if (this.isShuttingDown) return

		this.broadcast({
			type: 'state',
			data: this.currentState,
		})
	}

	/**
	 * Broadcast message to all connected clients
	 */
	broadcast(message: TeleprompterMessage): void {
		if (this.isShuttingDown) return

		const data = JSON.stringify(message)
		const deadClients: WebSocket[] = []

		this.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				try {
					client.send(data)
				} catch (error) {
					console.error('[TeleprompterWS] Error sending to client:', error)
					deadClients.push(client)
				}
			} else {
				deadClients.push(client)
			}
		})

		// Clean up dead connections
		deadClients.forEach((client) => {
			this.clients.delete(client)
		})
	}

	/**
	 * Send message to specific client
	 */
	private sendToClient(ws: WebSocket, message: TeleprompterMessage): void {
		if (ws.readyState === WebSocket.OPEN) {
			try {
				ws.send(JSON.stringify(message))
			} catch (error) {
				console.error('[TeleprompterWS] Error sending to client:', error)
			}
		}
	}

	/**
	 * Start heartbeat to detect dead connections
	 */
	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(() => {
			if (this.isShuttingDown) return

			const deadClients: WebSocket[] = []

			this.clients.forEach((ws) => {
				if ((ws as any).isAlive === false) {
					deadClients.push(ws)
					return
				}

				;(ws as any).isAlive = false
				try {
					ws.ping()
				} catch (error) {
					deadClients.push(ws)
				}
			})

			// Remove dead connections
			deadClients.forEach((ws) => {
				console.log('[TeleprompterWS] Removing dead client')
				this.clients.delete(ws)
				ws.terminate()
			})
		}, this.config.heartbeatInterval)
	}

	/**
	 * Get default state
	 */
	private getDefaultState(): TeleprompterState {
		return {
			isPlaying: false,
			speed: 5,
			fontSize: 24,
			scrollPosition: 0,
			maxScroll: 0,
			scrollPercentage: 0,
			currentNote: null,
			currentNoteTitle: null,
			headers: [],
			navigationVisible: true,
			timestamp: Date.now(),
		}
	}

	/**
	 * Get connection info for debugging
	 */
	getInfo(): {
		running: boolean
		clientCount: number
		port: number
		host: string
	} {
		return {
			running: this.wss !== null && !this.isShuttingDown,
			clientCount: this.clients.size,
			port: this.config.port,
			host: this.config.host,
		}
	}
}
