import { Plugin, Notice, addIcon, TFile, WorkspaceLeaf } from 'obsidian'
import { TeleprompterView, VIEW_TYPE_TELEPROMPTER } from './view'
import { TeleprompterWebSocketServer, type TeleprompterState } from './websocket-server'
import { TeleprompterSettingTab, DEFAULT_SETTINGS } from './settings'
import type { TeleprompterSettings } from './settings'
import { OBSService, type OBSState } from './obs-service'
import { WhatsNewModal } from './whats-new-modal'
import './styles.css'

// Extended state type for broadcast updates that include additional properties
interface ExtendedBroadcastState extends Partial<TeleprompterState> {
	networkBroadcastEnabled?: boolean
	networkBroadcastInterval?: number
	obs?: OBSState
	obsScenes?: string[]
}

export default class TeleprompterPlusPlugin extends Plugin {
	settings: TeleprompterSettings
	private wsServer: TeleprompterWebSocketServer | null = null
	private obsService: OBSService | null = null

	onload(): void {
		// Teleprompter icon - CORRECT FORMAT per Obsidian docs
		// NO <svg> wrapper, coordinates for 100x100 viewBox
		const iconSvg = `<path d="M 15 10 L 85 10 L 75 70 L 25 70 Z" fill="currentColor"></path><rect x="47" y="70" width="6" height="15" fill="currentColor"></rect><rect x="30" y="85" width="40" height="8" fill="currentColor"></rect><line x1="30" y1="35" x2="70" y2="35" stroke="currentColor" stroke-width="3" opacity="0.5"></line>`
		const iconName = 'teleprompter-final'

		addIcon(iconName, iconSvg)

		// ===== REGISTER ALL COMMAND ICONS =====
		// Stream Deck Editorial style - adapted for Obsidian
		// Matches Stream Deck icons: dashed circles, filled shapes, same proportions

		// Playback controls - Editorial dashed circle + filled shapes
		addIcon('tp-play-pause', `<circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="6,3"></circle><path d="M 40 32 L 40 68 L 68 50 Z" fill="currentColor"></path>`)
		addIcon('tp-play', `<circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="6,3"></circle><path d="M 40 32 L 40 68 L 68 50 Z" fill="currentColor"></path>`)
		addIcon('tp-pause', `<circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="6,3"></circle><rect x="35" y="32" width="10" height="36" rx="2" fill="currentColor"></rect><rect x="55" y="32" width="10" height="36" rx="2" fill="currentColor"></rect>`)
		addIcon('tp-reset-top', `<path d="M 50 75 L 50 30 M 50 30 L 35 45 M 50 30 L 65 45" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="28" y1="20" x2="72" y2="20" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line>`)

		// Speed controls - Editorial double chevrons
		addIcon('tp-speed-up', `<path d="M 25 72 L 50 52 L 75 72" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 25 48 L 50 28 L 75 48" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-speed-down', `<path d="M 25 28 L 50 48 L 75 28" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 25 52 L 50 72 L 75 52" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)

		// Font size controls - Editorial A with +/-
		addIcon('tp-font-up', `<path d="M 18 72 L 40 25 L 62 72" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="26" y1="55" x2="54" y2="55" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><path d="M 80 30 L 80 50 M 70 40 L 90 40" stroke="currentColor" stroke-width="5" stroke-linecap="round"></path>`)
		addIcon('tp-font-down', `<path d="M 18 72 L 40 25 L 62 72" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="26" y1="55" x2="54" y2="55" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><line x1="70" y1="40" x2="90" y2="40" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line>`)
		addIcon('tp-font-reset', `<path d="M 15 72 L 38 25 L 60 72" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="23" y1="55" x2="52" y2="55" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><path d="M 78 32 A 15 15 0 1 1 78 62" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path><path d="M 78 32 L 88 38 L 82 25" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)

		// Navigation controls - Editorial double chevrons with end bar
		addIcon('tp-next-section', `<path d="M 20 30 L 40 50 L 20 70" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 45 30 L 65 50 L 45 70" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="78" y1="25" x2="78" y2="75" stroke="currentColor" stroke-width="6" stroke-linecap="round"></line>`)
		addIcon('tp-prev-section', `<line x1="22" y1="25" x2="22" y2="75" stroke="currentColor" stroke-width="6" stroke-linecap="round"></line><path d="M 55 30 L 35 50 L 55 70" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 80 30 L 60 50 L 80 70" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-nav-panel', `<rect x="15" y="25" width="28" height="50" fill="none" stroke="currentColor" stroke-width="5" rx="3"></rect><rect x="57" y="25" width="28" height="50" fill="none" stroke="currentColor" stroke-width="5" rx="3"></rect><path d="M 45 42 L 55 50 L 45 58" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)

		// Display controls - Editorial style
		addIcon('tp-eyeline', `<ellipse cx="50" cy="50" rx="35" ry="22" fill="none" stroke="currentColor" stroke-width="5"></ellipse><circle cx="50" cy="50" r="12" fill="currentColor"></circle>`)
		addIcon('tp-fullscreen', `<path d="M 20 38 L 20 20 L 38 20" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 62 20 L 80 20 L 80 38" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 80 62 L 80 80 L 62 80" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 38 80 L 20 80 L 20 62" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-minimap', `<rect x="20" y="15" width="60" height="70" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><rect x="28" y="55" width="44" height="22" fill="currentColor" rx="3"></rect>`)

		// Navigation panel - Editorial sidebar style
		addIcon('tp-navigation', `<rect x="15" y="15" width="28" height="70" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><rect x="57" y="15" width="28" height="70" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect>`)

		// Detach/Open in window - Editorial overlapping windows
		addIcon('tp-detach', `<rect x="18" y="18" width="42" height="35" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><rect x="40" y="47" width="42" height="35" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><path d="M 68 32 L 78 22 M 78 22 L 68 22 M 78 22 L 78 32" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)

		// Document controls - Editorial style
		addIcon('tp-pin', `<circle cx="50" cy="32" r="14" fill="currentColor"></circle><rect x="46" y="44" width="8" height="35" fill="currentColor"></rect><path d="M 35 79 L 50 90 L 65 79" fill="currentColor"></path>`)
		addIcon('tp-refresh', `<path d="M 75 35 A 25 25 0 1 0 75 65" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"></path><path d="M 75 65 L 65 55 M 75 65 L 85 55" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-keep-awake', `<path d="M 28 38 L 28 68 Q 28 78 38 78 L 62 78 Q 72 78 72 68 L 72 38" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 72 48 Q 85 48 85 58 Q 85 68 72 68" stroke="currentColor" stroke-width="4" fill="none"></path><path d="M 38 28 Q 43 18 48 28 M 52 22 Q 57 12 62 22" stroke="currentColor" stroke-width="4" fill="none"></path>`)
		addIcon('tp-auto-pause', `<circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="6,3"></circle><rect x="38" y="35" width="10" height="30" rx="2" fill="currentColor"></rect><rect x="52" y="35" width="10" height="30" rx="2" fill="currentColor"></rect>`)
		addIcon('tp-align-center', `<line x1="18" y1="25" x2="82" y2="25" stroke="currentColor" stroke-width="6" stroke-linecap="round"></line><line x1="28" y1="45" x2="72" y2="45" stroke="currentColor" stroke-width="6" stroke-linecap="round"></line><line x1="22" y1="65" x2="78" y2="65" stroke="currentColor" stroke-width="6" stroke-linecap="round"></line><line x1="32" y1="85" x2="68" y2="85" stroke="currentColor" stroke-width="6" stroke-linecap="round"></line>`)

		// Countdown controls - Editorial clock with +/-
		addIcon('tp-countdown-up', `<circle cx="42" cy="48" r="22" fill="none" stroke="currentColor" stroke-width="5"></circle><line x1="42" y1="48" x2="42" y2="32" stroke="currentColor" stroke-width="4"></line><line x1="42" y1="48" x2="54" y2="54" stroke="currentColor" stroke-width="4"></line><path d="M 72 68 L 88 68 M 80 60 L 80 76" stroke="currentColor" stroke-width="5" stroke-linecap="round"></path>`)
		addIcon('tp-countdown-down', `<circle cx="42" cy="48" r="22" fill="none" stroke="currentColor" stroke-width="5"></circle><line x1="42" y1="48" x2="42" y2="32" stroke="currentColor" stroke-width="4"></line><line x1="42" y1="48" x2="54" y2="54" stroke="currentColor" stroke-width="4"></line><line x1="72" y1="68" x2="88" y2="68" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line>`)

		// Flip/mirror controls - Editorial panels with arrows
		addIcon('tp-flip-h', `<path d="M 22 30 L 35 30 L 35 70 L 22 70" fill="currentColor"></path><path d="M 78 30 L 65 30 L 65 70 L 78 70" fill="currentColor"></path><line x1="50" y1="20" x2="50" y2="80" stroke="currentColor" stroke-width="3" stroke-dasharray="5,4"></line><path d="M 38 42 L 48 50 L 38 58" fill="currentColor"></path><path d="M 62 42 L 52 50 L 62 58" fill="currentColor"></path>`)
		addIcon('tp-flip-v', `<rect x="30" y="20" width="40" height="12" fill="currentColor"></rect><rect x="30" y="68" width="40" height="12" fill="currentColor"></rect><line x1="20" y1="50" x2="80" y2="50" stroke="currentColor" stroke-width="3" stroke-dasharray="5,4"></line><path d="M 42 35 L 50 45 L 58 35" fill="currentColor"></path><path d="M 42 65 L 50 55 L 58 65" fill="currentColor"></path>`)

		// Sync controls - Editorial bidirectional panels
		addIcon('tp-scroll-sync', `<rect x="12" y="22" width="30" height="56" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><rect x="58" y="22" width="30" height="56" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><path d="M 44 38 L 56 38 M 52 34 L 56 38 L 52 42" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M 56 62 L 44 62 M 48 58 L 44 62 L 48 66" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)

		// Info icon - Editorial wifi-style
		addIcon('tp-websocket-info', `<circle cx="50" cy="75" r="6" fill="currentColor"></circle><path d="M 30 55 A 28 28 0 0 1 70 55" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path><path d="M 18 38 A 45 45 0 0 1 82 38" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"></path>`)

		// Typography controls - Editorial style lines
		addIcon('tp-line-height', `<line x1="18" y1="28" x2="72" y2="28" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><line x1="18" y1="50" x2="72" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><line x1="18" y1="72" x2="58" y2="72" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><path d="M 85 35 L 85 65 M 80 40 L 85 35 L 90 40 M 80 60 L 85 65 L 90 60" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-letter-spacing', `<line x1="15" y1="30" x2="85" y2="30" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><line x1="15" y1="50" x2="70" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><line x1="15" y1="70" x2="55" y2="70" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><path d="M 72 70 L 88 70 M 82 64 L 88 70 L 82 76" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-opacity', `<circle cx="50" cy="55" r="24" fill="currentColor" opacity="0.8"></circle><path d="M 50 18 L 38 32 M 50 18 L 62 32" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-opacity-down', `<circle cx="50" cy="45" r="24" fill="currentColor" opacity="0.4"></circle><path d="M 50 82 L 38 68 M 50 82 L 62 68" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-padding', `<rect x="15" y="15" width="70" height="70" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="8,4" rx="5"></rect><rect x="30" y="30" width="40" height="40" fill="currentColor" opacity="0.5" rx="3"></rect>`)
		addIcon('tp-text-color', `<path d="M 25 72 L 50 22 L 75 72" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="33" y1="55" x2="67" y2="55" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><rect x="25" y="78" width="50" height="10" rx="2" fill="currentColor"></rect>`)
		addIcon('tp-bg-color', `<rect x="18" y="18" width="64" height="64" fill="currentColor" opacity="0.3" rx="5"></rect><circle cx="50" cy="50" r="18" fill="currentColor"></circle>`)
		addIcon('tp-quick-presets', `<rect x="15" y="15" width="28" height="28" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><rect x="57" y="15" width="28" height="28" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><rect x="15" y="57" width="28" height="28" fill="none" stroke="currentColor" stroke-width="5" rx="4"></rect><rect x="57" y="57" width="28" height="28" fill="currentColor" opacity="0.7" rx="4"></rect>`)
		addIcon('tp-progress-bar', `<rect x="15" y="38" width="70" height="24" fill="none" stroke="currentColor" stroke-width="5" rx="5"></rect><rect x="18" y="42" width="35" height="16" fill="currentColor" rx="3"></rect>`)

		// Color preset icons
		addIcon('tp-color-dark', `<circle cx="50" cy="50" r="35" fill="currentColor" opacity="0.8"></circle><circle cx="65" cy="35" r="8" fill="currentColor" opacity="0.4"></circle>`)
		addIcon('tp-color-light', `<circle cx="50" cy="50" r="35" stroke="currentColor" stroke-width="4" fill="none"></circle><line x1="50" y1="10" x2="50" y2="20" stroke="currentColor" stroke-width="3"></line><line x1="50" y1="80" x2="50" y2="90" stroke="currentColor" stroke-width="3"></line><line x1="10" y1="50" x2="20" y2="50" stroke="currentColor" stroke-width="3"></line><line x1="80" y1="50" x2="90" y2="50" stroke="currentColor" stroke-width="3"></line><line x1="20" y1="20" x2="27" y2="27" stroke="currentColor" stroke-width="3"></line><line x1="73" y1="73" x2="80" y2="80" stroke="currentColor" stroke-width="3"></line><line x1="80" y1="20" x2="73" y2="27" stroke="currentColor" stroke-width="3"></line><line x1="27" y1="73" x2="20" y2="80" stroke="currentColor" stroke-width="3"></line>`)
		addIcon('tp-color-black', `<rect x="15" y="15" width="70" height="70" fill="currentColor"></rect>`)
		addIcon('tp-color-sepia', `<rect x="15" y="15" width="70" height="70" fill="currentColor" opacity="0.6"></rect><path d="M 20 30 Q 35 25 50 30 T 80 30" stroke="currentColor" stroke-width="2" fill="none" opacity="0.4"></path>`)
		addIcon('tp-color-green', `<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="4"></rect><path d="M 30 50 L 45 65 L 70 35" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-color-amber', `<circle cx="50" cy="50" r="30" fill="currentColor" opacity="0.7"></circle><path d="M 50 20 L 55 35 L 70 35 L 58 45 L 63 60 L 50 50 L 37 60 L 42 45 L 30 35 L 45 35 Z" fill="currentColor"></path>`)
		addIcon('tp-color-high-contrast', `<rect x="15" y="15" width="35" height="70" fill="currentColor"></rect><rect x="50" y="15" width="35" height="70" fill="none" stroke="currentColor" stroke-width="4"></rect>`)
		addIcon('tp-color-news', `<rect x="15" y="15" width="70" height="70" fill="currentColor" opacity="0.3" rx="4"></rect><path d="M 30 70 L 30 30 L 70 70 L 70 30" stroke="currentColor" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-color-greenscreen', `<rect x="15" y="15" width="70" height="70" fill="currentColor" opacity="0.4"></rect><circle cx="35" cy="35" r="12" fill="none" stroke="currentColor" stroke-width="3"></circle><circle cx="65" cy="35" r="12" fill="none" stroke="currentColor" stroke-width="3"></circle><path d="M 30 60 Q 50 75 70 60" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"></path>`)

		// Font preset icons - Using paths for consistent rendering
		addIcon('tp-font-system', `<path d="M 25 75 L 50 20 L 75 75 M 35 55 L 65 55" stroke="currentColor" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-font-sans', `<path d="M 25 75 L 50 20 L 75 75 M 35 55 L 65 55" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-font-serif', `<path d="M 25 75 L 50 20 L 75 75 M 35 55 L 65 55" stroke="currentColor" stroke-width="8" fill="none" stroke-linecap="square" stroke-linejoin="miter"></path><line x1="20" y1="75" x2="30" y2="75" stroke="currentColor" stroke-width="4"></line><line x1="70" y1="75" x2="80" y2="75" stroke="currentColor" stroke-width="4"></line>`)
		addIcon('tp-font-mono', `<rect x="20" y="25" width="60" height="50" fill="none" stroke="currentColor" stroke-width="6" rx="4"></rect><line x1="40" y1="35" x2="40" y2="65" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line><line x1="60" y1="35" x2="60" y2="65" stroke="currentColor" stroke-width="5" stroke-linecap="round"></line>`)
		addIcon('tp-font-readable', `<path d="M 25 75 L 50 20 L 75 75 M 35 55 L 65 55" stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>`)
		addIcon('tp-font-slab', `<path d="M 25 75 L 50 20 L 75 75 M 35 55 L 65 55" stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="square" stroke-linejoin="miter"></path><line x1="18" y1="75" x2="32" y2="75" stroke="currentColor" stroke-width="6"></line><line x1="68" y1="75" x2="82" y2="75" stroke="currentColor" stroke-width="6"></line><line x1="45" y1="20" x2="55" y2="20" stroke="currentColor" stroke-width="6"></line>`)

		
		// Load settings
		void this.loadSettings().then(() => {
			// Show What's New modal if version changed
			this.showWhatsNewIfNeeded()
		})

		// Register settings tab
		this.addSettingTab(new TeleprompterSettingTab(this.app, this))

		// Register the teleprompter view
		this.registerView(
			VIEW_TYPE_TELEPROMPTER,
			(leaf) => new TeleprompterView(leaf, this)
		)

		// Start WebSocket server if enabled
		if (this.settings.autoStartWebSocket) {
			void this.startWebSocketServer()
		}

		// Register WebSocket commands
		this.registerWebSocketCommands()

		// Initialize OBS service
		this.obsService = new OBSService(this.settings)

		// Auto-connect to OBS if enabled
		if (this.settings.obsEnabled && this.settings.obsAutoConnect) {
			// Delay connection slightly to ensure everything is ready
			setTimeout(() => this.connectOBS(), 2000)
		}

		// Listen for teleprompter play/pause events to sync with OBS
		this.registerDomEvent(window, 'teleprompter:play-started' as keyof WindowEventMap, () => {
			void this.obsService?.onTeleprompterPlay()
		})

		this.registerDomEvent(window, 'teleprompter:reset-complete' as keyof WindowEventMap, () => {
			void this.obsService?.onTeleprompterReset()
		})

		// Add ribbon icon to open teleprompter
		this.addRibbonIcon(iconName, 'Open teleprompter', () => {
			void this.activateView()
		})

		// Add command to open teleprompter
		this.addCommand({
			id: 'open-teleprompter',
			name: 'Open teleprompter',
			callback: () => {
				void this.activateView()
			},
		})

		// Add command to show WebSocket info
		this.addCommand({
			id: 'websocket-info',
			name: 'Show websocket info',
			callback: () => {
				this.showWebSocketInfo()
			},
		})

		// Add command to increase font size (no default hotkey to avoid conflicts)
		this.addCommand({
			id: 'increase-font-size',
			name: 'Increase font size',
			callback: () => {
				this.increaseFontSize()
				new Notice(`Font size: ${this.settings.fontSize}px`)
			},
		})

		// Add command to decrease font size (no default hotkey to avoid conflicts)
		this.addCommand({
			id: 'decrease-font-size',
			name: 'Decrease font size',
			callback: () => {
				this.decreaseFontSize()
				new Notice(`Font size: ${this.settings.fontSize}px`)
			},
		})

		// Add command to reset font size
		this.addCommand({
			id: 'reset-font-size',
			name: 'Reset font size',
			callback: () => {
				this.settings.fontSize = DEFAULT_SETTINGS.fontSize
				void this.saveSettings()
				this.updateFontSize(DEFAULT_SETTINGS.fontSize)
				new Notice(`Font size reset to ${DEFAULT_SETTINGS.fontSize}px`)
			},
		})

		// ===== Playback Control Commands =====
		this.addCommand({
			id: 'toggle-play-pause',
			name: 'Toggle playback',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-play'))
			},
		})

		this.addCommand({
			id: 'play',
			name: 'Start playback',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:play'))
			},
		})

		this.addCommand({
			id: 'pause',
			name: 'Pause playback',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:pause'))
			},
		})

		this.addCommand({
			id: 'reset-to-top',
			name: 'Reset position',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:reset-to-top'))
			},
		})

		// ===== Speed Control Commands =====
		this.addCommand({
			id: 'increase-speed',
			name: 'Increase speed',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:increase-speed'))
			},
		})

		this.addCommand({
			id: 'decrease-speed',
			name: 'Decrease speed',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:decrease-speed'))
			},
		})

		// ===== Navigation Commands =====
		this.addCommand({
			id: 'next-section',
			name: 'Next section',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:next-section'))
			},
		})

		this.addCommand({
			id: 'previous-section',
			name: 'Previous section',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:previous-section'))
			},
		})

		this.addCommand({
			id: 'toggle-navigation',
			name: 'Toggle navigation',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-navigation'))
			},
		})

		// ===== Display Commands =====
		this.addCommand({
			id: 'toggle-eyeline',
			name: 'Toggle eyeline',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-eyeline'))
			},
		})

		this.addCommand({
			id: 'toggle-focus-mode',
			name: 'Toggle focus',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-focus-mode'))
			},
		})

		this.addCommand({
			id: 'toggle-fullscreen',
			name: 'Toggle fullscreen',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-fullscreen'))
			},
		})

		this.addCommand({
			id: 'toggle-minimap',
			name: 'Show/hide minimap',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-minimap'))
			},
		})

		// ===== Pin/Keep Awake Commands =====
		this.addCommand({
			id: 'toggle-pin',
			name: 'Toggle pin',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-pin'))
			},
		})

		this.addCommand({
			id: 'refresh-pinned',
			name: 'Refresh pinned',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:refresh-pinned'))
			},
		})

		this.addCommand({
			id: 'toggle-keep-awake',
			name: 'Toggle awake mode',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-keep-awake'))
			},
		})

		// ===== Countdown Commands =====
		this.addCommand({
			id: 'countdown-increase',
			name: 'Increase countdown',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:countdown-increase'))
			},
		})

		this.addCommand({
			id: 'countdown-decrease',
			name: 'Decrease countdown',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:countdown-decrease'))
			},
		})

		// ===== Flip Commands =====
		this.addCommand({
			id: 'toggle-flip-horizontal',
			name: 'Toggle mirror mode',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-flip-horizontal'))
			},
		})

		this.addCommand({
			id: 'toggle-flip-vertical',
			name: 'Toggle vertical flip mode',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-flip-vertical'))
			},
		})

		// ===== Scroll Sync Commands =====
		this.addCommand({
			id: 'toggle-scroll-sync',
			name: 'Toggle scroll sync',
			callback: () => {
				window.dispatchEvent(new CustomEvent('teleprompter:toggle-scroll-sync'))
			},
		})

		// ===== OBS Integration Commands =====
		this.addCommand({
			id: 'obs-connect',
			name: 'Connect to OBS',
			callback: () => {
				void this.connectOBS()
			},
		})

		this.addCommand({
			id: 'obs-disconnect',
			name: 'Disconnect from OBS',
			callback: () => {
				void this.disconnectOBS()
			},
		})

		this.addCommand({
			id: 'obs-toggle-recording',
			name: 'Toggle OBS recording',
			callback: () => {
				void this.toggleOBSRecording()
			},
		})

		this.addCommand({
			id: 'obs-start-recording',
			name: 'Start OBS recording',
			callback: () => {
				void this.startOBSRecording()
			},
		})

		this.addCommand({
			id: 'obs-stop-recording',
			name: 'Stop OBS recording',
			callback: () => {
				void this.stopOBSRecording()
			},
		})

		this.addCommand({
			id: 'obs-toggle-streaming',
			name: 'Toggle OBS streaming',
			callback: () => {
				void this.toggleOBSStreaming()
			},
		})

		this.addCommand({
			id: 'obs-start-streaming',
			name: 'Start OBS streaming',
			callback: () => {
				void this.startOBSStreaming()
			},
		})

		this.addCommand({
			id: 'obs-stop-streaming',
			name: 'Stop OBS streaming',
			callback: () => {
				void this.stopOBSStreaming()
			},
		})

		// ===== URI Protocol Handler =====
		// Allows external apps to control teleprompter via obsidian:// URLs
		// Example: obsidian://teleprompter-plus?note=MyScript&play=true&speed=2
		// Using unique name 'teleprompter-plus' to avoid conflict with original OT
		this.registerObsidianProtocolHandler('teleprompter-plus', async (params) => {
			await this.handleProtocolAction(params)
		})
	}

	onunload() {
		// Stop WebSocket server
		void this.stopWebSocketServer()

		// Disconnect from OBS
		if (this.obsService) {
			void this.obsService.destroy()
			this.obsService = null
		}
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
			void workspace.revealLeaf(leaf)
		}
	}

	/**
	 * Start WebSocket server for external control (e.g., Stream Deck)
	 */
	private async startWebSocketServer(): Promise<void> {
		// Don't start if already running
		if (this.wsServer) {
			return
		}

		try {
			this.wsServer = new TeleprompterWebSocketServer(this, {
				port: this.settings.wsPort,
				host: this.settings.wsHost,
			})

			await this.wsServer.start()

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
				new Notice('Teleprompter: failed to start websocket server', 5000)
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

		this.wsServer.registerCommand('set-speed', (cmd: { speed?: number }) => {
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

		this.wsServer.registerCommand('scroll-up', (cmd: { amount?: number }) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:scroll', {
					detail: { amount: -(cmd.amount || 100) },
				})
			)
		})

		this.wsServer.registerCommand('scroll-down', (cmd: { amount?: number }) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:scroll', {
					detail: { amount: cmd.amount || 100 },
				})
			)
		})

		this.wsServer.registerCommand('jump-to-header', (cmd: { index?: number }) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:jump-to-header', {
					detail: { index: cmd.index },
				})
			)
		})

		this.wsServer.registerCommand('jump-to-header-by-id', (cmd: { headerId?: string }) => {
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

		this.wsServer.registerCommand('set-font-size', (cmd: { fontSize?: number }) => {
			if (cmd.fontSize && cmd.fontSize >= this.settings.minFontSize && cmd.fontSize <= this.settings.maxFontSize) {
				this.settings.fontSize = cmd.fontSize
				void this.saveSettings()
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

		// Focus mode commands
		this.wsServer.registerCommand('toggle-focus-mode', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-focus-mode'))
		})

		this.wsServer.registerCommand('enable-focus-mode', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:enable-focus-mode'))
		})

		this.wsServer.registerCommand('disable-focus-mode', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:disable-focus-mode'))
		})

		// Countdown commands
		this.wsServer.registerCommand('countdown-increase', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:countdown-increase'))
		})

		this.wsServer.registerCommand('countdown-decrease', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:countdown-decrease'))
		})

		this.wsServer.registerCommand('set-countdown', (cmd: { seconds?: number }) => {
			window.dispatchEvent(
				new CustomEvent('teleprompter:set-countdown', {
					detail: { seconds: cmd.seconds },
				})
			)
		})

		this.wsServer.registerCommand('start-countdown', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:start-countdown'))
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

		// v0.8.0 Stream Deck commands - Letter spacing
		this.wsServer.registerCommand('letter-spacing-increase', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:letter-spacing-increase'))
		})

		this.wsServer.registerCommand('letter-spacing-decrease', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:letter-spacing-decrease'))
		})

		// v0.8.0 Stream Deck commands - Opacity
		this.wsServer.registerCommand('opacity-increase', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:opacity-increase'))
		})

		this.wsServer.registerCommand('opacity-decrease', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:opacity-decrease'))
		})

		// v0.8.0 Stream Deck commands - View mode
		this.wsServer.registerCommand('toggle-view-mode', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:toggle-view-mode'))
		})

		this.wsServer.registerCommand('set-view-mode-rendered', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:set-view-mode-rendered'))
		})

		this.wsServer.registerCommand('set-view-mode-plain', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:set-view-mode-plain'))
		})

		// v0.8.0 Stream Deck commands - Detach window
		this.wsServer.registerCommand('detach-window', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:detach-window'))
		})

		// v0.8.0 Stream Deck commands - Open file
		this.wsServer.registerCommand('open-file', (cmd: { path?: string }) => {
			const filePath = cmd.path
			if (filePath) {
				window.dispatchEvent(new CustomEvent('teleprompter:open-file', { detail: { path: filePath } }))
			}
		})

		// Open the last active file in teleprompter
		this.wsServer.registerCommand('open-active-file', () => {
			const activeFile = this.app.workspace.getActiveFile()
			if (activeFile) {
				window.dispatchEvent(new CustomEvent('teleprompter:open-file', { detail: { path: activeFile.path } }))
			}
		})

		// Voice tracking commands
		this.wsServer.registerCommand('voice-start', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:voice-start'))
		})

		this.wsServer.registerCommand('voice-stop', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:voice-stop'))
		})

		this.wsServer.registerCommand('voice-toggle', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:voice-toggle'))
		})

		this.wsServer.registerCommand('get-voice-status', () => {
			window.dispatchEvent(new CustomEvent('teleprompter:get-voice-status'))
		})

		// Network Broadcast commands (multi-device sync)
		this.wsServer.registerCommand('set-scroll-position', (cmd: { position?: number; percentage?: number }) => {
			if (cmd.position !== undefined) {
				window.dispatchEvent(new CustomEvent('teleprompter:set-scroll-position', {
					detail: { position: cmd.position }
				}))
			} else if (cmd.percentage !== undefined) {
				window.dispatchEvent(new CustomEvent('teleprompter:set-scroll-percentage', {
					detail: { percentage: cmd.percentage }
				}))
			}
		})

		this.wsServer.registerCommand('get-broadcast-status', () => {
			// Broadcast current status to requesting client
			if (this.wsServer) {
				this.broadcastState({
					networkBroadcastEnabled: this.settings.networkBroadcastEnabled,
					networkBroadcastInterval: this.settings.networkBroadcastInterval,
				})
			}
		})

		// ===== OBS Integration Commands =====
		this.wsServer.registerCommand('obs-connect', async () => {
			await this.connectOBS()
		})

		this.wsServer.registerCommand('obs-disconnect', async () => {
			await this.disconnectOBS()
		})

		this.wsServer.registerCommand('obs-get-status', () => {
			const state = this.getOBSInfo()
			if (this.wsServer) {
				this.broadcastState({
					obs: state
				})
			}
		})

		this.wsServer.registerCommand('obs-toggle-recording', async () => {
			await this.toggleOBSRecording()
		})

		this.wsServer.registerCommand('obs-start-recording', async () => {
			await this.startOBSRecording()
		})

		this.wsServer.registerCommand('obs-stop-recording', async () => {
			await this.stopOBSRecording()
		})

		this.wsServer.registerCommand('obs-toggle-streaming', async () => {
			await this.toggleOBSStreaming()
		})

		this.wsServer.registerCommand('obs-start-streaming', async () => {
			await this.startOBSStreaming()
		})

		this.wsServer.registerCommand('obs-stop-streaming', async () => {
			await this.stopOBSStreaming()
		})

		this.wsServer.registerCommand('obs-set-scene', async (cmd: { scene?: string }) => {
			if (cmd.scene) {
				await this.setOBSScene(cmd.scene)
			}
		})

		this.wsServer.registerCommand('obs-get-scenes', async () => {
			const scenes = await this.getOBSScenes()
			if (this.wsServer) {
				this.broadcastState({
					obsScenes: scenes
				})
			}
		})
	}

	/**
	 * Show WebSocket server information
	 */
	private showWebSocketInfo(): void {
		if (!this.wsServer) {
			new Notice('Websocket server not running')
			return
		}

		const info = this.wsServer.getInfo()
		const message = `WebSocket Server
Status: ${info.running ? '🟢 Running' : '🔴 Stopped'}
Address: ${info.host}:${info.port}
Clients: ${info.clientCount}

Use this address to connect from Stream Deck or other devices.`

		new Notice(message, 8000)
	}

	/**
	 * Public method to allow views to broadcast state updates
	 */
	broadcastState(state: ExtendedBroadcastState): void {
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
	getWebSocketInfo(): { running: boolean; clientCount: number; port: number; host: string; remoteUrl?: string } {
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
		await this.stopWebSocketServer()
		await this.startWebSocketServer()
	}

	// ========================================
	// OBS Integration Methods
	// ========================================

	/**
	 * Get OBS connection info
	 */
	getOBSInfo(): OBSState {
		if (this.obsService) {
			return this.obsService.getState()
		}
		return {
			status: 'disconnected',
			isRecording: false,
			isStreaming: false,
			currentScene: null,
			error: null
		}
	}

	/**
	 * Connect to OBS
	 */
	async connectOBS(): Promise<boolean> {
		if (!this.obsService) {
			this.obsService = new OBSService(this.settings)
		}
		this.obsService.updateSettings(this.settings)
		return await this.obsService.connect()
	}

	/**
	 * Disconnect from OBS
	 */
	async disconnectOBS(): Promise<void> {
		if (this.obsService) {
			await this.obsService.disconnect()
		}
	}

	/**
	 * Toggle OBS recording
	 */
	async toggleOBSRecording(): Promise<boolean> {
		if (this.obsService) {
			return await this.obsService.toggleRecording()
		}
		return false
	}

	/**
	 * Toggle OBS streaming
	 */
	async toggleOBSStreaming(): Promise<boolean> {
		if (this.obsService) {
			return await this.obsService.toggleStreaming()
		}
		return false
	}

	/**
	 * Start OBS recording
	 */
	async startOBSRecording(): Promise<boolean> {
		if (this.obsService) {
			return await this.obsService.startRecording()
		}
		return false
	}

	/**
	 * Stop OBS recording
	 */
	async stopOBSRecording(): Promise<boolean> {
		if (this.obsService) {
			return await this.obsService.stopRecording()
		}
		return false
	}

	/**
	 * Start OBS streaming
	 */
	async startOBSStreaming(): Promise<boolean> {
		if (this.obsService) {
			return await this.obsService.startStreaming()
		}
		return false
	}

	/**
	 * Stop OBS streaming
	 */
	async stopOBSStreaming(): Promise<boolean> {
		if (this.obsService) {
			return await this.obsService.stopStreaming()
		}
		return false
	}

	/**
	 * Get OBS scenes
	 */
	async getOBSScenes(): Promise<string[]> {
		if (this.obsService) {
			return await this.obsService.getScenes()
		}
		return []
	}

	/**
	 * Set OBS scene
	 */
	async setOBSScene(sceneName: string): Promise<boolean> {
		if (this.obsService) {
			return await this.obsService.setScene(sceneName)
		}
		return false
	}

	/**
	 * Load settings from disk with validation
	 */
	async loadSettings(): Promise<void> {
		const loadedData = await this.loadData()
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData)

		// Validate and sanitize loaded settings
		this.validateSettings()
	}

	/**
	 * Validate and sanitize settings to prevent tampering
	 */
	private validateSettings(): void {
		const s = this.settings
		const d = DEFAULT_SETTINGS

		// Validate numeric ranges
		s.wsPort = this.clamp(s.wsPort, 1024, 65535)
		s.fontSize = this.clamp(s.fontSize, 8, 200)
		s.minFontSize = this.clamp(s.minFontSize, 8, 100)
		s.maxFontSize = this.clamp(s.maxFontSize, 20, 200)
		s.lineHeight = this.clamp(s.lineHeight, 0.5, 5)
		s.paddingVertical = this.clamp(s.paddingVertical, 0, 500)
		s.paddingHorizontal = this.clamp(s.paddingHorizontal, 0, 500)
		s.eyelinePosition = this.clamp(s.eyelinePosition, 0, 100)
		s.defaultCountdown = this.clamp(s.defaultCountdown, 0, 3600)
		s.defaultScrollSpeed = this.clamp(s.defaultScrollSpeed, 0.1, 100)
		s.minScrollSpeed = this.clamp(s.minScrollSpeed, 0.1, 10)
		s.maxScrollSpeed = this.clamp(s.maxScrollSpeed, 1, 100)
		s.speedIncrement = this.clamp(s.speedIncrement, 0.1, 10)
		s.backgroundOpacity = this.clamp(s.backgroundOpacity, 0, 100)
		s.speakingPaceWPM = this.clamp(s.speakingPaceWPM, 50, 500)
		s.networkBroadcastInterval = this.clamp(s.networkBroadcastInterval, 50, 1000)

		// Validate host - must be valid IP or localhost
		const hostPattern = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/
		if (!hostPattern.test(s.wsHost)) {
			s.wsHost = d.wsHost
		}

		// Validate color strings (basic hex check)
		const colorPattern = /^#[0-9a-fA-F]{6}$/
		if (!colorPattern.test(s.textColor)) s.textColor = d.textColor
		if (!colorPattern.test(s.backgroundColor)) s.backgroundColor = d.backgroundColor

		// Validate font family (limit length, remove dangerous chars)
		if (typeof s.fontFamily !== 'string' || s.fontFamily.length > 100) {
			s.fontFamily = d.fontFamily
		}
		s.fontFamily = s.fontFamily.replace(/[<>'"\\]/g, '')

		// Validate voice tracking language (must be valid BCP 47 pattern)
		const langPattern = /^[a-z]{2}(-[A-Z]{2})?$/
		if (!langPattern.test(s.voiceTrackingLanguage)) {
			s.voiceTrackingLanguage = 'en-US'
		}
	}

	/**
	 * Clamp a number within bounds
	 */
	private clamp(value: number, min: number, max: number): number {
		if (typeof value !== 'number' || isNaN(value)) return min
		return Math.max(min, Math.min(max, value))
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
		void this.saveSettings()
		this.updateFontSize(newSize)
	}

	/**
	 * Decrease font size
	 */
	decreaseFontSize(): void {
		const newSize = Math.max(this.settings.fontSize - 2, this.settings.minFontSize)
		this.settings.fontSize = newSize
		void this.saveSettings()
		this.updateFontSize(newSize)
	}

	/**
	 * Handle URI Protocol actions
	 *
	 * Supported parameters:
	 * - note: File path or name to open (required for most actions)
	 * - vault: Vault name (optional, uses current vault if not specified)
	 * - play: Start playing immediately (true/false)
	 * - speed: Set scroll speed (number)
	 * - countdown: Set countdown seconds before starting
	 * - reset: Reset to top before playing (true/false)
	 *
	 * Examples:
	 * - obsidian://teleprompter-plus?note=Scripts/MyScript
	 * - obsidian://teleprompter-plus?note=MyScript&play=true
	 * - obsidian://teleprompter-plus?note=MyScript&play=true&speed=2&countdown=5
	 * - obsidian://teleprompter-plus?play=true (uses active note)
	 * - obsidian://teleprompter-plus?reset=true (reset current teleprompter)
	 */
	private async handleProtocolAction(params: Record<string, string>): Promise<void> {
		// First, open the teleprompter view
		await this.activateView()

		// Small delay to ensure view is ready
		await new Promise(resolve => setTimeout(resolve, 100))

		// Handle note parameter - open specific file
		if (params.note) {
			// Security: Sanitize note path
			const notePath = this.sanitizeNotePath(params.note)
			if (!notePath) {
				new Notice('Teleprompter: invalid note path')
				return
			}

			// Try to find the file
			let file = this.app.vault.getAbstractFileByPath(notePath)

			// If not found with exact path, try adding .md extension
			if (!file && !notePath.endsWith('.md')) {
				file = this.app.vault.getAbstractFileByPath(`${notePath}.md`)
			}

			// If still not found, search by name
			if (!file) {
				const files = this.app.vault.getMarkdownFiles()
				const searchName = notePath.toLowerCase().replace('.md', '')
				file = files.find(f =>
					f.basename.toLowerCase() === searchName ||
					f.path.toLowerCase().includes(searchName)
				) || null
			}

			if (file && file instanceof TFile) {
				// Pin this file to the teleprompter
				window.dispatchEvent(new CustomEvent('teleprompter:open-file', {
					detail: { path: file.path }
				}))

				// Wait for file to load
				await new Promise(resolve => setTimeout(resolve, 200))
			} else {
				// Security: Sanitize note name for display
				const safeName = this.sanitizeForDisplay(params.note)
				new Notice(`Teleprompter: Could not find note "${safeName}"`)
				return
			}
		}

		// Handle reset parameter
		if (params.reset === 'true') {
			window.dispatchEvent(new CustomEvent('teleprompter:reset-to-top'))
			// Wait for reset
			await new Promise(resolve => setTimeout(resolve, 100))
		}

		// Handle speed parameter
		if (params.speed) {
			const speed = parseFloat(params.speed)
			// Security: Validate speed range (0.1 to 100)
			if (!isNaN(speed) && speed >= 0.1 && speed <= 100) {
				window.dispatchEvent(new CustomEvent('teleprompter:set-speed', {
					detail: { speed }
				}))
			}
		}

		// Handle countdown parameter
		if (params.countdown) {
			const seconds = parseInt(params.countdown, 10)
			// Security: Validate countdown range (0 to 3600 = 1 hour max)
			if (!isNaN(seconds) && seconds >= 0 && seconds <= 3600) {
				window.dispatchEvent(new CustomEvent('teleprompter:set-countdown', {
					detail: { seconds }
				}))
			}
		}

		// Handle play parameter
		if (params.play === 'true') {
			// If countdown was set, it will handle starting
			// Otherwise, start immediately
			if (!params.countdown) {
				window.dispatchEvent(new CustomEvent('teleprompter:play'))
			}
		} else if (params.play === 'false') {
			window.dispatchEvent(new CustomEvent('teleprompter:pause'))
		}

		// Show success notice
		if (params.note) {
			const safeName = this.sanitizeForDisplay(params.note)
			new Notice(`Teleprompter: Opened "${safeName}"`)
		}
	}

	/**
	 * Sanitize note path to prevent path traversal attacks
	 */
	private sanitizeNotePath(path: string): string | null {
		if (!path || typeof path !== 'string') return null

		// Remove null bytes and control characters (ASCII 0-31 and 127)
		let sanitized = ''
		for (const char of path) {
			const code = char.charCodeAt(0)
			if (code >= 32 && code !== 127) {
				sanitized += char
			}
		}

		// Check for path traversal attempts
		if (sanitized.includes('..') || sanitized.startsWith('/') || sanitized.startsWith('\\')) {
			return null
		}

		// Remove dangerous characters but allow forward slashes for paths
		sanitized = sanitized.replace(/[<>:"|?*\\]/g, '')

		// Limit length
		if (sanitized.length > 500) {
			sanitized = sanitized.slice(0, 500)
		}

		return sanitized.trim() || null
	}

	/**
	 * Sanitize string for safe display in UI
	 */
	private sanitizeForDisplay(str: string): string {
		if (!str || typeof str !== 'string') return ''
		return str
			.slice(0, 100) // Limit length
			.replace(/[<>'"&]/g, '') // Remove potential XSS chars
			.trim()
	}

	/**
	 * Show What's New modal if version changed or first install
	 */
	private showWhatsNewIfNeeded(): void {
		const currentVersion = this.manifest.version
		const lastSeenVersion = this.settings.lastSeenVersion

		// Show modal if:
		// 1. First install (lastSeenVersion is empty)
		// 2. Version updated AND user hasn't disabled release notes
		const isFirstInstall = !lastSeenVersion
		const isVersionUpdated = lastSeenVersion !== currentVersion

		if ((isFirstInstall || isVersionUpdated) && this.settings.showReleaseNotes) {
			// Small delay to ensure the app is fully loaded
			setTimeout(() => {
				new WhatsNewModal(this.app, this).open()
			}, 1000)
		} else if (!this.settings.showReleaseNotes && isVersionUpdated) {
			// Silently update the version if user disabled the modal
			this.settings.lastSeenVersion = currentVersion
			void this.saveSettings()
		}
	}
}
