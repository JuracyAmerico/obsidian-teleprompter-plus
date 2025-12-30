/**
 * OBS WebSocket Service
 * Handles connection and communication with OBS Studio via WebSocket v5 protocol
 *
 * Requires OBS 28+ with built-in WebSocket server enabled:
 * Tools > WebSocket Server Settings > Enable WebSocket server
 */

import OBSWebSocket from 'obs-websocket-js'
import { Notice } from 'obsidian'
import type { TeleprompterSettings } from './settings'

export type OBSConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface OBSState {
	status: OBSConnectionStatus
	isRecording: boolean
	isStreaming: boolean
	currentScene: string | null
	error: string | null
}

export class OBSService {
	private obs: OBSWebSocket
	private settings: TeleprompterSettings
	private state: OBSState = {
		status: 'disconnected',
		isRecording: false,
		isStreaming: false,
		currentScene: null,
		error: null
	}
	private reconnectTimer: NodeJS.Timeout | null = null
	private statusListeners: Set<(state: OBSState) => void> = new Set()

	constructor(settings: TeleprompterSettings) {
		this.obs = new OBSWebSocket()
		this.settings = settings
		this.setupEventListeners()
	}

	/**
	 * Update settings reference
	 */
	updateSettings(settings: TeleprompterSettings): void {
		this.settings = settings
	}

	/**
	 * Get current OBS state
	 */
	getState(): OBSState {
		return { ...this.state }
	}

	/**
	 * Subscribe to state changes
	 */
	onStateChange(callback: (state: OBSState) => void): () => void {
		this.statusListeners.add(callback)
		return () => this.statusListeners.delete(callback)
	}

	/**
	 * Notify all listeners of state change
	 */
	private notifyStateChange(): void {
		const stateCopy = { ...this.state }
		this.statusListeners.forEach(listener => listener(stateCopy))
	}

	/**
	 * Setup OBS WebSocket event listeners
	 */
	private setupEventListeners(): void {
		// Connection events
		this.obs.on('ConnectionOpened', () => {
			console.log('[OBS] Connection opened')
		})

		this.obs.on('ConnectionClosed', () => {
			console.log('[OBS] Connection closed')
			this.state.status = 'disconnected'
			this.state.isRecording = false
			this.state.isStreaming = false
			this.state.currentScene = null
			this.notifyStateChange()
		})

		this.obs.on('ConnectionError', (err: Error) => {
			console.error('[OBS] Connection error:', err)
			this.state.status = 'error'
			this.state.error = err.message
			this.notifyStateChange()
		})

		// Recording events
		this.obs.on('RecordStateChanged', (event: { outputActive: boolean; outputState: string }) => {
			console.log('[OBS] Record state changed:', event.outputState)
			this.state.isRecording = event.outputActive
			this.notifyStateChange()
		})

		// Streaming events
		this.obs.on('StreamStateChanged', (event: { outputActive: boolean; outputState: string }) => {
			console.log('[OBS] Stream state changed:', event.outputState)
			this.state.isStreaming = event.outputActive
			this.notifyStateChange()
		})

		// Scene change events
		this.obs.on('CurrentProgramSceneChanged', (event: { sceneName: string }) => {
			console.log('[OBS] Scene changed:', event.sceneName)
			this.state.currentScene = event.sceneName
			this.notifyStateChange()
		})
	}

	/**
	 * Connect to OBS WebSocket server
	 */
	async connect(): Promise<boolean> {
		if (!this.settings.obsEnabled) {
			console.log('[OBS] Integration disabled')
			return false
		}

		if (this.state.status === 'connected') {
			console.log('[OBS] Already connected')
			return true
		}

		try {
			this.state.status = 'connecting'
			this.state.error = null
			this.notifyStateChange()

			const url = `ws://${this.settings.obsHost}:${this.settings.obsPort}`
			console.log(`[OBS] Connecting to ${url}...`)

			const { obsWebSocketVersion, negotiatedRpcVersion } = await this.obs.connect(
				url,
				this.settings.obsPassword || undefined
			)

			console.log(`[OBS] Connected to OBS WebSocket v${obsWebSocketVersion} (RPC v${negotiatedRpcVersion})`)
			this.state.status = 'connected'
			this.state.error = null

			// Get initial state
			await this.refreshState()

			this.notifyStateChange()

			if (this.settings.showConnectionNotifications) {
				new Notice('Connected to OBS')
			}

			return true
		} catch (err) {
			const error = err as Error
			console.error('[OBS] Connection failed:', error.message)
			this.state.status = 'error'
			this.state.error = error.message
			this.notifyStateChange()

			if (this.settings.showConnectionNotifications) {
				new Notice(`OBS connection failed: ${error.message}`)
			}

			return false
		}
	}

	/**
	 * Disconnect from OBS
	 */
	async disconnect(): Promise<void> {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}

		try {
			await this.obs.disconnect()
		} catch (err) {
			// Ignore disconnect errors
		}

		this.state.status = 'disconnected'
		this.state.isRecording = false
		this.state.isStreaming = false
		this.state.currentScene = null
		this.state.error = null
		this.notifyStateChange()

		console.log('[OBS] Disconnected')
	}

	/**
	 * Refresh current OBS state
	 */
	private async refreshState(): Promise<void> {
		try {
			// Get recording status
			const recordStatus = await this.obs.call('GetRecordStatus')
			this.state.isRecording = recordStatus.outputActive

			// Get streaming status
			const streamStatus = await this.obs.call('GetStreamStatus')
			this.state.isStreaming = streamStatus.outputActive

			// Get current scene
			const sceneInfo = await this.obs.call('GetCurrentProgramScene')
			this.state.currentScene = sceneInfo.currentProgramSceneName
		} catch (err) {
			console.error('[OBS] Failed to refresh state:', err)
		}
	}

	/**
	 * Start recording
	 */
	async startRecording(): Promise<boolean> {
		if (this.state.status !== 'connected') {
			console.warn('[OBS] Not connected, cannot start recording')
			return false
		}

		if (this.state.isRecording) {
			console.log('[OBS] Already recording')
			return true
		}

		try {
			await this.obs.call('StartRecord')
			console.log('[OBS] Recording started')
			this.state.isRecording = true
			this.notifyStateChange()
			return true
		} catch (err) {
			console.error('[OBS] Failed to start recording:', err)
			return false
		}
	}

	/**
	 * Stop recording
	 */
	async stopRecording(): Promise<boolean> {
		if (this.state.status !== 'connected') {
			console.warn('[OBS] Not connected, cannot stop recording')
			return false
		}

		if (!this.state.isRecording) {
			console.log('[OBS] Not recording')
			return true
		}

		try {
			await this.obs.call('StopRecord')
			console.log('[OBS] Recording stopped')
			this.state.isRecording = false
			this.notifyStateChange()
			return true
		} catch (err) {
			console.error('[OBS] Failed to stop recording:', err)
			return false
		}
	}

	/**
	 * Toggle recording
	 */
	async toggleRecording(): Promise<boolean> {
		if (this.state.status !== 'connected') {
			console.warn('[OBS] Not connected, cannot toggle recording')
			return false
		}

		try {
			await this.obs.call('ToggleRecord')
			console.log('[OBS] Recording toggled')
			// State will be updated by event listener
			return true
		} catch (err) {
			console.error('[OBS] Failed to toggle recording:', err)
			return false
		}
	}

	/**
	 * Start streaming
	 */
	async startStreaming(): Promise<boolean> {
		if (this.state.status !== 'connected') {
			console.warn('[OBS] Not connected, cannot start streaming')
			return false
		}

		if (this.state.isStreaming) {
			console.log('[OBS] Already streaming')
			return true
		}

		try {
			await this.obs.call('StartStream')
			console.log('[OBS] Streaming started')
			this.state.isStreaming = true
			this.notifyStateChange()
			return true
		} catch (err) {
			console.error('[OBS] Failed to start streaming:', err)
			return false
		}
	}

	/**
	 * Stop streaming
	 */
	async stopStreaming(): Promise<boolean> {
		if (this.state.status !== 'connected') {
			console.warn('[OBS] Not connected, cannot stop streaming')
			return false
		}

		if (!this.state.isStreaming) {
			console.log('[OBS] Not streaming')
			return true
		}

		try {
			await this.obs.call('StopStream')
			console.log('[OBS] Streaming stopped')
			this.state.isStreaming = false
			this.notifyStateChange()
			return true
		} catch (err) {
			console.error('[OBS] Failed to stop streaming:', err)
			return false
		}
	}

	/**
	 * Toggle streaming
	 */
	async toggleStreaming(): Promise<boolean> {
		if (this.state.status !== 'connected') {
			console.warn('[OBS] Not connected, cannot toggle streaming')
			return false
		}

		try {
			await this.obs.call('ToggleStream')
			console.log('[OBS] Streaming toggled')
			// State will be updated by event listener
			return true
		} catch (err) {
			console.error('[OBS] Failed to toggle streaming:', err)
			return false
		}
	}

	/**
	 * Get list of scenes
	 */
	async getScenes(): Promise<string[]> {
		if (this.state.status !== 'connected') {
			return []
		}

		try {
			const response = await this.obs.call('GetSceneList')
			return response.scenes.map((scene: { sceneName: string }) => scene.sceneName)
		} catch (err) {
			console.error('[OBS] Failed to get scenes:', err)
			return []
		}
	}

	/**
	 * Switch to a specific scene
	 */
	async setScene(sceneName: string): Promise<boolean> {
		if (this.state.status !== 'connected') {
			console.warn('[OBS] Not connected, cannot switch scene')
			return false
		}

		try {
			await this.obs.call('SetCurrentProgramScene', { sceneName })
			console.log(`[OBS] Switched to scene: ${sceneName}`)
			this.state.currentScene = sceneName
			this.notifyStateChange()
			return true
		} catch (err) {
			console.error('[OBS] Failed to switch scene:', err)
			return false
		}
	}

	/**
	 * Handle teleprompter play event
	 * Starts recording/streaming if sync is enabled
	 */
	async onTeleprompterPlay(): Promise<void> {
		if (this.state.status !== 'connected') return

		if (this.settings.obsSyncRecording && !this.state.isRecording) {
			await this.startRecording()
		}

		if (this.settings.obsSyncStreaming && !this.state.isStreaming) {
			await this.startStreaming()
		}
	}

	/**
	 * Handle teleprompter pause event
	 * Note: We don't stop recording/streaming on pause by default
	 * This is intentional - users can configure this behavior
	 */
	async onTeleprompterPause(): Promise<void> {
		// By default, don't stop recording/streaming on pause
		// This is intentional as pausing the teleprompter doesn't mean
		// the recording should stop
	}

	/**
	 * Handle teleprompter reset event
	 * Stops recording/streaming if sync is enabled
	 */
	async onTeleprompterReset(): Promise<void> {
		if (this.state.status !== 'connected') return

		if (this.settings.obsSyncRecording && this.state.isRecording) {
			await this.stopRecording()
		}

		if (this.settings.obsSyncStreaming && this.state.isStreaming) {
			await this.stopStreaming()
		}
	}

	/**
	 * Check if connected to OBS
	 */
	isConnected(): boolean {
		return this.state.status === 'connected'
	}

	/**
	 * Clean up resources
	 */
	async destroy(): Promise<void> {
		await this.disconnect()
		this.statusListeners.clear()
	}
}
