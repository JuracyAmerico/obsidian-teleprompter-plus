import { PluginSettingTab, Setting, setIcon, Notice } from 'obsidian'
import type { App } from 'obsidian'
import type TeleprompterPlusPlugin from './main'
import { ConfirmModal } from './confirm-modal'
import { PromptModal } from './prompt-modal'

// Hotkey action names
export type HotkeyAction =
	| 'togglePlay'
	| 'speedUp'
	| 'speedDown'
	| 'scrollUp'
	| 'scrollDown'
	| 'resetToTop'
	| 'toggleNavigation'
	| 'nextSection'
	| 'prevSection'
	| 'cycleSpeedPreset'
	| 'toggleFullscreen'
	| 'toggleEyeline'
	| 'toggleVoiceTracking'

// Hotkey configuration (key -> action)
export interface HotkeyConfig {
	[key: string]: HotkeyAction
}

// Voice tracking pace presets
export type VoiceTrackingPacePreset = 'conservative' | 'balanced' | 'responsive' | 'custom'

export interface VoiceTrackingPresetConfig {
	confidenceThreshold: number
	maxJumpDistance: number
	minJumpDistance: number
	windowSize: number
	updateFrequencyMs: number
	animationBaseMs: number
	description: string
}

// Preset configurations for different speaking paces
export const VOICE_TRACKING_PRESETS: Record<Exclude<VoiceTrackingPacePreset, 'custom'>, VoiceTrackingPresetConfig> = {
	conservative: {
		confidenceThreshold: 0.25,   // Higher confidence required
		maxJumpDistance: 2,          // Smaller jumps
		minJumpDistance: 1,          // Respond to small matches
		windowSize: 4,               // Smaller look-ahead
		updateFrequencyMs: 600,      // Less frequent updates
		animationBaseMs: 500,        // Slower, smoother animation
		description: 'Best for non-native speakers or careful reading. Follows closely, small smooth movements.'
	},
	balanced: {
		confidenceThreshold: 0.20,   // Balanced confidence
		maxJumpDistance: 3,          // Moderate jumps
		minJumpDistance: 2,          // Balanced responsiveness
		windowSize: 6,               // Moderate look-ahead
		updateFrequencyMs: 500,      // Balanced updates
		animationBaseMs: 400,        // Balanced animation
		description: 'Default setting. Works well for most speakers at normal pace.'
	},
	responsive: {
		confidenceThreshold: 0.15,   // Lower threshold = more responsive
		maxJumpDistance: 5,          // Larger jumps allowed
		minJumpDistance: 2,          // Quick response
		windowSize: 8,               // Larger look-ahead
		updateFrequencyMs: 400,      // More frequent updates
		animationBaseMs: 300,        // Faster animation
		description: 'For experienced speakers or fast pace. More responsive, larger movements.'
	}
}

export interface TeleprompterSettings {
	wsPort: number
	wsHost: string
	autoStartWebSocket: boolean
	showConnectionNotifications: boolean
	// Network Broadcast (multi-device sync)
	networkBroadcastEnabled: boolean
	networkBroadcastInterval: number // ms between broadcasts during playback
	// OBS Integration settings
	obsEnabled: boolean
	obsHost: string
	obsPort: number
	obsPassword: string
	obsAutoConnect: boolean
	obsSyncRecording: boolean // Start/stop OBS recording with teleprompter play/pause
	obsSyncStreaming: boolean // Start/stop OBS streaming with teleprompter play/pause
	fontSize: number
	minFontSize: number
	maxFontSize: number
	lineHeight: number
	paddingVertical: number
	paddingHorizontal: number
	textColor: string
	backgroundColor: string
	fontFamily: string
	flipHorizontal: boolean
	flipVertical: boolean
	scrollSyncEnabled: boolean
	showMinimap: boolean
	keepAwake: boolean
	defaultCountdown: number
	showEyeline: boolean
	eyelinePosition: number
	// Focus mode settings
	focusMode: boolean
	focusModeOpacity: number // 0.1-0.5 opacity for dimmed text
	focusModeRange: number // Lines above/below eyeline to keep bright (1-10)
	autoFullScreen: boolean
	// Advanced playback settings
	defaultScrollSpeed: number
	minScrollSpeed: number
	maxScrollSpeed: number
	speedIncrement: number
	// Advanced UI settings
	defaultNavigationWidth: number
	rememberNavigationState: boolean
	autoStartPlaying: boolean
	// Time estimation settings
	speakingPaceWPM: number // Words per minute (default 150)
	showTimeEstimation: boolean
	showElapsedTime: boolean
	timeDisplayStyle: 'compact' | 'full' // compact = toggle, full = both times
	// Transparency settings
	backgroundOpacity: number // 0-100 (0 = fully transparent, 100 = opaque)
	enableBackgroundTransparency: boolean
	// Custom hotkeys
	customHotkeys: HotkeyConfig
	// Double-click to edit
	doubleClickToEdit: boolean
	// Auto-pause when clicking outside teleprompter (to edit source note)
	autoPauseOnEdit: boolean
	// Developer settings
	debugMode: boolean
	// Voice tracking settings
	voiceTrackingEnabled: boolean
	voiceTrackingLanguage: string
	voiceTrackingShowIndicator: boolean
	voiceTrackingScrollBehavior: 'instant' | 'smooth'
	voiceTrackingPacePreset: VoiceTrackingPacePreset  // Preset for speaking pace
	voiceTrackingConfidenceThreshold: number
	voiceTrackingWindowSize: number          // Look-ahead window size (default: 6)
	// Voice tracking tuning parameters (for adjusting to speaking pace)
	voiceTrackingMaxJumpDistance: number     // Max words to scroll at once (default: 3)
	voiceTrackingMinJumpDistance: number     // Min words before scrolling (default: 2)
	voiceTrackingUpdateFrequencyMs: number   // How often to check matches (default: 500ms)
	voiceTrackingAnimationBaseMs: number     // Base scroll animation time (default: 350ms)
	voiceTrackingAnimationPerWordMs: number  // Extra ms per word jumped (default: 50ms)
	voiceTrackingPauseDetection: boolean     // Enable pause detection (default: true)
	voiceTrackingPauseThresholdMs: number    // Time without speech to pause scrolling (default: 1500ms)
	voiceTrackingScrollPosition: number      // Where current word appears on screen (0-100%, default: 30)
	// NEW: Toolbar configuration
	toolbarLayout: {
		primary: string[]    // Button IDs in order
		secondary: string[]  // Overflow menu items
		hidden: string[]     // Disabled buttons
	}
	// NEW: Profiles
	profiles: {
		active: string       // Active profile ID
		custom: Profile[]    // User-created profiles
	}
	// NEW: UI preferences
	settingsUI: {
		expandedCards: string[]  // Which feature cards are expanded
		recentSettings: string[] // Last 5 changed settings
	}
	// What's New modal
	lastSeenVersion: string
	showReleaseNotes: boolean
}

// Profile interface
export interface Profile {
	id: string
	name: string
	icon: string
	description: string
	settings: Partial<TeleprompterSettings>
	createdAt: number
	isBuiltIn: boolean
}

export const DEFAULT_SETTINGS: TeleprompterSettings = {
	wsPort: 8765,
	wsHost: '127.0.0.1',
	autoStartWebSocket: true,
	showConnectionNotifications: true,
	// Network Broadcast defaults
	networkBroadcastEnabled: false,
	networkBroadcastInterval: 100, // 100ms = 10 updates per second
	// OBS Integration defaults
	obsEnabled: false,
	obsHost: '127.0.0.1',
	obsPort: 4455, // OBS WebSocket v5 default port
	obsPassword: '',
	obsAutoConnect: false,
	obsSyncRecording: false,
	obsSyncStreaming: false,
	fontSize: 24,
	minFontSize: 12,
	maxFontSize: 72,
	lineHeight: 1.8,
	paddingVertical: 20,
	paddingHorizontal: 40,
	textColor: '#e0e0e0',
	backgroundColor: '#1e1e1e',
	fontFamily: 'inherit',
	flipHorizontal: false,
	flipVertical: false,
	scrollSyncEnabled: false,
	showMinimap: false,
	keepAwake: false,
	defaultCountdown: 5,
	showEyeline: true,
	eyelinePosition: 50,
	// Focus mode defaults
	focusMode: false,
	focusModeOpacity: 0.3, // 30% opacity for dimmed text
	focusModeRange: 3, // 3 lines above/below eyeline stay bright
	autoFullScreen: false,
	// Advanced playback settings
	defaultScrollSpeed: 2,
	minScrollSpeed: 0.5,
	maxScrollSpeed: 10,
	speedIncrement: 0.5,
	// Advanced UI settings
	defaultNavigationWidth: 250,
	rememberNavigationState: true,
	autoStartPlaying: false,
	// Time estimation settings
	speakingPaceWPM: 150, // Average speaking pace
	showTimeEstimation: true,
	showElapsedTime: true,
	timeDisplayStyle: 'compact', // compact = toggle between elapsed/remaining, full = show both
	// Transparency settings
	backgroundOpacity: 100, // Fully opaque by default
	enableBackgroundTransparency: false,
	// Custom hotkeys (key -> action mapping)
	customHotkeys: {
		' ': 'togglePlay',           // Space
		'ArrowUp': 'speedUp',
		'ArrowDown': 'speedDown',
		'ArrowLeft': 'scrollUp',
		'ArrowRight': 'scrollDown',
		'Home': 'resetToTop',
		'n': 'toggleNavigation',
		'N': 'toggleNavigation',
		'j': 'nextSection',
		'k': 'prevSection',
		'p': 'cycleSpeedPreset',
		'f': 'toggleFullscreen',
		'e': 'toggleEyeline',
		'v': 'toggleVoiceTracking',
		'V': 'toggleVoiceTracking',
	},
	// Double-click to edit
	doubleClickToEdit: true,
	// Auto-pause when clicking outside teleprompter (to edit source note)
	autoPauseOnEdit: true, // Default: enabled
	// Developer settings
	debugMode: false,
	// Voice tracking settings
	voiceTrackingEnabled: false,
	voiceTrackingLanguage: 'en-US',
	voiceTrackingShowIndicator: true,
	voiceTrackingScrollBehavior: 'smooth',
	voiceTrackingPacePreset: 'balanced',    // Default to balanced preset
	voiceTrackingConfidenceThreshold: 0.20, // From balanced preset
	voiceTrackingWindowSize: 6,             // From balanced preset
	// Voice tracking tuning parameters - use balanced preset defaults
	voiceTrackingMaxJumpDistance: 3,        // From balanced preset
	voiceTrackingMinJumpDistance: 2,        // From balanced preset
	voiceTrackingUpdateFrequencyMs: 500,    // From balanced preset
	voiceTrackingAnimationBaseMs: 400,      // From balanced preset
	voiceTrackingAnimationPerWordMs: 60,    // Extra time for longer jumps
	voiceTrackingPauseDetection: true,      // Pause when user stops speaking
	voiceTrackingPauseThresholdMs: 1200,    // Faster pause detection (1.2 seconds)
	voiceTrackingScrollPosition: 20,        // Current word at 20% from top (more runway below)
	// NEW: Toolbar configuration
	toolbarLayout: {
		primary: ['play-pause', 'speed', 'countdown', 'reset', 'font-size', 'line-height', 'letter-spacing', 'font-family', 'opacity', 'padding', 'text-color', 'bg-color'],
		secondary: ['eyeline', 'focus-mode', 'navigation', 'fullscreen', 'flip-h', 'flip-v', 'minimap', 'auto-pause', 'progress-indicator', 'alignment', 'keep-awake', 'pin', 'detach', 'quick-presets', 'time-display'],
		hidden: []
	},
	// NEW: Profiles
	profiles: {
		active: 'professional',
		custom: []
	},
	// NEW: UI preferences
	settingsUI: {
		expandedCards: ['playback'],  // Start with Playback expanded
		recentSettings: []
	},
	// What's New modal
	lastSeenVersion: '',
	showReleaseNotes: true
}

// Built-in profile presets
const BUILT_IN_PROFILES: Profile[] = [
	{
		id: 'professional',
		name: 'Professional',
		icon: 'monitor',
		description: 'Corporate presentations, clean look',
		settings: {
			fontSize: 24,
			textColor: '#e0e0e0',
			backgroundColor: '#1e1e1e',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			lineHeight: 1.8,
			paddingVertical: 20,
			paddingHorizontal: 40,
			defaultScrollSpeed: 2,
		},
		createdAt: 0,
		isBuiltIn: true
	},
	{
		id: 'broadcast',
		name: 'Broadcast',
		icon: 'radio-tower',
		description: 'News anchor, professional video',
		settings: {
			fontSize: 36,
			textColor: '#ffffff',
			backgroundColor: '#000000',
			fontFamily: 'Verdana, Tahoma, "DejaVu Sans", sans-serif',
			lineHeight: 2.0,
			paddingVertical: 30,
			paddingHorizontal: 60,
			defaultScrollSpeed: 1.5,
		},
		createdAt: 0,
		isBuiltIn: true
	},
	{
		id: 'stream',
		name: 'Stream',
		icon: 'wifi',
		description: 'Twitch/YouTube streaming',
		settings: {
			fontSize: 28,
			textColor: '#ffffff',
			backgroundColor: '#000000',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			lineHeight: 1.7,
			paddingVertical: 20,
			paddingHorizontal: 40,
			defaultScrollSpeed: 2.5,
		},
		createdAt: 0,
		isBuiltIn: true
	},
	{
		id: 'practice',
		name: 'Practice',
		icon: 'timer',
		description: 'Rehearsal, easy on eyes',
		settings: {
			fontSize: 20,
			textColor: '#5c4a2f',
			backgroundColor: '#f4ecd8',
			fontFamily: 'inherit',
			lineHeight: 1.6,
			paddingVertical: 15,
			paddingHorizontal: 30,
			defaultScrollSpeed: 1,
		},
		createdAt: 0,
		isBuiltIn: true
	},
	{
		id: 'accessibility',
		name: 'Accessibility',
		icon: 'accessibility',
		description: 'High contrast, large text',
		settings: {
			fontSize: 40,
			textColor: '#ffffff',
			backgroundColor: '#000000',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			lineHeight: 2.2,
			paddingVertical: 35,
			paddingHorizontal: 70,
			defaultScrollSpeed: 1,
		},
		createdAt: 0,
		isBuiltIn: true
	},
	{
		id: 'cinema',
		name: 'Cinema',
		icon: 'film',
		description: 'Film credits, dramatic reading',
		settings: {
			fontSize: 32,
			textColor: '#ffffff',
			backgroundColor: '#000000',
			fontFamily: 'Georgia, "Times New Roman", Times, serif',
			lineHeight: 1.9,
			paddingVertical: 25,
			paddingHorizontal: 50,
			defaultScrollSpeed: 0.5,
		},
		createdAt: 0,
		isBuiltIn: true
	}
]

// Toolbar control definitions
const TOOLBAR_CONTROLS = [
	// Core playback controls
	{ id: 'play-pause', name: 'Play/Pause', icon: 'tp-play' },
	{ id: 'speed', name: 'Speed controls', icon: 'tp-speed-up' },
	{ id: 'countdown', name: 'Countdown', icon: 'tp-countdown-up' },
	{ id: 'reset', name: 'Reset position', icon: 'tp-reset-top' },
	// Display controls
	{ id: 'font-size', name: 'Font size', icon: 'tp-font-up' },
	{ id: 'line-height', name: 'Line height', icon: 'tp-line-height' },
	{ id: 'letter-spacing', name: 'Letter spacing', icon: 'tp-letter-spacing' },
	{ id: 'font-family', name: 'Font family', icon: 'tp-font-system' },
	{ id: 'opacity', name: 'Opacity', icon: 'tp-opacity' },
	{ id: 'padding', name: 'Padding', icon: 'tp-padding' },
	{ id: 'text-color', name: 'Text color', icon: 'tp-text-color' },
	{ id: 'bg-color', name: 'Background color', icon: 'tp-bg-color' },
	// Feature toggles
	{ id: 'eyeline', name: 'Eyeline', icon: 'tp-eyeline' },
	{ id: 'focus-mode', name: 'Focus mode', icon: 'focus' },
	{ id: 'navigation', name: 'Navigation panel', icon: 'tp-navigation' },
	{ id: 'fullscreen', name: 'Fullscreen', icon: 'tp-fullscreen' },
	{ id: 'flip-h', name: 'Flip horizontal', icon: 'tp-flip-h' },
	{ id: 'flip-v', name: 'Flip vertical', icon: 'tp-flip-v' },
	{ id: 'minimap', name: 'Minimap', icon: 'tp-minimap' },
	// Utility controls
	{ id: 'auto-pause', name: 'Auto-pause on edit', icon: 'tp-auto-pause' },
	{ id: 'progress-indicator', name: 'Progress indicator', icon: 'tp-progress-bar' },
	{ id: 'alignment', name: 'Text alignment', icon: 'tp-align-center' },
	{ id: 'keep-awake', name: 'Keep awake', icon: 'tp-keep-awake' },
	{ id: 'pin', name: 'Pin note', icon: 'tp-pin' },
	{ id: 'detach', name: 'Open in window', icon: 'tp-detach' },
	{ id: 'quick-presets', name: 'Quick presets', icon: 'tp-quick-presets' },
	// Info displays
	{ id: 'time-display', name: 'Time display', icon: 'clock' },
	// Voice tracking
	{ id: 'voice-tracking', name: 'Voice tracking', icon: 'mic' },
]

export class TeleprompterSettingTab extends PluginSettingTab {
	plugin: TeleprompterPlusPlugin
	private statusInterval: ReturnType<typeof setInterval> | null = null
	private obsStatusInterval: ReturnType<typeof setInterval> | null = null
	private activeTab: string = 'dashboard'
	private searchQuery: string = ''

	constructor(app: App, plugin: TeleprompterPlusPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		// Header with search
		const header = containerEl.createDiv('tp-settings-header')
		header.createEl('h2', { text: 'Teleprompter Plus', cls: 'tp-settings-title' })

		// Search box
		const searchContainer = header.createDiv('tp-search-container')
		const searchIcon = searchContainer.createDiv('tp-search-icon')
		setIcon(searchIcon, 'search')
		const searchInput = searchContainer.createEl('input', {
			cls: 'tp-search-input',
			type: 'text',
			placeholder: 'Search settings...'
		})
		searchInput.value = this.searchQuery
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value
			// TODO: Implement search filtering
		})

		// Tab navigation - 7 tabs
		const tabContainer = containerEl.createDiv('tp-tabs')
		const tabs = [
			{ id: 'dashboard', name: 'Dashboard', icon: 'layout-dashboard' },
			{ id: 'toolbar', name: 'Toolbar', icon: 'panel-top' },
			{ id: 'features', name: 'Features', icon: 'sliders-horizontal' },
			{ id: 'profiles', name: 'Profiles', icon: 'user-cog' },
			{ id: 'connection', name: 'Connection', icon: 'wifi' },
			{ id: 'obs', name: 'OBS', icon: 'video' },
			{ id: 'about', name: 'About', icon: 'info' },
		]

		tabs.forEach((tab) => {
			const tabButton = tabContainer.createEl('button', {
				cls: this.activeTab === tab.id ? 'tp-tab active' : 'tp-tab',
			})
			const tabIcon = tabButton.createDiv('tp-tab-icon')
			setIcon(tabIcon, tab.icon)
			tabButton.createSpan({ text: tab.name })
			tabButton.addEventListener('click', () => {
				this.activeTab = tab.id
				this.display()
			})
		})

		// Tab content container
		const contentContainer = containerEl.createDiv('tp-tab-content')

		// Render active tab content
		switch (this.activeTab) {
			case 'dashboard':
				this.displayDashboardTab(contentContainer)
				break
			case 'toolbar':
				this.displayToolbarTab(contentContainer)
				break
			case 'features':
				this.displayFeaturesTab(contentContainer)
				break
			case 'profiles':
				this.displayProfilesTab(contentContainer)
				break
			case 'connection':
				this.displayConnectionTab(contentContainer)
				break
			case 'obs':
				this.displayOBSTab(contentContainer)
				break
			case 'about':
				this.displayAboutTab(contentContainer)
				break
		}
	}

	// ========================================
	// Dashboard Tab - Live preview & quick profiles
	// ========================================
	private displayDashboardTab(containerEl: HTMLElement): void {
		// Live Preview Panel
		const livePreview = containerEl.createDiv('tp-live-preview')

		// Preview frame
		const previewFrame = livePreview.createDiv('tp-preview-frame')
		const previewContent = previewFrame.createDiv('tp-preview-content')
		previewContent.style.backgroundColor = this.plugin.settings.backgroundColor
		previewContent.style.color = this.plugin.settings.textColor
		previewContent.style.fontFamily = this.plugin.settings.fontFamily
		previewContent.style.lineHeight = String(this.plugin.settings.lineHeight)
		previewContent.setText('Sample teleprompter text that shows your current settings in real-time as you make changes...')

		// Eyeline indicator in preview
		if (this.plugin.settings.showEyeline) {
			const eyeline = previewFrame.createDiv('tp-preview-eyeline')
			eyeline.style.top = `${this.plugin.settings.eyelinePosition}%`
		}

		// Preview info
		const previewInfo = livePreview.createDiv('tp-preview-info')
		previewInfo.createDiv({ text: 'Live preview', cls: 'tp-preview-label' })
		previewInfo.createDiv({ text: 'Current settings', cls: 'tp-preview-title' })

		// Quick profiles
		const quickProfiles = previewInfo.createDiv('tp-quick-profiles')
		const allProfiles = [...BUILT_IN_PROFILES, ...this.plugin.settings.profiles.custom]

		allProfiles.slice(0, 4).forEach(profile => {
			const chip = quickProfiles.createEl('button', {
				cls: this.plugin.settings.profiles.active === profile.id ? 'tp-profile-chip active' : 'tp-profile-chip'
			})
			const chipIcon = chip.createDiv('tp-profile-chip-icon')
			setIcon(chipIcon, profile.icon)
			chip.createSpan({ text: profile.name })

			chip.addEventListener('click', async () => {
				// Apply profile settings
				Object.assign(this.plugin.settings, profile.settings)
				this.plugin.settings.profiles.active = profile.id
				await this.plugin.saveSettings()
				this.plugin.applyAllSettings()
				new Notice(`Applied "${profile.name}" profile`)
				this.display()
			})
		})

		// Health Check Grid
		const healthSection = containerEl.createDiv('tp-section-header')
		const healthIcon = healthSection.createDiv('tp-section-header-icon')
		setIcon(healthIcon, 'activity')
		healthSection.createSpan({ text: 'System status', cls: 'tp-section-header-title' })

		const healthGrid = containerEl.createDiv('tp-health-grid')

		// WebSocket status card
		const wsInfo = this.plugin.getWebSocketInfo()
		const wsCard = healthGrid.createDiv('tp-health-card')
		const wsCardIcon = wsCard.createDiv('tp-health-card-icon')
		setIcon(wsCardIcon, wsInfo.running ? 'wifi' : 'wifi-off')
		wsCard.createDiv({ text: wsInfo.running ? 'Connected' : 'Offline', cls: 'tp-health-card-value' })
		wsCard.createDiv({ text: 'WebSocket', cls: 'tp-health-card-label' })

		// Clients card
		const clientsCard = healthGrid.createDiv('tp-health-card')
		const clientsIcon = clientsCard.createDiv('tp-health-card-icon')
		setIcon(clientsIcon, 'users')
		clientsCard.createDiv({ text: String(wsInfo.clientCount), cls: 'tp-health-card-value' })
		clientsCard.createDiv({ text: 'Clients', cls: 'tp-health-card-label' })

		// Speed card
		const speedCard = healthGrid.createDiv('tp-health-card')
		const speedIcon = speedCard.createDiv('tp-health-card-icon')
		setIcon(speedIcon, 'gauge')
		speedCard.createDiv({ text: `${this.plugin.settings.defaultScrollSpeed}x`, cls: 'tp-health-card-value' })
		speedCard.createDiv({ text: 'Default speed', cls: 'tp-health-card-label' })

		// Font size card
		const fontCard = healthGrid.createDiv('tp-health-card')
		const fontIcon = fontCard.createDiv('tp-health-card-icon')
		setIcon(fontIcon, 'type')
		fontCard.createDiv({ text: `${this.plugin.settings.fontSize}px`, cls: 'tp-health-card-value' })
		fontCard.createDiv({ text: 'Font size', cls: 'tp-health-card-label' })

		// Quick Actions Section
		const actionsSection = containerEl.createDiv('tp-section-header')
		const actionsIcon = actionsSection.createDiv('tp-section-header-icon')
		setIcon(actionsIcon, 'zap')
		actionsSection.createSpan({ text: 'Quick actions', cls: 'tp-section-header-title' })

		const actionsContainer = containerEl.createDiv('tp-flex-container')

		// Reset all settings button
		const resetBtn = actionsContainer.createEl('button', { cls: 'tp-btn' })
		const resetBtnIcon = resetBtn.createDiv('tp-btn-icon')
		setIcon(resetBtnIcon, 'rotate-ccw')
		resetBtn.createSpan({ text: 'Reset all' })
		resetBtn.addEventListener('click', () => {
			new ConfirmModal(
				this.app,
				'Reset all settings to defaults?',
				async () => {
					Object.assign(this.plugin.settings, DEFAULT_SETTINGS)
					await this.plugin.saveSettings()
					this.plugin.applyAllSettings()
					new Notice('Settings reset to defaults')
					this.display()
				}
			).open()
		})

		// Export settings button
		const exportBtn = actionsContainer.createEl('button', { cls: 'tp-btn' })
		const exportBtnIcon = exportBtn.createDiv('tp-btn-icon')
		setIcon(exportBtnIcon, 'download')
		exportBtn.createSpan({ text: 'Export' })
		exportBtn.addEventListener('click', () => {
			const settingsJSON = JSON.stringify(this.plugin.settings, null, 2)
			const blob = new Blob([settingsJSON], { type: 'application/json' })
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `teleprompter-settings-${Date.now()}.json`
			a.click()
			URL.revokeObjectURL(url)
			new Notice('Settings exported')
		})

		// Import settings button
		const importBtn = actionsContainer.createEl('button', { cls: 'tp-btn' })
		const importBtnIcon = importBtn.createDiv('tp-btn-icon')
		setIcon(importBtnIcon, 'upload')
		importBtn.createSpan({ text: 'Import' })
		importBtn.addEventListener('click', () => {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = '.json'
			input.onchange = async (e) => {
				const file = (e.target as HTMLInputElement).files?.[0]
				if (!file) return
				const reader = new FileReader()
				reader.onload = async (event) => {
					try {
						const imported = JSON.parse(event.target?.result as string)
						const validKeys = Object.keys(DEFAULT_SETTINGS) as Array<keyof TeleprompterSettings>
						const importedFiltered: Partial<TeleprompterSettings> = {}
						for (const key of validKeys) {
							if (key in imported) {
								(importedFiltered as Record<string, unknown>)[key] = imported[key]
							}
						}
						Object.assign(this.plugin.settings, importedFiltered)
						await this.plugin.saveSettings()
						new Notice('Settings imported')
						this.display()
					} catch {
						new Notice('Failed to import settings')
					}
				}
				reader.readAsText(file)
			}
			input.click()
		})
	}

	// ========================================
	// Toolbar Tab - Configure visible controls
	// ========================================
	private displayToolbarTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Configure which controls appear in the teleprompter toolbar',
			cls: 'setting-item-description',
		})

		// Toolbar preview
		const previewSection = containerEl.createDiv('tp-section-header')
		const previewIcon = previewSection.createDiv('tp-section-header-icon')
		setIcon(previewIcon, 'eye')
		previewSection.createSpan({ text: 'Toolbar preview', cls: 'tp-section-header-title' })

		const toolbarPreview = containerEl.createDiv('tp-toolbar-preview')

		// Build ordered list of enabled controls for the preview
		const enabledControls: typeof TOOLBAR_CONTROLS = []
		const shownIds = new Set<string>()

		// First add controls in primary order
		this.plugin.settings.toolbarLayout.primary.forEach(controlId => {
			if (this.plugin.settings.toolbarLayout.hidden.includes(controlId)) return
			const control = TOOLBAR_CONTROLS.find(c => c.id === controlId)
			if (control && !shownIds.has(controlId)) {
				enabledControls.push(control)
				shownIds.add(controlId)
			}
		})

		// Then add secondary controls
		this.plugin.settings.toolbarLayout.secondary.forEach(controlId => {
			if (this.plugin.settings.toolbarLayout.hidden.includes(controlId)) return
			const control = TOOLBAR_CONTROLS.find(c => c.id === controlId)
			if (control && !shownIds.has(controlId)) {
				enabledControls.push(control)
				shownIds.add(controlId)
			}
		})

		// Finally add any remaining enabled controls
		TOOLBAR_CONTROLS.forEach(control => {
			if (this.plugin.settings.toolbarLayout.hidden.includes(control.id)) return
			if (!shownIds.has(control.id)) {
				enabledControls.push(control)
			}
		})

		// Track drag state
		let draggedId: string | null = null

		// Render draggable preview items
		enabledControls.forEach((control, index) => {
			const item = toolbarPreview.createDiv('tp-toolbar-item')
			item.setAttribute('draggable', 'true')
			item.dataset.controlId = control.id
			item.dataset.index = String(index)

			const itemIcon = item.createDiv('tp-toolbar-item-icon')
			setIcon(itemIcon, control.icon)
			item.title = `${control.name} (drag to reorder)`

			// Drag events
			item.addEventListener('dragstart', (e) => {
				draggedId = control.id
				item.classList.add('dragging')
				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'move'
				}
			})

			item.addEventListener('dragend', () => {
				draggedId = null
				item.classList.remove('dragging')
				toolbarPreview.querySelectorAll('.tp-toolbar-item').forEach(el => {
					el.classList.remove('drag-over')
				})
			})

			item.addEventListener('dragover', (e) => {
				e.preventDefault()
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'move'
				}
				if (draggedId && draggedId !== control.id) {
					item.classList.add('drag-over')
				}
			})

			item.addEventListener('dragleave', () => {
				item.classList.remove('drag-over')
			})

			item.addEventListener('drop', async (e) => {
				e.preventDefault()
				item.classList.remove('drag-over')

				if (!draggedId || draggedId === control.id) return

				// Reorder the controls
				const allEnabled = [...enabledControls.map(c => c.id)]
				const draggedIndex = allEnabled.indexOf(draggedId)
				const dropIndex = allEnabled.indexOf(control.id)

				if (draggedIndex !== -1 && dropIndex !== -1) {
					// Remove from old position
					allEnabled.splice(draggedIndex, 1)
					// Insert at new position
					allEnabled.splice(dropIndex, 0, draggedId)

					// Update settings - all enabled controls go to primary in new order
					this.plugin.settings.toolbarLayout.primary = allEnabled
					this.plugin.settings.toolbarLayout.secondary = []

					await this.plugin.saveSettings()
					// Notify teleprompter view to update toolbar
					activeDocument.dispatchEvent(new CustomEvent('teleprompter:toolbar-changed'))
					this.display()
				}
			})
		})

		// Primary Controls Section
		const primarySection = containerEl.createDiv('tp-section-header')
		const primaryIcon = primarySection.createDiv('tp-section-header-icon')
		setIcon(primaryIcon, 'layout-grid')
		primarySection.createSpan({ text: 'Primary controls', cls: 'tp-section-header-title' })

		containerEl.createEl('p', {
			text: 'Always visible in the main toolbar',
			cls: 'setting-item-description',
		})

		const primaryControls = containerEl.createDiv('tp-toolbar-controls')

		TOOLBAR_CONTROLS.forEach(control => {
			const isPrimary = this.plugin.settings.toolbarLayout.primary.includes(control.id)
			const isHidden = this.plugin.settings.toolbarLayout.hidden.includes(control.id)

			const controlEl = primaryControls.createDiv('tp-toolbar-control')

			const dragHandle = controlEl.createDiv('tp-toolbar-control-drag')
			setIcon(dragHandle, 'grip-vertical')

			const controlIcon = controlEl.createDiv('tp-toolbar-control-icon')
			setIcon(controlIcon, control.icon)

			controlEl.createSpan({ text: control.name, cls: 'tp-toolbar-control-name' })

			// Toggle for visibility
			const toggleContainer = controlEl.createDiv('tp-toolbar-control-toggle')
			const toggle = new Setting(toggleContainer)
				.addToggle(t => t
					.setValue(!isHidden)
					.onChange(async (value) => {
						if (value) {
							// Remove from hidden
							this.plugin.settings.toolbarLayout.hidden =
								this.plugin.settings.toolbarLayout.hidden.filter(id => id !== control.id)
							// Add to primary if not there
							if (!this.plugin.settings.toolbarLayout.primary.includes(control.id)) {
								this.plugin.settings.toolbarLayout.primary.push(control.id)
							}
						} else {
							// Add to hidden
							if (!this.plugin.settings.toolbarLayout.hidden.includes(control.id)) {
								this.plugin.settings.toolbarLayout.hidden.push(control.id)
							}
							// Remove from primary
							this.plugin.settings.toolbarLayout.primary =
								this.plugin.settings.toolbarLayout.primary.filter(id => id !== control.id)
						}
						await this.plugin.saveSettings()
						// Notify teleprompter view to update toolbar
						activeDocument.dispatchEvent(new CustomEvent('teleprompter:toolbar-changed'))
						this.display()
					})
				)
			toggle.settingEl.addClass('tp-setting-no-border')
		})
	}

	// ========================================
	// Features Tab - Collapsible feature cards
	// ========================================
	private displayFeaturesTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Configure all teleprompter features and their settings',
			cls: 'setting-item-description',
		})

		// Playback Feature Group
		this.createFeatureGroup(containerEl, 'playback', 'Playback', 'play', [
			{
				id: 'countdown',
				name: 'Countdown Timer',
				icon: 'timer',
				hasToggle: true,
				toggleValue: this.plugin.settings.defaultCountdown > 0,
				settings: [
					{
						name: 'Default countdown duration',
						desc: 'Seconds before auto-scroll starts (0-30)',
						type: 'slider',
						min: 0, max: 30, step: 1,
						value: this.plugin.settings.defaultCountdown,
						onChange: async (value: number) => {
							this.plugin.settings.defaultCountdown = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Auto-start playback',
						desc: 'Start playing when teleprompter opens',
						type: 'toggle',
						value: this.plugin.settings.autoStartPlaying,
						onChange: async (value: boolean) => {
							this.plugin.settings.autoStartPlaying = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'speed',
				name: 'Speed Control',
				icon: 'gauge',
				hasToggle: false,
				settings: [
					{
						name: 'Default scroll speed',
						desc: 'Initial speed (0.5-10)',
						type: 'slider',
						min: 0.5, max: 10, step: 0.5,
						value: this.plugin.settings.defaultScrollSpeed,
						onChange: async (value: number) => {
							this.plugin.settings.defaultScrollSpeed = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Speed increment',
						desc: 'Amount per +/- press (0.1-2)',
						type: 'slider',
						min: 0.1, max: 2, step: 0.1,
						value: this.plugin.settings.speedIncrement,
						onChange: async (value: number) => {
							this.plugin.settings.speedIncrement = value
							await this.plugin.saveSettings()
						}
					}
				]
			}
		])

		// Display Feature Group
		this.createFeatureGroup(containerEl, 'display', 'Display', 'monitor', [
			{
				id: 'eyeline',
				name: 'Eyeline Indicator',
				icon: 'eye',
				hasToggle: true,
				toggleValue: this.plugin.settings.showEyeline,
				onToggle: async (value: boolean) => {
					this.plugin.settings.showEyeline = value
					await this.plugin.saveSettings()
				},
				settings: [
					{
						name: 'Position',
						desc: 'Vertical position (0-100%)',
						type: 'slider',
						min: 0, max: 100, step: 5,
						value: this.plugin.settings.eyelinePosition,
						onChange: async (value: number) => {
							this.plugin.settings.eyelinePosition = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'focus-mode',
				name: 'Focus Mode',
				icon: 'focus',
				hasToggle: true,
				toggleValue: this.plugin.settings.focusMode,
				onToggle: async (value: boolean) => {
					this.plugin.settings.focusMode = value
					await this.plugin.saveSettings()
				},
				settings: [
					{
						name: 'Dim Opacity',
						desc: 'How much to dim text outside the focus area (0.1-0.5)',
						type: 'slider',
						min: 0.1, max: 0.5, step: 0.05,
						value: this.plugin.settings.focusModeOpacity,
						onChange: async (value: number) => {
							this.plugin.settings.focusModeOpacity = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Focus Range',
						desc: 'Lines above/below eyeline to keep bright (1-10)',
						type: 'slider',
						min: 1, max: 10, step: 1,
						value: this.plugin.settings.focusModeRange,
						onChange: async (value: number) => {
							this.plugin.settings.focusModeRange = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'minimap',
				name: 'Minimap',
				icon: 'map',
				hasToggle: true,
				toggleValue: this.plugin.settings.showMinimap,
				onToggle: async (value: boolean) => {
					this.plugin.settings.showMinimap = value
					await this.plugin.saveSettings()
				},
				settings: []
			},
			{
				id: 'fullscreen',
				name: 'Fullscreen',
				icon: 'maximize',
				hasToggle: true,
				toggleValue: this.plugin.settings.autoFullScreen,
				onToggle: async (value: boolean) => {
					this.plugin.settings.autoFullScreen = value
					await this.plugin.saveSettings()
				},
				settings: []
			},
			{
				id: 'time',
				name: 'Time Display',
				icon: 'clock',
				hasToggle: true,
				toggleValue: this.plugin.settings.showTimeEstimation,
				onToggle: async (value: boolean) => {
					this.plugin.settings.showTimeEstimation = value
					await this.plugin.saveSettings()
				},
				settings: [
					{
						name: 'Show elapsed time',
						desc: 'Display chronometer since playback started',
						type: 'toggle',
						value: this.plugin.settings.showElapsedTime,
						onChange: async (value: boolean) => {
							this.plugin.settings.showElapsedTime = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Display style',
						desc: 'Compact: click to toggle. Full: show both times',
						type: 'dropdown',
						options: [
							{ value: 'compact', label: 'Compact (toggle)' },
							{ value: 'full', label: 'Full (both times)' }
						],
						value: this.plugin.settings.timeDisplayStyle,
						onChange: async (value: string) => {
							this.plugin.settings.timeDisplayStyle = value as 'compact' | 'full'
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Speaking pace (WPM)',
						desc: 'Words per minute for estimation (100-250)',
						type: 'slider',
						min: 100, max: 250, step: 10,
						value: this.plugin.settings.speakingPaceWPM,
						onChange: async (value: number) => {
							this.plugin.settings.speakingPaceWPM = value
							await this.plugin.saveSettings()
						}
					}
				]
			}
		])

		// Typography Feature Group
		this.createFeatureGroup(containerEl, 'typography', 'Typography', 'type', [
			{
				id: 'font-size',
				name: 'Font Size',
				icon: 'text',
				hasToggle: false,
				settings: [
					{
						name: 'Default font size',
						desc: 'Text size in pixels (12-72)',
						type: 'slider',
						min: 12, max: 72, step: 1,
						value: this.plugin.settings.fontSize,
						onChange: async (value: number) => {
							this.plugin.settings.fontSize = value
							await this.plugin.saveSettings()
							this.plugin.updateFontSize(value)
						}
					}
				]
			},
			{
				id: 'line-height',
				name: 'Line Height',
				icon: 'space',
				hasToggle: false,
				settings: [
					{
						name: 'Line spacing',
						desc: 'Space between lines (1.0-3.0x)',
						type: 'slider',
						min: 1.0, max: 3.0, step: 0.1,
						value: this.plugin.settings.lineHeight,
						onChange: async (value: number) => {
							this.plugin.settings.lineHeight = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'font-family',
				name: 'Font Family',
				icon: 'font',
				hasToggle: false,
				settings: [
					{
						name: 'Font',
						desc: 'Choose a font family',
						type: 'dropdown',
						options: [
							{ value: 'inherit', label: 'System Default' },
							{ value: 'Arial, "Helvetica Neue", Helvetica, sans-serif', label: 'Arial' },
							{ value: '"Courier New", Courier, Monaco, "Lucida Console", monospace', label: 'Courier New' },
							{ value: 'Georgia, "Times New Roman", Times, serif', label: 'Georgia' },
							{ value: 'Helvetica, "Helvetica Neue", Arial, sans-serif', label: 'Helvetica' },
							{ value: 'Roboto, "Segoe UI", Arial, sans-serif', label: 'Roboto' },
							{ value: 'Tahoma, "Segoe UI", Geneva, sans-serif', label: 'Tahoma' },
							{ value: '"Times New Roman", Times, Georgia, serif', label: 'Times New Roman' },
							{ value: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif', label: 'Trebuchet MS' },
							{ value: 'Verdana, Geneva, Tahoma, sans-serif', label: 'Verdana' }
						],
						value: this.plugin.settings.fontFamily,
						onChange: async (value: string) => {
							this.plugin.settings.fontFamily = value
							await this.plugin.saveSettings()
						}
					}
				]
			}
		])

		// Colors Feature Group
		this.createFeatureGroup(containerEl, 'colors', 'Colors & Opacity', 'palette', [
			{
				id: 'colors',
				name: 'Color Scheme',
				icon: 'droplet',
				hasToggle: false,
				settings: [
					{
						name: 'Text color',
						desc: 'Color for body text',
						type: 'color',
						value: this.plugin.settings.textColor,
						onChange: async (value: string) => {
							this.plugin.settings.textColor = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Background color',
						desc: 'Background color for content',
						type: 'color',
						value: this.plugin.settings.backgroundColor,
						onChange: async (value: string) => {
							this.plugin.settings.backgroundColor = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'transparency',
				name: 'Transparency',
				icon: 'layers',
				hasToggle: true,
				toggleValue: this.plugin.settings.enableBackgroundTransparency,
				onToggle: async (value: boolean) => {
					this.plugin.settings.enableBackgroundTransparency = value
					await this.plugin.saveSettings()
					this.plugin.applyAllSettings()
				},
				settings: [
					{
						name: 'Background opacity',
						desc: 'Opacity level (0-100%)',
						type: 'slider',
						min: 0, max: 100, step: 5,
						value: this.plugin.settings.backgroundOpacity,
						onChange: async (value: number) => {
							this.plugin.settings.backgroundOpacity = value
							await this.plugin.saveSettings()
							this.plugin.applyAllSettings()
						}
					}
				]
			}
		])

		// Layout Feature Group
		this.createFeatureGroup(containerEl, 'layout', 'Layout', 'layout', [
			{
				id: 'padding',
				name: 'Padding',
				icon: 'square',
				hasToggle: false,
				settings: [
					{
						name: 'Vertical padding',
						desc: 'Space above/below content (0-100px)',
						type: 'slider',
						min: 0, max: 100, step: 5,
						value: this.plugin.settings.paddingVertical,
						onChange: async (value: number) => {
							this.plugin.settings.paddingVertical = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Horizontal padding',
						desc: 'Space on left/right sides (0-200px)',
						type: 'slider',
						min: 0, max: 200, step: 10,
						value: this.plugin.settings.paddingHorizontal,
						onChange: async (value: number) => {
							this.plugin.settings.paddingHorizontal = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'flip',
				name: 'Mirror/Flip',
				icon: 'flip-horizontal',
				hasToggle: false,
				settings: [
					{
						name: 'Horizontal flip',
						desc: 'Mirror text left-to-right',
						type: 'toggle',
						value: this.plugin.settings.flipHorizontal,
						onChange: async (value: boolean) => {
							this.plugin.settings.flipHorizontal = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Vertical flip',
						desc: 'Flip text upside-down',
						type: 'toggle',
						value: this.plugin.settings.flipVertical,
						onChange: async (value: boolean) => {
							this.plugin.settings.flipVertical = value
							await this.plugin.saveSettings()
						}
					}
				]
			}
		])

		// Advanced Feature Group
		this.createFeatureGroup(containerEl, 'advanced', 'Advanced', 'settings', [
			{
				id: 'keep-awake',
				name: 'Keep Awake',
				icon: 'sun',
				hasToggle: true,
				toggleValue: this.plugin.settings.keepAwake,
				onToggle: async (value: boolean) => {
					this.plugin.settings.keepAwake = value
					await this.plugin.saveSettings()
				},
				settings: []
			},
			{
				id: 'double-click',
				name: 'Double-Click to Edit',
				icon: 'mouse-pointer-click',
				hasToggle: true,
				toggleValue: this.plugin.settings.doubleClickToEdit,
				onToggle: async (value: boolean) => {
					this.plugin.settings.doubleClickToEdit = value
					await this.plugin.saveSettings()
				},
				settings: []
			},
			{
				id: 'auto-pause',
				name: 'Auto-Pause on Edit',
				icon: 'pause-circle',
				hasToggle: true,
				toggleValue: this.plugin.settings.autoPauseOnEdit,
				onToggle: async (value: boolean) => {
					this.plugin.settings.autoPauseOnEdit = value
					await this.plugin.saveSettings()
					// Dispatch event to notify teleprompter component
					document.dispatchEvent(new CustomEvent('teleprompter:auto-pause-changed', { detail: { enabled: value } }))
				},
				settings: []
			},
			{
				id: 'scroll-sync',
				name: 'Scroll Sync',
				icon: 'link',
				hasToggle: true,
				toggleValue: this.plugin.settings.scrollSyncEnabled,
				onToggle: async (value: boolean) => {
					this.plugin.settings.scrollSyncEnabled = value
					await this.plugin.saveSettings()
				},
				settings: []
			},
			{
				id: 'debug',
				name: 'Debug Mode',
				icon: 'bug',
				hasToggle: true,
				toggleValue: this.plugin.settings.debugMode,
				onToggle: async (value: boolean) => {
					this.plugin.settings.debugMode = value
					await this.plugin.saveSettings()
				},
				settings: []
			}
		])

		// Voice Tracking Feature Group
		this.createFeatureGroup(containerEl, 'voice', 'Voice Tracking', 'mic', [
			{
				id: 'voice-tracking',
				name: 'Voice-Activated Scrolling',
				icon: 'mic',
				hasToggle: true,
				toggleValue: this.plugin.settings.voiceTrackingEnabled,
				onToggle: async (value: boolean) => {
					this.plugin.settings.voiceTrackingEnabled = value
					await this.plugin.saveSettings()
				},
				settings: [
					{
						name: 'Language',
						desc: 'Speech recognition language',
						type: 'dropdown',
						options: [
							{ value: 'en-US', label: 'English (US)' }
						],
						value: this.plugin.settings.voiceTrackingLanguage,
						onChange: async (value: string) => {
							this.plugin.settings.voiceTrackingLanguage = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Scroll behavior',
						desc: 'How the teleprompter scrolls to match speech',
						type: 'dropdown',
						options: [
							{ value: 'smooth', label: 'Smooth' },
							{ value: 'instant', label: 'Instant' }
						],
						value: this.plugin.settings.voiceTrackingScrollBehavior,
						onChange: async (value: string) => {
							this.plugin.settings.voiceTrackingScrollBehavior = value as 'smooth' | 'instant'
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Confidence threshold',
						desc: 'Minimum match confidence (0.3-0.9)',
						type: 'slider',
						min: 0.3, max: 0.9, step: 0.1,
						value: this.plugin.settings.voiceTrackingConfidenceThreshold,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingConfidenceThreshold = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Show status indicator',
						desc: 'Display recognized text overlay',
						type: 'toggle',
						value: this.plugin.settings.voiceTrackingShowIndicator,
						onChange: async (value: boolean) => {
							this.plugin.settings.voiceTrackingShowIndicator = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'voice-tuning',
				name: 'Scroll Tuning',
				icon: 'sliders-horizontal',
				hasToggle: false,
				settings: [
					{
						name: 'Max jump distance',
						desc: 'Maximum words to scroll at once (smaller = smoother, 2-30)',
						type: 'slider',
						min: 2, max: 30, step: 1,
						value: this.plugin.settings.voiceTrackingMaxJumpDistance,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingMaxJumpDistance = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Min jump distance',
						desc: 'Minimum words before scrolling (smaller = more frequent, 1-10)',
						type: 'slider',
						min: 1, max: 10, step: 1,
						value: this.plugin.settings.voiceTrackingMinJumpDistance,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingMinJumpDistance = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Update frequency',
						desc: 'How often to match speech (lower = more responsive, 100-1000ms)',
						type: 'slider',
						min: 100, max: 1000, step: 50,
						value: this.plugin.settings.voiceTrackingUpdateFrequencyMs,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingUpdateFrequencyMs = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Animation base time',
						desc: 'Base scroll animation duration (higher = smoother, 100-1500ms)',
						type: 'slider',
						min: 100, max: 1500, step: 50,
						value: this.plugin.settings.voiceTrackingAnimationBaseMs,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingAnimationBaseMs = value
							await this.plugin.saveSettings()
						}
					},
					{
						name: 'Animation per word',
						desc: 'Extra time per word jumped (higher = smoother for big jumps, 10-200ms)',
						type: 'slider',
						min: 10, max: 200, step: 10,
						value: this.plugin.settings.voiceTrackingAnimationPerWordMs,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingAnimationPerWordMs = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'voice-pause',
				name: 'Pause Detection',
				icon: 'pause-circle',
				hasToggle: true,
				toggleValue: this.plugin.settings.voiceTrackingPauseDetection,
				onToggle: async (value: boolean) => {
					this.plugin.settings.voiceTrackingPauseDetection = value
					await this.plugin.saveSettings()
				},
				settings: [
					{
						name: 'Pause threshold',
						desc: 'Time without speech before pausing scroll (500-3000ms)',
						type: 'slider',
						min: 500, max: 3000, step: 100,
						value: this.plugin.settings.voiceTrackingPauseThresholdMs,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingPauseThresholdMs = value
							await this.plugin.saveSettings()
						}
					}
				]
			},
			{
				id: 'voice-scroll-position',
				name: 'Scroll Position',
				icon: 'move-vertical',
				hasToggle: false,
				settings: [
					{
						name: 'Current word position',
						desc: 'Where current word appears on screen (10% = near top with more text below, 50% = middle)',
						type: 'slider',
						min: 10, max: 60, step: 5,
						value: this.plugin.settings.voiceTrackingScrollPosition,
						onChange: async (value: number) => {
							this.plugin.settings.voiceTrackingScrollPosition = value
							await this.plugin.saveSettings()
						}
					}
				]
			}
		])
	}

	// Helper to create feature groups with collapsible cards
	private createFeatureGroup(
		containerEl: HTMLElement,
		groupId: string,
		title: string,
		icon: string,
		features: Array<{
			id: string
			name: string
			icon: string
			hasToggle: boolean
			toggleValue?: boolean
			onToggle?: (value: boolean) => void
			settings: Array<{
				name: string
				desc: string
				type: 'slider' | 'toggle' | 'text' | 'color' | 'dropdown'
				min?: number
				max?: number
				step?: number
				value: string | number | boolean
				options?: Array<{ value: string; label: string }>
				onChange: (value: string | number | boolean) => void
			}>
		}>
	): void {
		const isExpanded = this.plugin.settings.settingsUI.expandedCards.includes(groupId)

		const group = containerEl.createDiv(`tp-feature-group ${isExpanded ? '' : 'collapsed'}`)

		// Group header
		const groupHeader = group.createDiv('tp-feature-group-header')
		const chevron = groupHeader.createDiv('tp-feature-group-chevron')
		setIcon(chevron, 'chevron-down')
		groupHeader.createSpan({ text: title, cls: 'tp-feature-group-title' })

		groupHeader.addEventListener('click', async () => {
			if (isExpanded) {
				this.plugin.settings.settingsUI.expandedCards =
					this.plugin.settings.settingsUI.expandedCards.filter(id => id !== groupId)
			} else {
				this.plugin.settings.settingsUI.expandedCards.push(groupId)
			}
			await this.plugin.saveSettings()
			this.display()
		})

		// Group content
		const groupContent = group.createDiv('tp-feature-group-content')

		features.forEach(feature => {
			const card = groupContent.createDiv('tp-feature-card')

			// Card header
			const cardHeader = card.createDiv('tp-feature-card-header')
			const cardLeft = cardHeader.createDiv('tp-feature-card-left')
			const cardIcon = cardLeft.createDiv('tp-feature-card-icon')
			setIcon(cardIcon, feature.icon)
			cardLeft.createSpan({ text: feature.name, cls: 'tp-feature-card-name' })

			// Master toggle if applicable
			if (feature.hasToggle) {
				const toggleContainer = cardHeader.createDiv('tp-feature-card-toggle')
				const toggleSetting = new Setting(toggleContainer)
					.addToggle(t => t
						.setValue(feature.toggleValue ?? false)
						.onChange(async (value) => {
							if (feature.onToggle) {
								feature.onToggle(value)
							}
						})
					)
				toggleSetting.settingEl.addClass('tp-setting-no-border')
			}

			// Card content (sub-settings)
			if (feature.settings.length > 0) {
				const cardContent = card.createDiv('tp-feature-card-content')

				// Click header to expand
				cardHeader.addEventListener('click', (e) => {
					if (!(e.target as HTMLElement).closest('.checkbox-container')) {
						card.classList.toggle('expanded')
					}
				})

				feature.settings.forEach(setting => {
					const settingEl = cardContent.createDiv('tp-feature-setting')
					const settingInfo = settingEl.createDiv('tp-feature-setting-info')
					settingInfo.createDiv({ text: setting.name, cls: 'tp-feature-setting-name' })
					settingInfo.createDiv({ text: setting.desc, cls: 'tp-feature-setting-desc' })

					const settingControl = settingEl.createDiv('tp-feature-setting-control')

					switch (setting.type) {
						case 'slider':
							// Create value display element
							const valueDisplay = settingControl.createSpan({
								text: String(setting.value),
								cls: 'tp-slider-value tp-value-display'
							})

							// Add unit suffix for specific settings
							const unit = setting.name.includes('time') || setting.name.includes('frequency') ? 'ms' : ''
							valueDisplay.textContent = setting.value + unit

							new Setting(settingControl)
								.addSlider(s => s
									.setLimits(setting.min!, setting.max!, setting.step!)
									.setValue(setting.value as number)
									.setDynamicTooltip()
									.onChange((value) => {
										valueDisplay.textContent = value + unit
										setting.onChange(value)
									})
								)
								.settingEl.addClass('tp-setting-no-border')
							break
						case 'toggle':
							new Setting(settingControl)
								.addToggle(t => t
									.setValue(setting.value as boolean)
									.onChange(setting.onChange)
								)
								.settingEl.addClass('tp-setting-no-border')
							break
						case 'color':
							const colorInput = settingControl.createEl('input', {
								type: 'color',
								value: setting.value as string,
								cls: 'tp-color-input'
							})
							colorInput.addEventListener('input', (e) => {
								setting.onChange((e.target as HTMLInputElement).value)
							})
							break
						case 'dropdown':
							new Setting(settingControl)
								.addDropdown(d => {
									setting.options?.forEach(opt => {
										d.addOption(opt.value, opt.label)
									})
									d.setValue(setting.value as string)
									d.onChange(setting.onChange)
								})
								.settingEl.addClass('tp-setting-no-border')
							break
					}
				})
			}
		})
	}

	// ========================================
	// Profiles Tab - Save/load configurations
	// ========================================
	private displayProfilesTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Save and manage complete configuration profiles',
			cls: 'setting-item-description',
		})

		// Built-in profiles section
		const builtInSection = containerEl.createDiv('tp-section-header')
		const builtInIcon = builtInSection.createDiv('tp-section-header-icon')
		setIcon(builtInIcon, 'bookmark')
		builtInSection.createSpan({ text: 'Built-in Profiles', cls: 'tp-section-header-title' })

		const builtInList = containerEl.createDiv('tp-profiles-list')

		BUILT_IN_PROFILES.forEach(profile => {
			const isActive = this.plugin.settings.profiles.active === profile.id
			const profileEl = builtInList.createDiv(`tp-profile-item ${isActive ? 'active' : ''}`)

			const profileIcon = profileEl.createDiv('tp-profile-icon')
			setIcon(profileIcon, profile.icon)

			const profileInfo = profileEl.createDiv('tp-profile-info')
			profileInfo.createDiv({ text: profile.name, cls: 'tp-profile-name' })
			profileInfo.createDiv({ text: profile.description, cls: 'tp-profile-desc' })

			if (isActive) {
				profileEl.createDiv({ text: 'ACTIVE', cls: 'tp-profile-badge' })
			}

			const actions = profileEl.createDiv('tp-profile-actions')
			const applyBtn = actions.createEl('button', { cls: 'tp-profile-action' })
			setIcon(applyBtn, 'check')
			applyBtn.title = 'Apply profile'
			applyBtn.addEventListener('click', async () => {
				Object.assign(this.plugin.settings, profile.settings)
				this.plugin.settings.profiles.active = profile.id
				await this.plugin.saveSettings()
				this.plugin.applyAllSettings()
				new Notice(`Applied "${profile.name}" profile`)
				this.display()
			})
		})

		// Custom profiles section
		const customSection = containerEl.createDiv('tp-section-header')
		const customIcon = customSection.createDiv('tp-section-header-icon')
		setIcon(customIcon, 'folder')
		customSection.createSpan({ text: 'Custom profiles', cls: 'tp-section-header-title' })

		const customList = containerEl.createDiv('tp-profiles-list')

		if (this.plugin.settings.profiles.custom.length === 0) {
			const emptyState = customList.createDiv('tp-empty-state')
			const emptyIcon = emptyState.createDiv('tp-empty-state-icon')
			setIcon(emptyIcon, 'folder-plus')
			emptyState.createDiv({ text: 'No custom profiles yet', cls: 'tp-empty-state-title' })
			emptyState.createDiv({ text: 'Save your current settings as a profile', cls: 'tp-empty-state-desc' })
		} else {
			this.plugin.settings.profiles.custom.forEach(profile => {
				const isActive = this.plugin.settings.profiles.active === profile.id
				const profileEl = customList.createDiv(`tp-profile-item ${isActive ? 'active' : ''}`)

				const profileIcon = profileEl.createDiv('tp-profile-icon')
				setIcon(profileIcon, profile.icon)

				const profileInfo = profileEl.createDiv('tp-profile-info')
				profileInfo.createDiv({ text: profile.name, cls: 'tp-profile-name' })
				profileInfo.createDiv({ text: profile.description || 'Custom profile', cls: 'tp-profile-desc' })

				if (isActive) {
					profileEl.createDiv({ text: 'ACTIVE', cls: 'tp-profile-badge' })
				}

				const actions = profileEl.createDiv('tp-profile-actions')

				// Apply button
				const applyBtn = actions.createEl('button', { cls: 'tp-profile-action' })
				setIcon(applyBtn, 'check')
				applyBtn.title = 'Apply profile'
				applyBtn.addEventListener('click', async () => {
					Object.assign(this.plugin.settings, profile.settings)
					this.plugin.settings.profiles.active = profile.id
					await this.plugin.saveSettings()
					this.plugin.applyAllSettings()
					new Notice(`Applied "${profile.name}" profile`)
					this.display()
				})

				// Delete button
				const deleteBtn = actions.createEl('button', { cls: 'tp-profile-action danger' })
				setIcon(deleteBtn, 'trash-2')
				deleteBtn.title = 'Delete profile'
				deleteBtn.addEventListener('click', () => {
					new ConfirmModal(
						this.app,
						`Delete profile "${profile.name}"?`,
						async () => {
							this.plugin.settings.profiles.custom =
								this.plugin.settings.profiles.custom.filter(p => p.id !== profile.id)
							if (this.plugin.settings.profiles.active === profile.id) {
								this.plugin.settings.profiles.active = 'professional'
							}
							await this.plugin.saveSettings()
							new Notice('Profile deleted')
							this.display()
						}
					).open()
				})
			})
		}

		// Actions
		const actionsContainer = containerEl.createDiv('tp-flex-container tp-flex-container--mt')

		// Save current as new profile
		const saveBtn = actionsContainer.createEl('button', { cls: 'tp-btn tp-btn-primary' })
		const saveBtnIcon = saveBtn.createDiv('tp-btn-icon')
		setIcon(saveBtnIcon, 'plus')
		saveBtn.createSpan({ text: 'Save current as profile' })
		saveBtn.addEventListener('click', () => {
			new PromptModal(
				this.app,
				'Enter profile name',
				async (name) => {
					const newProfile: Profile = {
						id: `custom-${Date.now()}`,
						name,
						icon: 'user',
						description: 'Custom profile',
						settings: { ...this.plugin.settings },
						createdAt: Date.now(),
						isBuiltIn: false
					}
					// Remove circular references - use Partial<TeleprompterSettings> to properly delete these
					const profileSettings = newProfile.settings as Partial<TeleprompterSettings>
					delete profileSettings.profiles
					delete profileSettings.settingsUI
					delete profileSettings.toolbarLayout

					this.plugin.settings.profiles.custom.push(newProfile)
					await this.plugin.saveSettings()
					new Notice(`Profile "${name}" saved`)
					this.display()
				},
				'My profile'
			).open()
		})

		// Import profile
		const importBtn = actionsContainer.createEl('button', { cls: 'tp-btn' })
		const importBtnIcon = importBtn.createDiv('tp-btn-icon')
		setIcon(importBtnIcon, 'upload')
		importBtn.createSpan({ text: 'Import profile' })
		importBtn.addEventListener('click', () => {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = '.json'
			input.onchange = async (e) => {
				const file = (e.target as HTMLInputElement).files?.[0]
				if (!file) return
				const reader = new FileReader()
				reader.onload = async (event) => {
					try {
						const imported = JSON.parse(event.target?.result as string)
						if (imported.name && imported.settings) {
							imported.id = `custom-${Date.now()}`
							imported.createdAt = Date.now()
							imported.isBuiltIn = false
							this.plugin.settings.profiles.custom.push(imported)
							await this.plugin.saveSettings()
							new Notice(`Profile "${imported.name}" imported`)
							this.display()
						} else {
							new Notice('Invalid profile file')
						}
					} catch {
						new Notice('Failed to import profile')
					}
				}
				reader.readAsText(file)
			}
			input.click()
		})
	}

	// ========================================
	// Connection Tab - WebSocket settings
	// ========================================
	private displayConnectionTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Configure WebSocket server for Stream Deck and external control',
			cls: 'setting-item-description',
		})

		// Connection status
		const wsInfo = this.plugin.getWebSocketInfo()
		const statusEl = containerEl.createDiv('tp-connection-status')

		const indicator = statusEl.createDiv(`tp-connection-indicator ${wsInfo.running ? 'connected' : 'disconnected'}`)

		const statusInfo = statusEl.createDiv('tp-connection-info')
		statusInfo.createDiv({
			text: wsInfo.running ? 'Server Running' : 'Server Stopped',
			cls: 'tp-connection-title'
		})
		statusInfo.createDiv({
			text: wsInfo.running
				? `ws://${wsInfo.host}:${wsInfo.port} • ${wsInfo.clientCount} client(s)`
				: 'Not accepting connections',
			cls: 'tp-connection-detail'
		})

		// Control buttons
		const controlBtn = statusEl.createEl('button', {
			cls: 'tp-btn tp-btn-primary',
			text: wsInfo.running ? 'Restart' : 'Start'
		})
		controlBtn.addEventListener('click', async () => {
			controlBtn.disabled = true
			controlBtn.textContent = 'Restarting...'
			await this.plugin.restartWebSocketServer()
			this.display()
		})

		// Auto-refresh status
		if (this.statusInterval) {
			clearInterval(this.statusInterval)
		}
		this.statusInterval = setInterval(() => {
			const newInfo = this.plugin.getWebSocketInfo()
			indicator.className = `tp-connection-indicator ${newInfo.running ? 'connected' : 'disconnected'}`
		}, 2000)

		// Server Settings
		const serverSection = containerEl.createDiv('tp-section-header')
		const serverIcon = serverSection.createDiv('tp-section-header-icon')
		setIcon(serverIcon, 'server')
		serverSection.createSpan({ text: 'Server settings', cls: 'tp-section-header-title' })

		new Setting(containerEl)
			.setName('Auto-start server')
			.setDesc('Start WebSocket server when Obsidian loads')
			.addToggle(t => t
				.setValue(this.plugin.settings.autoStartWebSocket)
				.onChange(async (value) => {
					this.plugin.settings.autoStartWebSocket = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Port')
			.setDesc('WebSocket server port (requires restart)')
			.addText(t => t
				.setPlaceholder('8765')
				.setValue(this.plugin.settings.wsPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value)
					if (port >= 1024 && port <= 65535) {
						this.plugin.settings.wsPort = port
						await this.plugin.saveSettings()
					}
				})
			)

		new Setting(containerEl)
			.setName('Host')
			.setDesc('Server host address (127.0.0.1 recommended for security)')
			.addText(t => t
				.setPlaceholder('127.0.0.1')
				.setValue(this.plugin.settings.wsHost)
				.onChange(async (value) => {
					// Validate host - only allow valid IP addresses or localhost
					const hostPattern = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/
					if (hostPattern.test(value.trim())) {
						this.plugin.settings.wsHost = value.trim()
						await this.plugin.saveSettings()
						// Warn if not localhost
						if (value !== '127.0.0.1' && value !== 'localhost') {
							new Notice('Warning: Non-localhost binding exposes the server to the network.')
						}
					}
				})
			)

		new Setting(containerEl)
			.setName('Connection notifications')
			.setDesc('Show notifications when clients connect/disconnect')
			.addToggle(t => t
				.setValue(this.plugin.settings.showConnectionNotifications)
				.onChange(async (value) => {
					this.plugin.settings.showConnectionNotifications = value
					await this.plugin.saveSettings()
				})
			)

		// Network Broadcast Section
		const broadcastSection = containerEl.createDiv('tp-section-header')
		const broadcastIcon = broadcastSection.createDiv('tp-section-header-icon')
		setIcon(broadcastIcon, 'radio')
		broadcastSection.createSpan({ text: 'Network broadcast (multi-device sync)', cls: 'tp-section-header-title' })

		new Setting(containerEl)
			.setName('Enable network broadcast')
			.setDesc('Broadcast scroll position to connected devices for multi-device sync. Other devices can follow this teleprompter.')
			.addToggle(t => t
				.setValue(this.plugin.settings.networkBroadcastEnabled)
				.onChange(async (value) => {
					this.plugin.settings.networkBroadcastEnabled = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Broadcast interval (ms)')
			.setDesc('How often to broadcast scroll position during playback. Lower = smoother sync but more network traffic. (50-500ms)')
			.addSlider(s => s
				.setLimits(50, 500, 50)
				.setValue(this.plugin.settings.networkBroadcastInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.networkBroadcastInterval = value
					await this.plugin.saveSettings()
				})
			)

		const broadcastInfo = containerEl.createDiv()
		broadcastInfo.createEl('p', {
			text: 'When enabled, this teleprompter becomes the "master" and broadcasts its scroll position. Other devices can connect via WebSocket and follow along in sync.',
			cls: 'setting-item-description'
		})
		broadcastInfo.createEl('p', {
			text: `Connect other devices to: ws://${this.plugin.settings.wsHost}:${this.plugin.settings.wsPort}`,
			cls: 'setting-item-description'
		})

		// Remote Web Interface Section
		const remoteSection = containerEl.createDiv('tp-section-header')
		const remoteIcon = remoteSection.createDiv('tp-section-header-icon')
		setIcon(remoteIcon, 'smartphone')
		remoteSection.createSpan({ text: 'Remote web interface', cls: 'tp-section-header-title' })

		const remoteStatus = containerEl.createDiv('tp-connection-status tp-flex-container--mb')

		const remoteIndicator = remoteStatus.createDiv(`tp-connection-indicator ${wsInfo.running ? 'connected' : 'disconnected'}`)

		const remoteInfo = remoteStatus.createDiv('tp-connection-info')
		remoteInfo.createDiv({
			text: wsInfo.running ? 'Remote Interface Available' : 'Server Not Running',
			cls: 'tp-connection-title'
		})

		// Get local network URL for phone access
		let localUrl = `http://${this.plugin.settings.wsHost}:${this.plugin.settings.wsPort}/`
		const wsServerInfo = this.plugin.getWebSocketInfo()
		if (wsServerInfo.remoteUrl) {
			localUrl = wsServerInfo.remoteUrl
		}

		remoteInfo.createDiv({
			text: wsInfo.running ? localUrl : 'Start the server to enable remote access',
			cls: 'tp-connection-detail'
		})

		// Open Remote button
		const openRemoteBtn = remoteStatus.createEl('button', {
			cls: 'tp-btn tp-btn-primary',
			text: 'Open remote'
		})
		openRemoteBtn.disabled = !wsInfo.running
		openRemoteBtn.addEventListener('click', () => {
			if (wsInfo.running) {
				window.open(localUrl, '_blank')
			}
		})

		// Remote usage instructions
		const remoteGuide = containerEl.createDiv()
		remoteGuide.createEl('p', {
			text: 'Control the teleprompter from your phone or tablet:',
			cls: 'setting-item-description'
		})

		const remoteSteps = remoteGuide.createEl('ol')
		remoteSteps.createEl('li', { text: 'Ensure your phone is on the same WiFi network as this computer' })
		remoteSteps.createEl('li', { text: 'Open the URL above in your phone\'s browser' })
		remoteSteps.createEl('li', { text: 'Use the big Play/Pause button to control playback' })
		remoteSteps.createEl('li', { text: 'Adjust speed, jump to sections, and more from your phone' })

		// Show local network IP hint
		if (this.plugin.settings.wsHost === '127.0.0.1' || this.plugin.settings.wsHost === 'localhost') {
			const ipHint = remoteGuide.createEl('p', {
				cls: 'setting-item-description'
			})
			ipHint.innerHTML = '<strong>Tip:</strong> To access from your phone, change the Host setting above to <code>0.0.0.0</code> and use your computer\'s local IP address. On macOS: System Settings → Wi-Fi → Details... → TCP/IP → IP address. Or run <code>ipconfig getifaddr en0</code> in Terminal.'
		}

		// Stream Deck Guide
		const guideSection = containerEl.createDiv('tp-section-header')
		const guideIcon = guideSection.createDiv('tp-section-header-icon')
		setIcon(guideIcon, 'help-circle')
		guideSection.createSpan({ text: 'Stream Deck setup', cls: 'tp-section-header-title' })

		const guideEl = containerEl.createDiv()
		guideEl.createEl('p', {
			text: 'To control Teleprompter Plus from Stream Deck:',
			cls: 'setting-item-description'
		})

		const steps = guideEl.createEl('ol')
		steps.createEl('li', { text: 'Ensure the WebSocket server is running (see status above)' })
		steps.createEl('li', { text: 'Install the Teleprompter Plus Stream Deck plugin' })
		steps.createEl('li', { text: `Configure plugin to connect to ws://${this.plugin.settings.wsHost}:${this.plugin.settings.wsPort}` })
		steps.createEl('li', { text: 'Add actions to your Stream Deck buttons' })

		guideEl.createEl('p', {
			text: 'The server only accepts connections from localhost (127.0.0.1) for security.',
			cls: 'setting-item-description'
		})
	}

	// ========================================
	// OBS Tab - OBS Studio integration settings
	// ========================================
	private displayOBSTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Integrate with OBS Studio for recording and streaming sync',
			cls: 'setting-item-description',
		})

		// OBS Connection Status
		const obsInfo = this.plugin.getOBSInfo()
		const statusEl = containerEl.createDiv('tp-connection-status')

		const indicator = statusEl.createDiv(`tp-connection-indicator ${obsInfo.status === 'connected' ? 'connected' : 'disconnected'}`)

		const statusInfo = statusEl.createDiv('tp-connection-info')
		statusInfo.createDiv({
			text: obsInfo.status === 'connected' ? 'Connected to OBS' : obsInfo.status === 'connecting' ? 'Connecting...' : 'Not Connected',
			cls: 'tp-connection-title'
		})

		let statusDetail = 'Click Connect to link with OBS'
		if (obsInfo.status === 'connected') {
			statusDetail = `ws://${this.plugin.settings.obsHost}:${this.plugin.settings.obsPort}`
			if (obsInfo.isRecording) statusDetail += ' • Recording'
			if (obsInfo.isStreaming) statusDetail += ' • Streaming'
		} else if (obsInfo.status === 'error' && obsInfo.error) {
			statusDetail = obsInfo.error
		}
		statusInfo.createDiv({
			text: statusDetail,
			cls: 'tp-connection-detail'
		})

		// Connect/Disconnect button
		const controlBtn = statusEl.createEl('button', {
			cls: 'tp-btn tp-btn-primary',
			text: obsInfo.status === 'connected' ? 'Disconnect' : 'Connect'
		})
		controlBtn.addEventListener('click', async () => {
			controlBtn.disabled = true
			if (obsInfo.status === 'connected') {
				controlBtn.textContent = 'Disconnecting...'
				await this.plugin.disconnectOBS()
			} else {
				controlBtn.textContent = 'Connecting...'
				await this.plugin.connectOBS()
			}
			this.display()
		})

		// Auto-refresh OBS status
		if (this.obsStatusInterval) {
			clearInterval(this.obsStatusInterval)
		}
		this.obsStatusInterval = setInterval(() => {
			const newInfo = this.plugin.getOBSInfo()
			// Update connection indicator
			indicator.className = `tp-connection-indicator ${newInfo.status === 'connected' ? 'connected' : 'disconnected'}`
			// Update status title
			const titleEl = statusInfo.querySelector('.tp-connection-title')
			if (titleEl) {
				titleEl.textContent = newInfo.status === 'connected' ? 'Connected to OBS' : newInfo.status === 'connecting' ? 'Connecting...' : 'Not Connected'
			}
			// Update status detail
			const detailEl = statusInfo.querySelector('.tp-connection-detail')
			if (detailEl) {
				let detail = 'Click Connect to link with OBS'
				if (newInfo.status === 'connected') {
					detail = `ws://${this.plugin.settings.obsHost}:${this.plugin.settings.obsPort}`
					if (newInfo.isRecording) detail += ' • Recording'
					if (newInfo.isStreaming) detail += ' • Streaming'
				} else if (newInfo.status === 'error' && newInfo.error) {
					detail = newInfo.error
				}
				detailEl.textContent = detail
			}
		}, 2000)

		// Enable Integration Section
		const enableSection = containerEl.createDiv('tp-section-header')
		const enableIcon = enableSection.createDiv('tp-section-header-icon')
		setIcon(enableIcon, 'power')
		enableSection.createSpan({ text: 'Integration settings', cls: 'tp-section-header-title' })

		new Setting(containerEl)
			.setName('Enable OBS integration')
			.setDesc('Allow Teleprompter Plus to connect to OBS Studio')
			.addToggle(t => t
				.setValue(this.plugin.settings.obsEnabled)
				.onChange(async (value) => {
					this.plugin.settings.obsEnabled = value
					await this.plugin.saveSettings()
					if (!value) {
						await this.plugin.disconnectOBS()
					}
					this.display()
				})
			)

		new Setting(containerEl)
			.setName('Auto-connect on startup')
			.setDesc('Automatically connect to OBS when Obsidian loads')
			.addToggle(t => t
				.setValue(this.plugin.settings.obsAutoConnect)
				.onChange(async (value) => {
					this.plugin.settings.obsAutoConnect = value
					await this.plugin.saveSettings()
				})
			)

		// Connection Settings Section
		const connectionSection = containerEl.createDiv('tp-section-header')
		const connectionIcon = connectionSection.createDiv('tp-section-header-icon')
		setIcon(connectionIcon, 'server')
		connectionSection.createSpan({ text: 'Connection settings', cls: 'tp-section-header-title' })

		new Setting(containerEl)
			.setName('OBS host')
			.setDesc('OBS WebSocket server host (usually 127.0.0.1)')
			.addText(t => t
				.setPlaceholder('127.0.0.1')
				.setValue(this.plugin.settings.obsHost)
				.onChange(async (value) => {
					this.plugin.settings.obsHost = value.trim() || '127.0.0.1'
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('OBS port')
			.setDesc('OBS WebSocket server port (default: 4455 for OBS 28+)')
			.addText(t => t
				.setPlaceholder('4455')
				.setValue(this.plugin.settings.obsPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value)
					if (port >= 1024 && port <= 65535) {
						this.plugin.settings.obsPort = port
						await this.plugin.saveSettings()
					}
				})
			)

		new Setting(containerEl)
			.setName('OBS password')
			.setDesc('WebSocket server password (leave empty if not set in OBS)')
			.addText(t => {
				t.inputEl.type = 'password'
				t.setPlaceholder('••••••••')
				t.setValue(this.plugin.settings.obsPassword)
				t.onChange(async (value) => {
					this.plugin.settings.obsPassword = value
					await this.plugin.saveSettings()
				})
				return t
			})

		// Sync Settings Section
		const syncSection = containerEl.createDiv('tp-section-header')
		const syncIcon = syncSection.createDiv('tp-section-header-icon')
		setIcon(syncIcon, 'link')
		syncSection.createSpan({ text: 'Playback sync', cls: 'tp-section-header-title' })

		new Setting(containerEl)
			.setName('Sync recording with teleprompter')
			.setDesc('Start OBS recording when teleprompter plays, stop when reset')
			.addToggle(t => t
				.setValue(this.plugin.settings.obsSyncRecording)
				.onChange(async (value) => {
					this.plugin.settings.obsSyncRecording = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Sync streaming with teleprompter')
			.setDesc('Start OBS streaming when teleprompter plays, stop when reset')
			.addToggle(t => t
				.setValue(this.plugin.settings.obsSyncStreaming)
				.onChange(async (value) => {
					this.plugin.settings.obsSyncStreaming = value
					await this.plugin.saveSettings()
				})
			)

		// Manual Controls Section (only show when connected)
		if (obsInfo.status === 'connected') {
			const controlsSection = containerEl.createDiv('tp-section-header')
			const controlsIcon = controlsSection.createDiv('tp-section-header-icon')
			setIcon(controlsIcon, 'sliders-horizontal')
			controlsSection.createSpan({ text: 'Manual controls', cls: 'tp-section-header-title' })

			const controlsContainer = containerEl.createDiv('tp-flex-container')

			// Toggle Recording button
			const recordBtn = controlsContainer.createEl('button', {
				cls: `tp-btn ${obsInfo.isRecording ? 'tp-btn-danger' : ''}`,
			})
			const recordBtnIcon = recordBtn.createDiv('tp-btn-icon')
			setIcon(recordBtnIcon, obsInfo.isRecording ? 'square' : 'circle')
			recordBtn.createSpan({ text: obsInfo.isRecording ? 'Stop Recording' : 'Start Recording' })
			recordBtn.addEventListener('click', async () => {
				await this.plugin.toggleOBSRecording()
				// Brief delay then refresh
				setTimeout(() => this.display(), 500)
			})

			// Toggle Streaming button
			const streamBtn = controlsContainer.createEl('button', {
				cls: `tp-btn ${obsInfo.isStreaming ? 'tp-btn-danger' : ''}`,
			})
			const streamBtnIcon = streamBtn.createDiv('tp-btn-icon')
			setIcon(streamBtnIcon, obsInfo.isStreaming ? 'wifi-off' : 'wifi')
			streamBtn.createSpan({ text: obsInfo.isStreaming ? 'Stop Streaming' : 'Start Streaming' })
			streamBtn.addEventListener('click', async () => {
				await this.plugin.toggleOBSStreaming()
				// Brief delay then refresh
				setTimeout(() => this.display(), 500)
			})

			// Current scene info
			if (obsInfo.currentScene) {
				const sceneInfo = containerEl.createDiv('tp-flex-container--mt')
				sceneInfo.createEl('p', {
					text: `Current Scene: ${obsInfo.currentScene}`,
					cls: 'setting-item-description'
				})
			}
		}

		// Setup Guide Section
		const guideSection = containerEl.createDiv('tp-section-header')
		const guideIcon = guideSection.createDiv('tp-section-header-icon')
		setIcon(guideIcon, 'help-circle')
		guideSection.createSpan({ text: 'Setup guide', cls: 'tp-section-header-title' })

		const guideEl = containerEl.createDiv()
		guideEl.createEl('p', {
			text: 'To enable OBS integration:',
			cls: 'setting-item-description'
		})

		const steps = guideEl.createEl('ol')
		steps.createEl('li', { text: 'Open OBS Studio (version 28 or later)' })
		steps.createEl('li', { text: 'Go to Tools → WebSocket Server Settings' })
		steps.createEl('li', { text: 'Check "Enable WebSocket server"' })
		steps.createEl('li', { text: 'Set a password if desired (optional)' })
		steps.createEl('li', { text: 'Note the port number (default: 4455)' })
		steps.createEl('li', { text: 'Click "Apply" and close the dialog' })
		steps.createEl('li', { text: 'Enter the same settings above and click Connect' })

		guideEl.createEl('p', {
			text: 'OBS 28+ has the WebSocket server built-in. Earlier versions require the obs-websocket plugin.',
			cls: 'setting-item-description'
		})
	}

	// Old appearance tab body removed

	private displayAboutTab(containerEl: HTMLElement): void {
		// About Header
		const aboutHeader = containerEl.createDiv('tp-about-header')
		const aboutLogo = aboutHeader.createDiv('tp-about-logo')
		setIcon(aboutLogo, 'presentation')
		aboutHeader.createDiv({ text: 'Teleprompter Plus', cls: 'tp-about-name' })  // Proper noun - keep title case
		aboutHeader.createDiv({ text: 'Version 1.0.0', cls: 'tp-about-version' })

		// Links row
		const linksRow = aboutHeader.createDiv('tp-about-links')

		const docsLink = linksRow.createEl('a', { cls: 'tp-about-link', href: '#' })
		const docsIcon = docsLink.createDiv()
		setIcon(docsIcon, 'book-open')
		docsLink.createSpan({ text: 'Docs' })
		docsLink.addEventListener('click', (e) => {
			e.preventDefault()
			window.open('https://github.com/yourusername/obsidian-teleprompter-plus#readme')
		})

		const issuesLink = linksRow.createEl('a', { cls: 'tp-about-link', href: '#' })
		const issuesIcon = issuesLink.createDiv()
		setIcon(issuesIcon, 'message-circle')
		issuesLink.createSpan({ text: 'Support' })
		issuesLink.addEventListener('click', (e) => {
			e.preventDefault()
			window.open('https://github.com/yourusername/obsidian-teleprompter-plus/issues')
		})

		// Features Section
		const featuresSection = containerEl.createDiv('tp-section-header')
		const featuresIcon = featuresSection.createDiv('tp-section-header-icon')
		setIcon(featuresIcon, 'sparkles')
		featuresSection.createSpan({ text: 'Features', cls: 'tp-section-header-title' })

		const featuresGrid = containerEl.createDiv('tp-health-grid')

		const features = [
			{ icon: 'play', label: 'Auto-Scroll', desc: 'Adjustable speed' },
			{ icon: 'palette', label: 'Custom Icons', desc: '46+ designs' },
			{ icon: 'maximize', label: 'Fullscreen', desc: 'Persistent toolbar' },
			{ icon: 'map', label: 'Navigation', desc: 'Minimap & sections' },
			{ icon: 'wifi', label: 'Stream Deck', desc: 'WebSocket API' },
			{ icon: 'user-cog', label: 'Profiles', desc: 'Save configurations' },
		]

		features.forEach(feature => {
			const card = featuresGrid.createDiv('tp-health-card')
			const cardIcon = card.createDiv('tp-health-card-icon')
			setIcon(cardIcon, feature.icon)
			card.createDiv({ text: feature.label, cls: 'tp-health-card-value' })
			card.createDiv({ text: feature.desc, cls: 'tp-health-card-label' })
		})

		// Keyboard Shortcuts Section
		const shortcutsSection = containerEl.createDiv('tp-section-header')
		const shortcutsIcon = shortcutsSection.createDiv('tp-section-header-icon')
		setIcon(shortcutsIcon, 'keyboard')
		shortcutsSection.createSpan({ text: 'Keyboard shortcuts', cls: 'tp-section-header-title' })

		const shortcutsTable = containerEl.createEl('table', { cls: 'tp-shortcuts-table' })
		const shortcutsHead = shortcutsTable.createEl('thead')
		const headRow = shortcutsHead.createEl('tr')
		headRow.createEl('th', { text: 'Key' })
		headRow.createEl('th', { text: 'Action' })

		const shortcutsBody = shortcutsTable.createEl('tbody')
		const shortcuts = [
			{ key: 'Space', action: 'Toggle play/pause' },
			{ key: '↑ / ↓', action: 'Speed up/down' },
			{ key: '← / →', action: 'Manual scroll' },
			{ key: 'Home', action: 'Reset to top' },
			{ key: 'N', action: 'Toggle navigation' },
			{ key: 'J / K', action: 'Next/prev section' },
			{ key: 'F', action: 'Toggle fullscreen' },
			{ key: 'E', action: 'Toggle eyeline' },
			{ key: 'P', action: 'Cycle speed preset' },
			{ key: 'V', action: 'Toggle voice tracking' },
		]

		shortcuts.forEach(shortcut => {
			const row = shortcutsBody.createEl('tr')
			const keyCell = row.createEl('td')
			keyCell.createEl('span', { text: shortcut.key, cls: 'tp-shortcut-key' })
			row.createEl('td', { text: shortcut.action })
		})

		// Credits Section
		const creditsSection = containerEl.createDiv('tp-section-header')
		const creditsIcon = creditsSection.createDiv('tp-section-header-icon')
		setIcon(creditsIcon, 'heart')
		creditsSection.createSpan({ text: 'Credits', cls: 'tp-section-header-title' })

		const creditsEl = containerEl.createDiv('tp-credits')

		creditsEl.createEl('p', { text: 'Built for the Obsidian community' })
		creditsEl.createEl('p', { text: 'Powered by Svelte 5 & Obsidian Plugin API' })
	}

	/**
	 * Called when the settings tab is hidden
	 */
	hide(): void {
		// Clean up the status intervals
		if (this.statusInterval) {
			clearInterval(this.statusInterval)
			this.statusInterval = null
		}
		if (this.obsStatusInterval) {
			clearInterval(this.obsStatusInterval)
			this.obsStatusInterval = null
		}
	}

	/**
	 * Update the server status display
	 */
	private updateServerStatus(statusEl: HTMLElement): void {
		const info = this.plugin.getWebSocketInfo()

		statusEl.empty()

		if (info.running) {
			statusEl.createEl('span', {
				text: '🟢 Running',
				cls: 'teleprompter-status-running',
			})
			statusEl.createEl('br')
			statusEl.createEl('span', {
				text: `${info.clientCount} client(s) connected`,
				cls: 'teleprompter-status-detail',
			})
			statusEl.createEl('br')
			statusEl.createEl('span', {
				text: `ws://${info.host}:${info.port}`,
				cls: 'teleprompter-status-detail',
			})
		} else {
			statusEl.createEl('span', {
				text: '🔴 Stopped',
				cls: 'teleprompter-status-stopped',
			})
		}
	}
}
