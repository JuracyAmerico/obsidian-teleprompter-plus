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
import { REMOTE_INTERFACE_HTML } from './remote-interface'

// Declare require for runtime module loading (Obsidian/Electron environment)
declare function require(name: 'http'): typeof import('http')

// HTTP types for type safety
type HttpServer = ReturnType<typeof import('http').createServer>
type IncomingMessage = import('http').IncomingMessage
type ServerResponse = import('http').ServerResponse

// Load WebSocket module at startup
const wsModule = loadWebSocketModule()
const WebSocketServer = wsModule.WebSocketServer
const WebSocket = wsModule.WebSocket

// Extended WebSocket type with ping/pong health check property
interface WebSocketWithHealth {
	isAlive?: boolean
}

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
	| { command: 'start-countdown' }
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
	| { command: 'toggle-focus-mode' }
	| { command: 'enable-focus-mode' }
	| { command: 'disable-focus-mode' }
	| { command: 'cycle-speed-preset' }
	| { command: 'next-speed-preset' }
	| { command: 'prev-speed-preset' }
	| { command: 'cycle-alignment' }
	| { command: 'cycle-progress-indicator' }
	| { command: 'broadcast-state' }
	| { command: 'get-state' } // Request current state
	// Voice tracking commands
	| { command: 'voice-start' }
	| { command: 'voice-stop' }
	| { command: 'voice-toggle' }
	| { command: 'get-voice-status' }

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
	focusMode?: boolean
	eyelineVisible?: boolean
	speedPresets?: number[]
	currentSpeedPresetIndex?: number
	textAlignment?: string
	doubleClickToEdit?: boolean
	autoPauseOnEdit?: boolean
	progressIndicatorStyle?: string
	// Voice tracking state
	voiceTrackingActive?: boolean
	voiceTrackingStatus?: 'off' | 'initializing' | 'listening' | 'error'
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
	authToken?: string // Optional authentication token
	rateLimitPerSecond?: number // Max messages per second per client
}

/**
 * WebSocket server for controlling the teleprompter from external devices
 */
export class TeleprompterWebSocketServer {
	private wss: WebSocketServer | null = null
	private httpServer: HttpServer | null = null
	private clients: Set<WebSocket> = new Set()
	private plugin: Plugin
	private config: Required<WebSocketServerConfig>
	private commandHandlers: Map<string, (params?: Record<string, unknown>) => void | Promise<void>> = new Map()
	private currentState: TeleprompterState
	private heartbeatInterval: NodeJS.Timeout | null = null
	private isShuttingDown = false
	private clientRateLimits: Map<WebSocket, { count: number; resetTime: number }> = new Map()
	private authenticatedClients: Set<WebSocket> = new Set()

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
		'voice-control',
	]

	constructor(plugin: Plugin, config: WebSocketServerConfig) {
		this.plugin = plugin
		this.config = {
			port: config.port,
			host: config.host || '127.0.0.1', // Only bind to localhost for security
			maxClients: config.maxClients || 10,
			heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
			authToken: config.authToken || '', // Empty = no auth required
			rateLimitPerSecond: config.rateLimitPerSecond || 50, // Max 50 messages/second
		}

		// Warn if binding to non-localhost (security risk)
		if (this.config.host !== '127.0.0.1' && this.config.host !== 'localhost') {
			console.warn('[TeleprompterWS] WARNING: Server binding to non-localhost address. ' +
				'Communication is unencrypted. Consider using localhost or a secure proxy.')
		}

		// Initialize with default state
		this.currentState = this.getDefaultState()
	}

	/**
	 * Start the WebSocket server with HTTP support for Remote Interface
	 */
	async start(): Promise<void> {
		if (this.wss) {
			return
		}

		return new Promise((resolve, reject) => {
			try {
				// Load http module at runtime (works in Obsidian's Electron environment)
				const http = require('http')

				// Create HTTP server first to handle both HTTP and WebSocket
				this.httpServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
					this.handleHttpRequest(req, res)
				})

				// Create WebSocket server using HTTP server
				this.wss = new WebSocketServer({
					server: this.httpServer,
				})

				this.wss.on('connection', this.handleConnection.bind(this))

				this.wss.on('error', (error) => {
					console.error('[TeleprompterWS] WebSocket server error:', error)
				})

				// Start listening on HTTP server
				this.httpServer.listen(this.config.port, this.config.host, () => {
					console.debug(`[TeleprompterWS] Server running on http://${this.config.host}:${this.config.port}`)
					this.startHeartbeat()
					resolve()
				})

				this.httpServer.on('error', (error) => {
					console.error('[TeleprompterWS] HTTP server error:', error)
					reject(error)
				})
			} catch (error) {
				console.error('[TeleprompterWS] Failed to start server:', error)
				reject(error)
			}
		})
	}

	/**
	 * Handle HTTP requests for Remote Interface
	 */
	private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
		// CORS headers for cross-origin requests
		res.setHeader('Access-Control-Allow-Origin', '*')
		res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

		// Handle OPTIONS (preflight)
		if (req.method === 'OPTIONS') {
			res.writeHead(204)
			res.end()
			return
		}

		// Only handle GET requests
		if (req.method !== 'GET') {
			res.writeHead(405, { 'Content-Type': 'text/plain' })
			res.end('Method Not Allowed')
			return
		}

		const url = req.url || '/'

		// Serve Remote Interface HTML
		if (url === '/' || url === '/remote' || url === '/remote/') {
			res.writeHead(200, {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-cache',
			})
			res.end(REMOTE_INTERFACE_HTML)
			return
		}

		// Health check endpoint
		if (url === '/health' || url === '/api/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({
				status: 'ok',
				clients: this.clients.size,
				version: this.SERVER_VERSION,
			}))
			return
		}

		// State endpoint (REST fallback)
		if (url === '/api/state') {
			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify(this.currentState))
			return
		}

		// 404 for everything else
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('Not Found')
	}

	/**
	 * Stop the WebSocket server and cleanup resources
	 */
	async stop(): Promise<void> {
		if (!this.wss && !this.httpServer) return

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

		// Close the WebSocket server
		if (this.wss) {
			await new Promise<void>((resolve) => {
				this.wss!.close(() => {
					this.wss = null
					resolve()
				})
			})
		}

		// Close the HTTP server
		if (this.httpServer) {
			await new Promise<void>((resolve) => {
				this.httpServer!.close(() => {
					this.httpServer = null
					resolve()
				})
			})
		}
	}

	// ============================================================================
	// Security Helper Methods
	// ============================================================================

	/**
	 * Check if client is within rate limit
	 */
	private checkRateLimit(ws: WebSocket): boolean {
		const now = Date.now()
		const limit = this.clientRateLimits.get(ws)

		if (!limit || now > limit.resetTime) {
			this.clientRateLimits.set(ws, { count: 1, resetTime: now + 1000 })
			return true
		}

		if (limit.count >= this.config.rateLimitPerSecond) {
			return false
		}

		limit.count++
		return true
	}

	/**
	 * Validate command parameters
	 */
	private validateCommand(command: TeleprompterCommand): { valid: boolean; error?: string } {
		// Validate numeric parameters
		if ('speed' in command && typeof command.speed === 'number') {
			if (command.speed < 0.1 || command.speed > 100) {
				return { valid: false, error: 'Speed must be between 0.1 and 100' }
			}
		}
		if ('fontSize' in command && typeof command.fontSize === 'number') {
			if (command.fontSize < 8 || command.fontSize > 200) {
				return { valid: false, error: 'Font size must be between 8 and 200' }
			}
		}
		if ('seconds' in command && typeof command.seconds === 'number') {
			if (command.seconds < 0 || command.seconds > 3600) {
				return { valid: false, error: 'Countdown must be between 0 and 3600 seconds' }
			}
		}
		if ('amount' in command && typeof command.amount === 'number') {
			if (command.amount < -10000 || command.amount > 10000) {
				return { valid: false, error: 'Scroll amount must be between -10000 and 10000' }
			}
		}
		if ('index' in command && typeof command.index === 'number') {
			if (command.index < 0 || command.index > 1000) {
				return { valid: false, error: 'Index must be between 0 and 1000' }
			}
		}

		// Validate string parameters
		if ('headerId' in command && typeof command.headerId === 'string') {
			if (command.headerId.length > 200) {
				return { valid: false, error: 'Header ID too long (max 200 chars)' }
			}
			// Check for potentially dangerous characters
			if (/[<>'"&\\]/.test(command.headerId)) {
				return { valid: false, error: 'Header ID contains invalid characters' }
			}
		}

		return { valid: true }
	}

	/**
	 * Sanitize string for safe use
	 */
	private sanitizeString(str: string, maxLength: number = 200): string {
		if (typeof str !== 'string') return ''
		return str
			.slice(0, maxLength)
			.replace(/[<>'"&\\]/g, '') // Remove potential XSS/injection chars
			.trim()
	}

	/**
	 * Sanitize error message to avoid leaking internal info
	 */
	private sanitizeErrorMessage(error: Error): string {
		const safeErrors: Record<string, string> = {
			'SyntaxError': 'Invalid JSON format',
			'TypeError': 'Invalid message structure',
			'RangeError': 'Value out of range',
		}
		return safeErrors[error.name] || 'Message processing error'
	}

	// ============================================================================
	// Connection Handling
	// ============================================================================

	/**
	 * Handle new client connection
	 */
	private handleConnection(ws: WebSocket): void {
		// Check max clients
		if (this.clients.size >= this.config.maxClients) {
			ws.close(1008, 'Server at maximum capacity')
			return
		}

		// If auth is required, wait for auth message
		if (this.config.authToken) {
			const authTimeout = setTimeout(() => {
				ws.close(4001, 'Authentication timeout')
			}, 5000)

			ws.once('message', (data: Buffer) => {
				clearTimeout(authTimeout)
				try {
					const msg = JSON.parse(data.toString())
					if (msg.type !== 'auth' || msg.token !== this.config.authToken) {
						ws.close(4002, 'Invalid authentication')
						return
					}
					this.authenticatedClients.add(ws)
					this.completeConnection(ws)
				} catch {
					ws.close(4003, 'Invalid auth message')
				}
			})
			return
		}

		this.completeConnection(ws)
	}

	/**
	 * Complete client connection after optional auth
	 */
	private completeConnection(ws: WebSocket): void {
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
			;(ws as WebSocketWithHealth).isAlive = true
		})
	}

	/**
	 * Handle message from client
	 */
	private handleClientMessage(ws: WebSocket, data: Buffer): void {
		// Check rate limit
		if (!this.checkRateLimit(ws)) {
			this.sendToClient(ws, {
				type: 'error',
				message: `Rate limit exceeded. Max ${this.config.rateLimitPerSecond} messages per second.`,
				code: 'RATE_LIMIT',
			})
			return
		}

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
				return
			}

			// Handle command
			if ('command' in message) {
				this.handleCommand(message, ws)
				return
			}

			// If we get here, it's an unrecognized message format
			this.sendToClient(ws, {
				type: 'error',
				message: 'Unrecognized message format. Expected: {"command": "..."} or {"type": "ping"}',
				code: 'INVALID_MESSAGE',
			})
		} catch (error) {
			this.sendToClient(ws, {
				type: 'error',
				message: this.sanitizeErrorMessage(error as Error),
				code: 'PARSE_ERROR',
			})
		}
	}

	/**
	 * Handle client disconnect
	 */
	private handleClientDisconnect(ws: WebSocket): void {
		this.clients.delete(ws)
		this.clientRateLimits.delete(ws)
		this.authenticatedClients.delete(ws)
	}

	/**
	 * Handle client error
	 */
	private handleClientError(ws: WebSocket, error: Error): void {
		console.error('[TeleprompterWS] Client error:', error.message)
		this.clients.delete(ws)
		this.clientRateLimits.delete(ws)
		this.authenticatedClients.delete(ws)
	}

	/**
	 * Handle command from client
	 */
	private async handleCommand(command: TeleprompterCommand, ws: WebSocket): Promise<void> {
		// Validate command parameters
		const validation = this.validateCommand(command)
		if (!validation.valid) {
			this.sendToClient(ws, {
				type: 'error',
				message: validation.error || 'Invalid command parameters',
				code: 'VALIDATION_ERROR',
			})
			return
		}

		const handler = this.commandHandlers.get(command.command)

		if (handler) {
			try {
				await handler(command)
			} catch (error) {
				console.error(`[TeleprompterWS] Command error '${command.command}':`, (error as Error).message)
				this.sendToClient(ws, {
					type: 'error',
					message: `Failed to execute command: ${command.command}`,
					code: 'COMMAND_ERROR',
				})
			}
		} else {
			this.sendToClient(ws, {
				type: 'error',
				message: `Unknown command: ${this.sanitizeString(command.command, 50)}`,
				code: 'UNKNOWN_COMMAND',
			})
		}
	}

	/**
	 * Register a command handler
	 */
	registerCommand(
		command: string,
		handler: (params?: Record<string, unknown>) => void | Promise<void>
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
				if ((ws as WebSocketWithHealth).isAlive === false) {
					deadClients.push(ws)
					return
				}

				;(ws as WebSocketWithHealth).isAlive = false
				try {
					ws.ping()
				} catch (error) {
					deadClients.push(ws)
				}
			})

			// Remove dead connections
			deadClients.forEach((ws) => {
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
		remoteUrl: string
	} {
		return {
			running: this.wss !== null && !this.isShuttingDown,
			clientCount: this.clients.size,
			port: this.config.port,
			host: this.config.host,
			remoteUrl: `http://${this.config.host}:${this.config.port}/`,
		}
	}

	/**
	 * Get the URL for the Remote Web Interface
	 */
	getRemoteUrl(): string {
		return `http://${this.config.host}:${this.config.port}/`
	}

	/**
	 * Get the local network URL (for phone access on same WiFi)
	 */
	getLocalNetworkUrl(): string | null {
		try {
			const os = require('os')
			const interfaces = os.networkInterfaces()

			for (const name of Object.keys(interfaces)) {
				for (const iface of interfaces[name]) {
					// Skip loopback and non-IPv4
					if (iface.internal || iface.family !== 'IPv4') continue
					// Return first non-internal IPv4 address
					return `http://${iface.address}:${this.config.port}/`
				}
			}
		} catch (e) {
			console.error('[TeleprompterWS] Failed to get local network IP:', e)
		}
		return null
	}
}
