import { Plugin, Notice, addIcon } from 'obsidian'
import { TeleprompterView, VIEW_TYPE_TELEPROMPTER } from './view'
import { TeleprompterWebSocketServer } from './websocket-server'
import { TeleprompterSettingTab, DEFAULT_SETTINGS } from './settings'
import type { TeleprompterSettings } from './settings'
import './styles.css'

export default class TeleprompterPlusPlugin extends Plugin {
	settings: TeleprompterSettings
	private wsServer: TeleprompterWebSocketServer | null = null

	async onload() {
		console.log('Loading Teleprompter Plus plugin')

		// Teleprompter icon - CORRECT FORMAT per Obsidian docs
		// NO <svg> wrapper, coordinates for 100x100 viewBox
		const iconSvg = `<path d="M 15 10 L 85 10 L 75 70 L 25 70 Z" fill="currentColor"></path><rect x="47" y="70" width="6" height="15" fill="currentColor"></rect><rect x="30" y="85" width="40" height="8" fill="currentColor"></rect><line x1="30" y1="35" x2="70" y2="35" stroke="currentColor" stroke-width="3" opacity="0.5"></line>`
		const iconName = 'teleprompter-final'

		// Debug logging to file
		const timestamp = new Date().toISOString()
		const debugInfo = `
=== TELEPROMPTER PLUS ICON DEBUG ===
Timestamp: ${timestamp}
Icon Name: ${iconName}
SVG Length: ${iconSvg.length}
Full SVG:
${iconSvg}
===============================
`
		console.log(`[Teleprompter] Registering custom icon "${iconName}"`)
		console.log('[Teleprompter] Icon SVG length:', iconSvg.length)
		console.log('[Teleprompter] Icon SVG preview:', iconSvg.substring(0, 100) + '...')

		// Write debug info to file
		try {
			const fs = require('fs')
			const path = require('path')
			const logPath = path.join(this.app.vault.adapter.basePath, '.obsidian', 'plugins', 'teleprompter-plus', 'icon-debug.log')
			fs.writeFileSync(logPath, debugInfo)
			console.log('[Teleprompter] Debug info written to:', logPath)
		} catch (error) {
			console.error('[Teleprompter] Failed to write debug log:', error)
		}

		addIcon(iconName, iconSvg)
		console.log(`[Teleprompter] Custom icon "${iconName}" registered successfully`)

		// ===== REGISTER ALL COMMAND ICONS =====
		// Playback controls
		addIcon('tp-play-pause', `<path d="M 30 20 L 30 80 L 70 50 Z" fill="currentColor" opacity="0.7"></path><rect x="55" y="25" width="10" height="50" fill="currentColor"></rect><rect x="70" y="25" width="10" height="50" fill="currentColor"></rect>`)
		addIcon('tp-play', `<path d="M 25 15 L 25 85 L 80 50 Z" fill="currentColor"></path>`)
		addIcon('tp-pause', `<rect x="30" y="20" width="12" height="60" fill="currentColor"></rect><rect x="58" y="20" width="12" height="60" fill="currentColor"></rect>`)
		addIcon('tp-reset-top', `<path d="M 50 70 L 50 25 M 50 25 L 35 40 M 50 25 L 65 40" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"></path><line x1="25" y1="20" x2="75" y2="20" stroke="currentColor" stroke-width="4"></line>`)

		// Speed controls
		addIcon('tp-speed-up', `<path d="M 25 60 L 50 35 L 75 60" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 25 80 L 50 55 L 75 80" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-speed-down', `<path d="M 25 35 L 50 60 L 75 35" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 25 55 L 50 80 L 75 55" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)

		// Font size controls
		addIcon('tp-font-up', `<text x="50" y="65" font-size="50" text-anchor="middle" fill="currentColor" font-weight="bold">A</text><path d="M 75 25 L 85 35 M 85 20 L 85 35 M 85 20 L 95 30" stroke="currentColor" stroke-width="3" fill="none"></path>`)
		addIcon('tp-font-down', `<text x="45" y="60" font-size="35" text-anchor="middle" fill="currentColor">a</text><path d="M 75 35 L 85 25 M 85 35 L 85 20 M 85 35 L 95 25" stroke="currentColor" stroke-width="3" fill="none"></path>`)
		addIcon('tp-font-reset', `<text x="50" y="65" font-size="45" text-anchor="middle" fill="currentColor" font-weight="bold">A</text><path d="M 75 50 A 15 15 0 1 1 75 20" stroke="currentColor" stroke-width="3" fill="none"></path><path d="M 75 20 L 70 25 M 75 20 L 80 25" stroke="currentColor" stroke-width="3" fill="none"></path>`)

		// Navigation controls
		addIcon('tp-next-section', `<path d="M 20 30 L 40 50 L 20 70" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 45 30 L 65 50 L 45 70" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="75" y1="25" x2="75" y2="75" stroke="currentColor" stroke-width="5"></line>`)
		addIcon('tp-prev-section', `<path d="M 80 30 L 60 50 L 80 70" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 55 30 L 35 50 L 55 70" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="25" y1="25" x2="25" y2="75" stroke="currentColor" stroke-width="5"></line>`)
		addIcon('tp-nav-panel', `<rect x="15" y="20" width="30" height="60" fill="currentColor" opacity="0.3"></rect><line x1="55" y1="30" x2="85" y2="30" stroke="currentColor" stroke-width="5"></line><line x1="55" y1="50" x2="85" y2="50" stroke="currentColor" stroke-width="5"></line><line x1="55" y1="70" x2="85" y2="70" stroke="currentColor" stroke-width="5"></line>`)

		// Display controls
		addIcon('tp-eyeline', `<ellipse cx="50" cy="50" rx="25" ry="15" fill="none" stroke="currentColor" stroke-width="4"></ellipse><circle cx="50" cy="50" r="8" fill="currentColor"></circle><line x1="15" y1="50" x2="85" y2="50" stroke="currentColor" stroke-width="3" opacity="0.6"></line>`)
		addIcon('tp-fullscreen', `<path d="M 20 35 L 20 20 L 35 20" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path><path d="M 65 20 L 80 20 L 80 35" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path><path d="M 80 65 L 80 80 L 65 80" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path><path d="M 35 80 L 20 80 L 20 65" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path>`)
		addIcon('tp-minimap', `<rect x="20" y="15" width="60" height="70" fill="none" stroke="currentColor" stroke-width="4" rx="3"></rect><line x1="28" y1="25" x2="72" y2="25" stroke="currentColor" stroke-width="2"></line><line x1="28" y1="35" x2="72" y2="35" stroke="currentColor" stroke-width="2"></line><line x1="28" y1="45" x2="60" y2="45" stroke="currentColor" stroke-width="2"></line><rect x="28" y="55" width="44" height="20" fill="currentColor" opacity="0.3"></rect>`)

		// Document controls
		addIcon('tp-pin', `<circle cx="50" cy="30" r="12" fill="currentColor"></circle><rect x="47" y="40" width="6" height="35" fill="currentColor"></rect><path d="M 35 75 L 50 85 L 65 75" fill="currentColor"></path>`)
		addIcon('tp-refresh', `<path d="M 70 30 A 20 20 0 1 0 70 70" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"></path><path d="M 70 70 L 65 60 M 70 70 L 80 65" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"></path><circle cx="50" cy="50" r="8" fill="currentColor"></circle>`)
		addIcon('tp-keep-awake', `<circle cx="50" cy="50" r="15" fill="currentColor"></circle><line x1="50" y1="15" x2="50" y2="25" stroke="currentColor" stroke-width="4"></line><line x1="50" y1="75" x2="50" y2="85" stroke="currentColor" stroke-width="4"></line><line x1="15" y1="50" x2="25" y2="50" stroke="currentColor" stroke-width="4"></line><line x1="75" y1="50" x2="85" y2="50" stroke="currentColor" stroke-width="4"></line><line x1="25" y1="25" x2="32" y2="32" stroke="currentColor" stroke-width="4"></line><line x1="68" y1="68" x2="75" y2="75" stroke="currentColor" stroke-width="4"></line><line x1="75" y1="25" x2="68" y2="32" stroke="currentColor" stroke-width="4"></line><line x1="32" y1="68" x2="25" y2="75" stroke="currentColor" stroke-width="4"></line>`)

		// Countdown controls
		addIcon('tp-countdown-up', `<circle cx="45" cy="45" r="20" fill="none" stroke="currentColor" stroke-width="4"></circle><line x1="45" y1="45" x2="45" y2="30" stroke="currentColor" stroke-width="3"></line><line x1="45" y1="45" x2="55" y2="50" stroke="currentColor" stroke-width="3"></line><line x1="75" y1="70" x2="85" y2="70" stroke="currentColor" stroke-width="5"></line><line x1="80" y1="65" x2="80" y2="75" stroke="currentColor" stroke-width="5"></line>`)
		addIcon('tp-countdown-down', `<circle cx="45" cy="45" r="20" fill="none" stroke="currentColor" stroke-width="4"></circle><line x1="45" y1="45" x2="45" y2="30" stroke="currentColor" stroke-width="3"></line><line x1="45" y1="45" x2="55" y2="50" stroke="currentColor" stroke-width="3"></line><line x1="75" y1="70" x2="85" y2="70" stroke="currentColor" stroke-width="5"></line>`)

		// Flip/mirror controls
		addIcon('tp-flip-h', `<path d="M 25 30 L 35 30 L 35 70 L 25 70" fill="currentColor"></path><path d="M 75 30 L 65 30 L 65 70 L 75 70" fill="currentColor"></path><line x1="50" y1="20" x2="50" y2="80" stroke="currentColor" stroke-width="3" stroke-dasharray="5,5"></line><path d="M 35 40 L 45 50 L 35 60" fill="currentColor"></path><path d="M 65 40 L 55 50 L 65 60" fill="currentColor"></path>`)
		addIcon('tp-flip-v', `<rect x="30" y="20" width="40" height="10" fill="currentColor"></rect><rect x="30" y="70" width="40" height="10" fill="currentColor"></rect><line x1="20" y1="50" x2="80" y2="50" stroke="currentColor" stroke-width="3" stroke-dasharray="5,5"></line><path d="M 40 30 L 50 40 L 60 30" fill="currentColor"></path><path d="M 40 70 L 50 60 L 60 70" fill="currentColor"></path>`)

		// Sync controls
		addIcon('tp-scroll-sync', `<rect x="15" y="25" width="25" height="50" fill="none" stroke="currentColor" stroke-width="3" rx="2"></rect><rect x="60" y="25" width="25" height="50" fill="none" stroke="currentColor" stroke-width="3" rx="2"></rect><path d="M 42 40 L 58 40 M 54 36 L 58 40 L 54 44" stroke="currentColor" stroke-width="3" fill="none"></path><path d="M 58 60 L 42 60 M 46 56 L 42 60 L 46 64" stroke="currentColor" stroke-width="3" fill="none"></path>`)

		// Info icon
		addIcon('tp-websocket-info', `<circle cx="50" cy="70" r="4" fill="currentColor"></circle><path d="M 35 55 A 20 20 0 0 1 65 55" stroke="currentColor" stroke-width="4" fill="none"></path><path d="M 25 40 A 35 35 0 0 1 75 40" stroke="currentColor" stroke-width="4" fill="none"></path><circle cx="50" cy="20" r="6" fill="currentColor"></circle><line x1="50" y1="26" x2="50" y2="40" stroke="currentColor" stroke-width="4"></line>`)

		// Typography controls
		addIcon('tp-line-height', `<line x1="15" y1="25" x2="85" y2="25" stroke="currentColor" stroke-width="3"></line><line x1="15" y1="50" x2="85" y2="50" stroke="currentColor" stroke-width="3"></line><line x1="15" y1="75" x2="85" y2="75" stroke="currentColor" stroke-width="3"></line><path d="M 10 30 L 10 20 M 10 30 L 10 45 M 10 80 L 10 70 M 10 55 L 10 70" stroke="currentColor" stroke-width="4" opacity="0.6"></path><path d="M 5 20 L 10 15 L 15 20 M 5 80 L 10 85 L 15 80" stroke="currentColor" stroke-width="3" fill="none" opacity="0.6"></path>`)
		addIcon('tp-letter-spacing', `<text x="25" y="65" font-size="45" text-anchor="middle" fill="currentColor" font-weight="bold">A</text><text x="75" y="65" font-size="45" text-anchor="middle" fill="currentColor" font-weight="bold">B</text><path d="M 32 35 L 42 35 M 37 30 L 37 40 M 58 35 L 68 35 M 63 30 L 63 40" stroke="currentColor" stroke-width="3" opacity="0.6"></path>`)
		addIcon('tp-opacity', `<rect x="20" y="20" width="60" height="60" fill="currentColor" opacity="1"></rect><rect x="35" y="35" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" opacity="0.3"></rect>`)
		addIcon('tp-padding', `<rect x="15" y="15" width="70" height="70" fill="none" stroke="currentColor" stroke-width="4"></rect><rect x="35" y="35" width="30" height="30" fill="currentColor" opacity="0.4"></rect><path d="M 25 25 L 35 35 M 75 25 L 65 35 M 75 75 L 65 65 M 25 75 L 35 65" stroke="currentColor" stroke-width="2" opacity="0.6"></path>`)
		addIcon('tp-text-color', `<text x="50" y="65" font-size="55" text-anchor="middle" fill="currentColor" font-weight="bold">A</text><rect x="30" y="75" width="40" height="8" fill="currentColor" opacity="0.8"></rect>`)
		addIcon('tp-bg-color', `<rect x="20" y="20" width="60" height="60" fill="currentColor" opacity="0.3"></rect><circle cx="50" cy="50" r="15" fill="currentColor"></circle>`)
		addIcon('tp-quick-presets', `<rect x="15" y="15" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect><rect x="45" y="15" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect><rect x="75" y="15" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect><rect x="15" y="45" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect><rect x="45" y="45" width="25" height="25" fill="currentColor" opacity="0.6" rx="3"></rect><rect x="75" y="45" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect><rect x="15" y="75" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect><rect x="45" y="75" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect><rect x="75" y="75" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3" rx="3"></rect>`)

		// Color preset icons
		addIcon('tp-color-dark', `<circle cx="50" cy="50" r="35" fill="currentColor" opacity="0.8"></circle><circle cx="65" cy="35" r="8" fill="currentColor" opacity="0.4"></circle>`)
		addIcon('tp-color-light', `<circle cx="50" cy="50" r="35" stroke="currentColor" stroke-width="4" fill="none"></circle><line x1="50" y1="10" x2="50" y2="20" stroke="currentColor" stroke-width="3"></line><line x1="50" y1="80" x2="50" y2="90" stroke="currentColor" stroke-width="3"></line><line x1="10" y1="50" x2="20" y2="50" stroke="currentColor" stroke-width="3"></line><line x1="80" y1="50" x2="90" y2="50" stroke="currentColor" stroke-width="3"></line><line x1="20" y1="20" x2="27" y2="27" stroke="currentColor" stroke-width="3"></line><line x1="73" y1="73" x2="80" y2="80" stroke="currentColor" stroke-width="3"></line><line x1="80" y1="20" x2="73" y2="27" stroke="currentColor" stroke-width="3"></line><line x1="27" y1="73" x2="20" y2="80" stroke="currentColor" stroke-width="3"></line>`)
		addIcon('tp-color-black', `<rect x="15" y="15" width="70" height="70" fill="currentColor"></rect>`)
		addIcon('tp-color-sepia', `<rect x="15" y="15" width="70" height="70" fill="currentColor" opacity="0.6"></rect><path d="M 20 30 Q 35 25 50 30 T 80 30" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"></path>`)
		addIcon('tp-color-green', `<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="4"></rect><path d="M 30 50 L 45 65 L 70 35" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-color-amber', `<circle cx="50" cy="50" r="30" fill="currentColor" opacity="0.7"></circle><path d="M 50 20 L 55 35 L 70 35 L 58 45 L 63 60 L 50 50 L 37 60 L 42 45 L 30 35 L 45 35 Z" fill="currentColor"></path>`)
		addIcon('tp-color-high-contrast', `<rect x="15" y="15" width="35" height="70" fill="currentColor"></rect><rect x="50" y="15" width="35" height="70" fill="none" stroke="currentColor" stroke-width="4"></rect>`)
		addIcon('tp-color-news', `<rect x="15" y="15" width="70" height="70" fill="currentColor" opacity="0.3"></rect><text x="50" y="70" font-size="60" text-anchor="middle" fill="currentColor" font-weight="bold">N</text>`)
		addIcon('tp-color-greenscreen', `<rect x="15" y="15" width="70" height="70" fill="currentColor" opacity="0.4"></rect><circle cx="35" cy="35" r="12" fill="none" stroke="currentColor" stroke-width="3"></circle><circle cx="65" cy="35" r="12" fill="none" stroke="currentColor" stroke-width="3"></circle><path d="M 30 60 Q 50 75 70 60" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"></path>`)

		// Font preset icons
		addIcon('tp-font-system', `<text x="50" y="70" font-size="60" text-anchor="middle" fill="currentColor" font-family="system-ui">A</text>`)
		addIcon('tp-font-sans', `<text x="50" y="70" font-size="60" text-anchor="middle" fill="currentColor" font-family="sans-serif" font-weight="300">A</text>`)
		addIcon('tp-font-serif', `<text x="50" y="70" font-size="60" text-anchor="middle" fill="currentColor" font-family="serif">A</text>`)
		addIcon('tp-font-mono', `<text x="50" y="65" font-size="50" text-anchor="middle" fill="currentColor" font-family="monospace">{}</text>`)
		addIcon('tp-font-readable', `<text x="50" y="70" font-size="55" text-anchor="middle" fill="currentColor" font-family="Verdana">A</text>`)
		addIcon('tp-font-slab', `<text x="50" y="70" font-size="60" text-anchor="middle" fill="currentColor" font-family="serif" font-weight="bold">A</text>`)

		console.log('[Teleprompter] Registered 47 custom icons successfully (44 toolbar + 3 color presets)')

		// Load settings
		await this.loadSettings()

		// Register settings tab
		this.addSettingTab(new TeleprompterSettingTab(this.app, this))

		// Register the teleprompter view
		this.registerView(
			VIEW_TYPE_TELEPROMPTER,
			(leaf) => new TeleprompterView(leaf)
		)

		// Start WebSocket server if enabled
		if (this.settings.autoStartWebSocket) {
			await this.startWebSocketServer()
		}

		// Register WebSocket commands
		this.registerWebSocketCommands()

		// Add ribbon icon to open teleprompter
		this.addRibbonIcon(iconName, 'Open Teleprompter Plus', () => {
			this.activateView()
		})

		// Add command to open teleprompter
		this.addCommand({
			id: 'open-teleprompter',
			name: 'Open Teleprompter Plus',
			callback: () => {
				this.activateView()
			},
		})

		// Add command to show WebSocket info
		this.addCommand({
			id: 'websocket-info',
			name: 'Show WebSocket Server Info',
			callback: () => {
				this.showWebSocketInfo()
			},
		})

		// Add command to increase font size (no default hotkey to avoid conflicts)
		this.addCommand({
			id: 'increase-font-size',
			name: 'Increase Font Size',
			callback: () => {
				this.increaseFontSize()
				new Notice(`Font size: ${this.settings.fontSize}px`)
			},
		})

		// Add command to decrease font size (no default hotkey to avoid conflicts)
		this.addCommand({
			id: 'decrease-font-size',
			name: 'Decrease Font Size',
			callback: () => {
				this.decreaseFontSize()
				new Notice(`Font size: ${this.settings.fontSize}px`)
			},
		})

		// Add command to reset font size
		this.addCommand({
			id: 'reset-font-size',
			name: 'Reset Font Size to Default',
			callback: () => {
				this.settings.fontSize = DEFAULT_SETTINGS.fontSize
				this.saveSettings()
				this.updateFontSize(DEFAULT_SETTINGS.fontSize)
				new Notice(`Font size reset to ${DEFAULT_SETTINGS.fontSize}px`)
			},
		})

		// ===== Playback Control Commands =====
		this.addCommand({
			id: 'toggle-play-pause',
			name: 'Toggle Play/Pause',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-play'))
			},
		})

		this.addCommand({
			id: 'play',
			name: 'Start Playing',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:play'))
			},
		})

		this.addCommand({
			id: 'pause',
			name: 'Pause',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:pause'))
			},
		})

		this.addCommand({
			id: 'reset-to-top',
			name: 'Reset to Top',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:reset-to-top'))
			},
		})

		// ===== Speed Control Commands =====
		this.addCommand({
			id: 'increase-speed',
			name: 'Increase Scroll Speed',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:increase-speed'))
			},
		})

		this.addCommand({
			id: 'decrease-speed',
			name: 'Decrease Scroll Speed',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:decrease-speed'))
			},
		})

		// ===== Navigation Commands =====
		this.addCommand({
			id: 'next-section',
			name: 'Jump to Next Section',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:next-section'))
			},
		})

		this.addCommand({
			id: 'previous-section',
			name: 'Jump to Previous Section',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:previous-section'))
			},
		})

		this.addCommand({
			id: 'toggle-navigation',
			name: 'Toggle Navigation Panel',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-navigation'))
			},
		})

		// ===== Display Commands =====
		this.addCommand({
			id: 'toggle-eyeline',
			name: 'Toggle Eyeline Indicator',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-eyeline'))
			},
		})

		this.addCommand({
			id: 'toggle-fullscreen',
			name: 'Toggle Full-Screen Mode',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-fullscreen'))
			},
		})

		this.addCommand({
			id: 'toggle-minimap',
			name: 'Toggle Minimap',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-minimap'))
			},
		})

		// ===== Pin/Keep Awake Commands =====
		this.addCommand({
			id: 'toggle-pin',
			name: 'Toggle Pin Note',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-pin'))
			},
		})

		this.addCommand({
			id: 'refresh-pinned',
			name: 'Refresh Pinned Note',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:refresh-pinned'))
			},
		})

		this.addCommand({
			id: 'toggle-keep-awake',
			name: 'Toggle Keep Awake',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-keep-awake'))
			},
		})

		// ===== Countdown Commands =====
		this.addCommand({
			id: 'countdown-increase',
			name: 'Increase Countdown Duration',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:countdown-increase'))
			},
		})

		this.addCommand({
			id: 'countdown-decrease',
			name: 'Decrease Countdown Duration',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:countdown-decrease'))
			},
		})

		// ===== Flip Commands =====
		this.addCommand({
			id: 'toggle-flip-horizontal',
			name: 'Toggle Horizontal Flip (Mirror)',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-flip-horizontal'))
			},
		})

		this.addCommand({
			id: 'toggle-flip-vertical',
			name: 'Toggle Vertical Flip',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-flip-vertical'))
			},
		})

		// ===== Scroll Sync Commands =====
		this.addCommand({
			id: 'toggle-scroll-sync',
			name: 'Toggle Scroll Synchronization',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-scroll-sync'))
			},
		})
	}

	async onunload() {
		console.log('Unloading Teleprompter Plus plugin')

		// Stop WebSocket server
		await this.stopWebSocketServer()
	}

	async activateView() {
		const { workspace } = this.app

		let leaf: WorkspaceLeaf | null = null
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TELEPROMPTER)

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0]
		} else {
			// Our view doesn't exist yet, create a new leaf in the right sidebar
			leaf = workspace.getRightLeaf(false)
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_TELEPROMPTER, active: true })
			}
		}

		// Reveal the leaf in case it's in a collapsed sidebar
		if (leaf) {
			workspace.revealLeaf(leaf)
		}
	}

	/**
	 * Start WebSocket server for external control (e.g., Stream Deck)
	 */
	private async startWebSocketServer(): Promise<void> {
		// Don't start if already running
		if (this.wsServer) {
			console.log('[Teleprompter] WebSocket server already running')
			return
		}

		try {
			this.wsServer = new TeleprompterWebSocketServer(this, {
				port: this.settings.wsPort,
				host: this.settings.wsHost,
			})

			await this.wsServer.start()

			console.log(`[Teleprompter] WebSocket server started on ${this.settings.wsHost}:${this.settings.wsPort}`)

			if (this.settings.showConnectionNotifications) {
				new Notice(`Teleprompter: WebSocket server ready on port ${this.settings.wsPort}`)
			}
		} catch (error) {
			console.error('[Teleprompter] Failed to start WebSocket server:', error)

			// Check if it's a port conflict
			if (error instanceof Error && error.message.includes('EADDRINUSE')) {
				new Notice(
					`Teleprompter: Port ${this.settings.wsPort} already in use. WebSocket disabled.`,
					5000
				)
			} else {
				new Notice('Teleprompter: Failed to start WebSocket server', 5000)
			}
		}
	}

	/**
	 * Stop WebSocket server
	 */
	private async stopWebSocketServer(): Promise<void> {
		if (this.wsServer) {
			await this.wsServer.stop()
			this.wsServer = null
			console.log('[Teleprompter] WebSocket server stopped')
		}
	}

	/**
	 * Register commands that can be triggered via WebSocket
	 */
	private registerWebSocketCommands(): void {
		if (!this.wsServer) return

		// Play/Pause commands
		this.wsServer.registerCommand('toggle-play', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-play'))
		})

		this.wsServer.registerCommand('play', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:play'))
		})

		this.wsServer.registerCommand('pause', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:pause'))
		})

		// Speed commands
		this.wsServer.registerCommand('increase-speed', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:increase-speed'))
		})

		this.wsServer.registerCommand('decrease-speed', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:decrease-speed'))
		})

		this.wsServer.registerCommand('set-speed', (cmd: any) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:set-speed', {
					detail: { speed: cmd.speed },
				})
			)
		})

		// Navigation commands
		this.wsServer.registerCommand('reset-to-top', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:reset-to-top'))
		})

		this.wsServer.registerCommand('scroll-up', (cmd: any) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:scroll', {
					detail: { amount: -(cmd.amount || 100) },
				})
			)
		})

		this.wsServer.registerCommand('scroll-down', (cmd: any) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:scroll', {
					detail: { amount: cmd.amount || 100 },
				})
			)
		})

		this.wsServer.registerCommand('jump-to-header', (cmd: any) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:jump-to-header', {
					detail: { index: cmd.index },
				})
			)
		})

		this.wsServer.registerCommand('jump-to-header-by-id', (cmd: any) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:jump-to-header-by-id', {
					detail: { headerId: cmd.headerId },
				})
			)
		})

		this.wsServer.registerCommand('next-section', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:next-section'))
		})

		this.wsServer.registerCommand('previous-section', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:previous-section'))
		})

		// UI commands
		this.wsServer.registerCommand('toggle-navigation', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-navigation'))
		})

		this.wsServer.registerCommand('show-navigation', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:show-navigation'))
		})

		this.wsServer.registerCommand('hide-navigation', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:hide-navigation'))
		})

		// State query
		this.wsServer.registerCommand('get-state', () => {
			// Request the app to broadcast current state
			window.dispatchEvent(new CustomEvent('teleprompter:broadcast-state'))
		})

		// Font size commands
		this.wsServer.registerCommand('increase-font-size', () => {
			this.increaseFontSize()
		})

		this.wsServer.registerCommand('decrease-font-size', () => {
			this.decreaseFontSize()
		})

		// Aliases for font size commands (used by Stream Deck)
		this.wsServer.registerCommand('font-size-up', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-size-up'))
		})

		this.wsServer.registerCommand('font-size-down', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-size-down'))
		})

		this.wsServer.registerCommand('set-font-size', (cmd: any) => {
			if (cmd.fontSize && cmd.fontSize >= this.settings.minFontSize && cmd.fontSize <= this.settings.maxFontSize) {
				this.settings.fontSize = cmd.fontSize
				this.saveSettings()
				this.updateFontSize(cmd.fontSize)
			}
		})

		// Eyeline commands
		this.wsServer.registerCommand('toggle-eyeline', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-eyeline'))
		})

		this.wsServer.registerCommand('show-eyeline', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:show-eyeline'))
		})

		this.wsServer.registerCommand('hide-eyeline', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:hide-eyeline'))
		})

		// Countdown commands
		this.wsServer.registerCommand('countdown-increase', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:countdown-increase'))
		})

		this.wsServer.registerCommand('countdown-decrease', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:countdown-decrease'))
		})

		this.wsServer.registerCommand('set-countdown', (cmd: any) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:set-countdown', {
					detail: { seconds: cmd.seconds },
				})
			)
		})

		// Pin note commands
		this.wsServer.registerCommand('toggle-pin', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-pin'))
		})

		this.wsServer.registerCommand('pin-note', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:pin-note'))
		})

		this.wsServer.registerCommand('unpin-note', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:unpin-note'))
		})

		this.wsServer.registerCommand('refresh-pinned', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:refresh-pinned'))
		})

		// Keep awake commands
		this.wsServer.registerCommand('toggle-keep-awake', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-keep-awake'))
		})

		this.wsServer.registerCommand('enable-keep-awake', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:enable-keep-awake'))
		})

		this.wsServer.registerCommand('disable-keep-awake', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:disable-keep-awake'))
		})

		// Full-screen commands
		this.wsServer.registerCommand('toggle-fullscreen', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-fullscreen'))
		})

		this.wsServer.registerCommand('enable-fullscreen', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:enable-fullscreen'))
		})

		this.wsServer.registerCommand('disable-fullscreen', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:disable-fullscreen'))
		})

		// Line height commands
		this.wsServer.registerCommand('line-height-increase', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:line-height-increase'))
		})

		this.wsServer.registerCommand('line-height-decrease', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:line-height-decrease'))
		})

		// Vertical padding commands
		this.wsServer.registerCommand('padding-vertical-increase', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:padding-vertical-increase'))
		})

		this.wsServer.registerCommand('padding-vertical-decrease', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:padding-vertical-decrease'))
		})

		// Horizontal padding commands
		this.wsServer.registerCommand('padding-horizontal-increase', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:padding-horizontal-increase'))
		})

		this.wsServer.registerCommand('padding-horizontal-decrease', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:padding-horizontal-decrease'))
		})

		// Color preset commands
		this.wsServer.registerCommand('color-preset-dark', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:color-preset-dark'))
		})

		this.wsServer.registerCommand('color-preset-light', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:color-preset-light'))
		})

		this.wsServer.registerCommand('color-preset-black', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:color-preset-black'))
		})

		this.wsServer.registerCommand('color-preset-sepia', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:color-preset-sepia'))
		})

		this.wsServer.registerCommand('color-preset-green', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:color-preset-green'))
		})

		this.wsServer.registerCommand('color-preset-amber', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:color-preset-amber'))
		})

		// Font preset commands
		this.wsServer.registerCommand('font-preset-system', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-preset-system'))
		})

		this.wsServer.registerCommand('font-preset-sans', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-preset-sans'))
		})

		this.wsServer.registerCommand('font-preset-serif', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-preset-serif'))
		})

		this.wsServer.registerCommand('font-preset-mono', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-preset-mono'))
		})

		this.wsServer.registerCommand('font-preset-readable', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-preset-readable'))
		})

		this.wsServer.registerCommand('font-preset-slab', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:font-preset-slab'))
		})

		// Flip control commands
		this.wsServer.registerCommand('toggle-flip-horizontal', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-flip-horizontal'))
		})

		this.wsServer.registerCommand('enable-flip-horizontal', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:enable-flip-horizontal'))
		})

		this.wsServer.registerCommand('disable-flip-horizontal', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:disable-flip-horizontal'))
		})

		this.wsServer.registerCommand('toggle-flip-vertical', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-flip-vertical'))
		})

		this.wsServer.registerCommand('enable-flip-vertical', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:enable-flip-vertical'))
		})

		this.wsServer.registerCommand('disable-flip-vertical', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:disable-flip-vertical'))
		})

		// Scroll synchronization commands
		this.wsServer.registerCommand('toggle-scroll-sync', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-scroll-sync'))
		})

		this.wsServer.registerCommand('enable-scroll-sync', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:enable-scroll-sync'))
		})

		this.wsServer.registerCommand('disable-scroll-sync', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:disable-scroll-sync'))
		})

		// Minimap commands
		this.wsServer.registerCommand('toggle-minimap', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-minimap'))
		})

		this.wsServer.registerCommand('show-minimap', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:show-minimap'))
		})

		this.wsServer.registerCommand('hide-minimap', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:hide-minimap'))
		})
	}

	/**
	 * Show WebSocket server information
	 */
	private showWebSocketInfo(): void {
		if (!this.wsServer) {
			new Notice('WebSocket server is not running')
			return
		}

		const info = this.wsServer.getInfo()
		const message = `WebSocket Server
Status: ${info.running ? '🟢 Running' : '🔴 Stopped'}
Address: ${info.host}:${info.port}
Clients: ${info.clientCount}

Use this address to connect from Stream Deck or other devices.`

		new Notice(message, 8000)
		console.log('[Teleprompter] WebSocket Info:', info)
	}

	/**
	 * Public method to allow views to broadcast state updates
	 */
	broadcastState(state: any): void {
		if (this.wsServer) {
			this.wsServer.updateState(state)
		}
	}

	/**
	 * Get WebSocket server instance (for views)
	 */
	getWebSocketServer(): TeleprompterWebSocketServer | null {
		return this.wsServer
	}

	/**
	 * Get WebSocket server info
	 */
	getWebSocketInfo(): { running: boolean; clientCount: number; port: number; host: string } {
		if (this.wsServer) {
			return this.wsServer.getInfo()
		}
		return {
			running: false,
			clientCount: 0,
			port: this.settings.wsPort,
			host: this.settings.wsHost,
		}
	}

	/**
	 * Restart WebSocket server (for settings changes)
	 */
	async restartWebSocketServer(): Promise<void> {
		console.log('[Teleprompter] Restarting WebSocket server...')
		await this.stopWebSocketServer()
		await this.startWebSocketServer()
		console.log('[Teleprompter] WebSocket server restarted')
	}

	/**
	 * Load settings from disk
	 */
	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	/**
	 * Save settings to disk
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings)
	}

	/**
	 * Apply all settings to active teleprompter views
	 */
	applyAllSettings(): void {
		window.dispatchEvent(
			new CustomEvent('teleprompter:apply-all-settings', {
				detail: {
					fontSize: this.settings.fontSize,
					textColor: this.settings.textColor,
					backgroundColor: this.settings.backgroundColor,
					fontFamily: this.settings.fontFamily,
					lineHeight: this.settings.lineHeight,
					paddingVertical: this.settings.paddingVertical,
					paddingHorizontal: this.settings.paddingHorizontal,
					backgroundOpacity: this.settings.backgroundOpacity,
					enableBackgroundTransparency: this.settings.enableBackgroundTransparency,
				},
			})
		)

		// Also broadcast to WebSocket
		this.broadcastState({
			fontSize: this.settings.fontSize,
			textColor: this.settings.textColor,
			backgroundColor: this.settings.backgroundColor,
		})
	}

	/**
	 * Update font size in all teleprompter views
	 */
	updateFontSize(fontSize: number): void {
		window.dispatchEvent(
			new CustomEvent('teleprompter:set-font-size', {
				detail: { fontSize },
			})
		)

		// Also update WebSocket state
		this.broadcastState({ fontSize })
	}

	/**
	 * Increase font size
	 */
	increaseFontSize(): void {
		const newSize = Math.min(this.settings.fontSize + 2, this.settings.maxFontSize)
		this.settings.fontSize = newSize
		this.saveSettings()
		this.updateFontSize(newSize)
	}

	/**
	 * Decrease font size
	 */
	decreaseFontSize(): void {
		const newSize = Math.max(this.settings.fontSize - 2, this.settings.minFontSize)
		this.settings.fontSize = newSize
		this.saveSettings()
		this.updateFontSize(newSize)
	}
}
