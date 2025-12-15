import { PluginSettingTab, Setting, setIcon, Notice } from 'obsidian'
import type { App } from 'obsidian'
import type TeleprompterPlusPlugin from './main'

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

// Hotkey configuration (key -> action)
export interface HotkeyConfig {
	[key: string]: HotkeyAction
}

export interface TeleprompterSettings {
	wsPort: number
	wsHost: string
	autoStartWebSocket: boolean
	showConnectionNotifications: boolean
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
	// Transparency settings
	backgroundOpacity: number // 0-100 (0 = fully transparent, 100 = opaque)
	enableBackgroundTransparency: boolean
	// Custom hotkeys
	customHotkeys: HotkeyConfig
	// Double-click to edit
	doubleClickToEdit: boolean
	// Developer settings
	debugMode: boolean
}

export const DEFAULT_SETTINGS: TeleprompterSettings = {
	wsPort: 8765,
	wsHost: '127.0.0.1',
	autoStartWebSocket: true,
	showConnectionNotifications: true,
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
	},
	// Double-click to edit
	doubleClickToEdit: true,
	// Developer settings
	debugMode: false,
}

export class TeleprompterSettingTab extends PluginSettingTab {
	plugin: TeleprompterPlusPlugin
	private statusInterval: NodeJS.Timeout | null = null
	private activeTab: string = 'appearance'

	constructor(app: App, plugin: TeleprompterPlusPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		// Header
		containerEl.createEl('h2', { text: 'Teleprompter Plus Settings' })

		// Tab navigation
		const tabContainer = containerEl.createDiv('teleprompter-tabs')
		const tabs = [
			{ id: 'appearance', name: 'Appearance', icon: 'palette' },
			{ id: 'playback', name: 'Playback', icon: 'play' },
			{ id: 'display', name: 'Display', icon: 'monitor' },
			{ id: 'advanced', name: 'Advanced', icon: 'settings' },
			{ id: 'about', name: 'About', icon: 'info' },
		]

		tabs.forEach((tab) => {
			const tabButton = tabContainer.createEl('button', {
				cls: this.activeTab === tab.id ? 'teleprompter-tab active' : 'teleprompter-tab',
				text: tab.name,
			})
			tabButton.addEventListener('click', () => {
				this.activeTab = tab.id
				this.display()
			})
		})

		// Tab content container
		const contentContainer = containerEl.createDiv('teleprompter-tab-content')

		// Render active tab content
		switch (this.activeTab) {
			case 'appearance':
				this.displayAppearanceTab(contentContainer)
				break
			case 'playback':
				this.displayPlaybackTab(contentContainer)
				break
			case 'display':
				this.displayDisplayTab(contentContainer)
				break
			case 'advanced':
				this.displayAdvancedTab(contentContainer)
				break
			case 'about':
				this.displayAboutTab(contentContainer)
				break
		}
	}

	private displayAppearanceTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Customize the visual appearance of the teleprompter display',
			cls: 'setting-item-description',
		})

		// Quick Setup Presets Section
		const quickSetupContainer = containerEl.createDiv('quick-setup-container')
		quickSetupContainer.createEl('h3', { text: 'Quick Setup Presets' })
		quickSetupContainer.createEl('p', {
			text: 'One-click complete configurations for common use cases',
			cls: 'setting-item-description',
		})

		const presetsGrid = quickSetupContainer.createDiv('quick-setup-presets')

		const completePresets = [
			{
				name: 'Professional',
				icon: 'monitor',
				desc: 'Corporate presentations',
				config: {
					fontSize: 24,
					textColor: '#e0e0e0',
					backgroundColor: '#1e1e1e',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
					lineHeight: 1.8,
					paddingVertical: 20,
					paddingHorizontal: 40,
				}
			},
			{
				name: 'Broadcast',
				icon: 'radio-tower',
				desc: 'News anchor, professional video',
				config: {
					fontSize: 36,
					textColor: '#ffffff',
					backgroundColor: '#000000',
					fontFamily: 'Verdana, Tahoma, "DejaVu Sans", sans-serif',
					lineHeight: 2.0,
					paddingVertical: 30,
					paddingHorizontal: 60,
				}
			},
			{
				name: 'Presentation',
				icon: 'presentation',
				desc: 'Conference talks, large screens',
				config: {
					fontSize: 48,
					textColor: '#2e2e2e',
					backgroundColor: '#f5f5f5',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
					lineHeight: 1.6,
					paddingVertical: 40,
					paddingHorizontal: 80,
				}
			},
			{
				name: 'Cinema',
				icon: 'film',
				desc: 'Film credits, dramatic reading',
				config: {
					fontSize: 32,
					textColor: '#ffffff',
					backgroundColor: '#000000',
					fontFamily: 'Georgia, "Times New Roman", Times, serif',
					lineHeight: 1.9,
					paddingVertical: 25,
					paddingHorizontal: 50,
				}
			},
			{
				name: 'Green Screen',
				icon: 'square-dashed',
				desc: 'Video production with chroma key',
				config: {
					fontSize: 32,
					textColor: '#ffffff',
					backgroundColor: '#00ff00',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
					lineHeight: 1.8,
					paddingVertical: 25,
					paddingHorizontal: 45,
				}
			},
			{
				name: 'Stream',
				icon: 'wifi',
				desc: 'Twitch/YouTube streaming',
				config: {
					fontSize: 28,
					textColor: '#ffffff',
					backgroundColor: '#000000',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
					lineHeight: 1.7,
					paddingVertical: 20,
					paddingHorizontal: 40,
				}
			},
			{
				name: 'Practice',
				icon: 'timer',
				desc: 'Rehearsal, easy on eyes',
				config: {
					fontSize: 20,
					textColor: '#5c4a2f',
					backgroundColor: '#f4ecd8',
					fontFamily: 'inherit',
					lineHeight: 1.6,
					paddingVertical: 15,
					paddingHorizontal: 30,
				}
			},
			{
				name: 'Accessibility',
				icon: 'accessibility',
				desc: 'High contrast, large text',
				config: {
					fontSize: 40,
					textColor: '#ffffff',
					backgroundColor: '#000000',
					fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
					lineHeight: 2.2,
					paddingVertical: 35,
					paddingHorizontal: 70,
				}
			},
		]

		completePresets.forEach(preset => {
			console.log('[Teleprompter] Creating quick setup button for:', preset.name)

			const btn = presetsGrid.createEl('button', {
				cls: 'quick-setup-button',
				type: 'button',
			})

			const iconContainer = btn.createDiv({ cls: 'quick-setup-icon' })
			setIcon(iconContainer, preset.icon)

			btn.createDiv({ text: preset.name, cls: 'quick-setup-name' })
			btn.createDiv({ text: preset.desc, cls: 'quick-setup-desc' })

			btn.addEventListener('click', async () => {
				console.log('[Teleprompter] ========================================')
				console.log('[Teleprompter] Quick Setup Preset clicked:', preset.name)
				console.log('[Teleprompter] Current settings BEFORE:', JSON.stringify({
					fontSize: this.plugin.settings.fontSize,
					textColor: this.plugin.settings.textColor,
					backgroundColor: this.plugin.settings.backgroundColor,
					fontFamily: this.plugin.settings.fontFamily,
					lineHeight: this.plugin.settings.lineHeight,
					paddingVertical: this.plugin.settings.paddingVertical,
					paddingHorizontal: this.plugin.settings.paddingHorizontal,
				}, null, 2))

				console.log('[Teleprompter] Applying preset config:', JSON.stringify(preset.config, null, 2))

				try {
					Object.assign(this.plugin.settings, preset.config)
					console.log('[Teleprompter] Settings object updated')

					await this.plugin.saveSettings()
					console.log('[Teleprompter] Settings saved to disk')

					// Apply settings to all active teleprompter views
					this.plugin.applyAllSettings()
					console.log('[Teleprompter] Settings broadcast to all active teleprompter views')

					console.log('[Teleprompter] Current settings AFTER:', JSON.stringify({
						fontSize: this.plugin.settings.fontSize,
						textColor: this.plugin.settings.textColor,
						backgroundColor: this.plugin.settings.backgroundColor,
						fontFamily: this.plugin.settings.fontFamily,
						lineHeight: this.plugin.settings.lineHeight,
						paddingVertical: this.plugin.settings.paddingVertical,
						paddingHorizontal: this.plugin.settings.paddingHorizontal,
					}, null, 2))

					new Notice(`✓ Applied "${preset.name}" preset - Check your teleprompter view!`)
					console.log('[Teleprompter] Notice displayed')

					console.log('[Teleprompter] Refreshing settings display...')
					this.display() // Refresh to show new values in settings UI
					console.log('[Teleprompter] Settings UI refreshed')
					console.log('[Teleprompter] ========================================')
				} catch (error) {
					console.error('[Teleprompter] ERROR applying preset:', error)
					new Notice(`✗ Failed to apply "${preset.name}" preset`)
				}
			})
		})

		// Transparency Section
		containerEl.createEl('h3', { text: 'Background Transparency' })
		containerEl.createEl('p', {
			text: 'Make the teleprompter background semi-transparent to see through to camera/audience',
			cls: 'setting-item-description',
		})

		// Enable Transparency
		new Setting(containerEl)
			.setName('Enable background transparency')
			.setDesc('Allow background to be semi-transparent (requires reloading teleprompter view)')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBackgroundTransparency)
					.onChange(async (value) => {
						this.plugin.settings.enableBackgroundTransparency = value
						await this.plugin.saveSettings()
						this.plugin.applyAllSettings()
					})
			)

		// Background Opacity
		new Setting(containerEl)
			.setName('Background opacity')
			.setDesc('Background opacity level (0 = fully transparent, 100 = fully opaque)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.backgroundOpacity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.backgroundOpacity = value
						await this.plugin.saveSettings()
						this.plugin.applyAllSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (100% opaque)')
					.onClick(async () => {
						this.plugin.settings.backgroundOpacity = DEFAULT_SETTINGS.backgroundOpacity
						await this.plugin.saveSettings()
						this.plugin.applyAllSettings()
						this.display()
					})
			)

		// Typography Section
		containerEl.createEl('h3', { text: 'Typography' })

		// Font Size
		new Setting(containerEl)
			.setName('Font size')
			.setDesc('Text size for the teleprompter (12-72px)')
			.addSlider((slider) =>
				slider
					.setLimits(this.plugin.settings.minFontSize, this.plugin.settings.maxFontSize, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fontSize = value
						await this.plugin.saveSettings()
						this.plugin.updateFontSize(value)
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (24px)')
					.onClick(async () => {
						this.plugin.settings.fontSize = DEFAULT_SETTINGS.fontSize
						await this.plugin.saveSettings()
						this.plugin.updateFontSize(DEFAULT_SETTINGS.fontSize)
						this.display() // Refresh to update slider
					})
			)

		// Line Height
		new Setting(containerEl)
			.setName('Line height')
			.setDesc('Space between lines (1.0-3.0x)')
			.addSlider((slider) =>
				slider
					.setLimits(1.0, 3.0, 0.1)
					.setValue(this.plugin.settings.lineHeight)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.lineHeight = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (1.8x)')
					.onClick(async () => {
						this.plugin.settings.lineHeight = DEFAULT_SETTINGS.lineHeight
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Vertical Padding
		new Setting(containerEl)
			.setName('Vertical padding')
			.setDesc('Space above and below content (0-100px)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.paddingVertical)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.paddingVertical = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (20px)')
					.onClick(async () => {
						this.plugin.settings.paddingVertical = DEFAULT_SETTINGS.paddingVertical
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Horizontal Padding
		new Setting(containerEl)
			.setName('Horizontal padding')
			.setDesc('Space on left and right sides (0-200px)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 200, 10)
					.setValue(this.plugin.settings.paddingHorizontal)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.paddingHorizontal = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (40px)')
					.onClick(async () => {
						this.plugin.settings.paddingHorizontal = DEFAULT_SETTINGS.paddingHorizontal
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Text Color
		const textColorSetting = new Setting(containerEl)
			.setName('Text color')
			.setDesc('Color for body text')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.textColor)
					.setPlaceholder('#e0e0e0')
					.onChange(async (value) => {
						if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
							this.plugin.settings.textColor = value
							await this.plugin.saveSettings()
						}
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (#e0e0e0)')
					.onClick(async () => {
						this.plugin.settings.textColor = DEFAULT_SETTINGS.textColor
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Add color picker
		const textColorPicker = textColorSetting.controlEl.createEl('input', {
			type: 'color',
			value: this.plugin.settings.textColor,
		})
		textColorPicker.style.marginLeft = '8px'
		textColorPicker.style.width = '50px'
		textColorPicker.style.height = '30px'
		textColorPicker.style.border = '2px solid var(--background-modifier-border)'
		textColorPicker.style.borderRadius = '4px'
		textColorPicker.style.cursor = 'pointer'
		textColorPicker.addEventListener('input', async (e) => {
			const value = (e.target as HTMLInputElement).value
			this.plugin.settings.textColor = value
			await this.plugin.saveSettings()
			// Update the text input to show the new value
			const textInput = textColorSetting.controlEl.querySelector('input[type="text"]') as HTMLInputElement
			if (textInput) textInput.value = value
		})

		// Background Color
		const bgColorSetting = new Setting(containerEl)
			.setName('Background color')
			.setDesc('Background color for content area')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.backgroundColor)
					.setPlaceholder('#1e1e1e')
					.onChange(async (value) => {
						if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
							this.plugin.settings.backgroundColor = value
							await this.plugin.saveSettings()
						}
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (#1e1e1e)')
					.onClick(async () => {
						this.plugin.settings.backgroundColor = DEFAULT_SETTINGS.backgroundColor
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Add color picker
		const bgColorPicker = bgColorSetting.controlEl.createEl('input', {
			type: 'color',
			value: this.plugin.settings.backgroundColor,
		})
		bgColorPicker.style.marginLeft = '8px'
		bgColorPicker.style.width = '50px'
		bgColorPicker.style.height = '30px'
		bgColorPicker.style.border = '2px solid var(--background-modifier-border)'
		bgColorPicker.style.borderRadius = '4px'
		bgColorPicker.style.cursor = 'pointer'
		bgColorPicker.addEventListener('input', async (e) => {
			const value = (e.target as HTMLInputElement).value
			this.plugin.settings.backgroundColor = value
			await this.plugin.saveSettings()
			// Update the text input to show the new value
			const textInput = bgColorSetting.controlEl.querySelector('input[type="text"]') as HTMLInputElement
			if (textInput) textInput.value = value
		})

		// Color Presets
		containerEl.createEl('h4', { text: 'Quick Color Presets' })
		containerEl.createEl('p', {
			text: 'One-click color schemes for different use cases',
			cls: 'setting-item-description',
		})
		const presetsContainer = containerEl.createDiv('color-presets-container')

		const presets = [
			{ name: 'Dark', icon: 'tp-color-dark', text: '#e0e0e0', bg: '#1e1e1e', desc: 'Default dark theme' },
			{ name: 'Light', icon: 'tp-color-light', text: '#2e2e2e', bg: '#f5f5f5', desc: 'Light background' },
			{ name: 'Black', icon: 'tp-color-black', text: '#ffffff', bg: '#000000', desc: 'Pure black' },
			{ name: 'Sepia', icon: 'tp-color-sepia', text: '#5c4a2f', bg: '#f4ecd8', desc: 'Easy on eyes' },
			{ name: 'Green', icon: 'tp-color-green', text: '#33ff33', bg: '#000000', desc: 'Matrix style' },
			{ name: 'Amber', icon: 'tp-color-amber', text: '#ffb000', bg: '#000000', desc: 'Amber terminal' },
			{ name: 'High Contrast', icon: 'tp-color-high-contrast', text: '#ffffff', bg: '#000000', desc: 'Maximum contrast' },
			{ name: 'News Anchor', icon: 'tp-color-news', text: '#ffeb3b', bg: '#0d47a1', desc: 'Professional broadcast' },
			{ name: 'Green Screen', icon: 'tp-color-greenscreen', text: '#ffffff', bg: '#00ff00', desc: 'Chroma key ready' },
		]

		presets.forEach(preset => {
			const button = presetsContainer.createEl('button', {
				cls: 'mod-cta preset-button',
				type: 'button',
			})
			setIcon(button, preset.icon)
			const label = button.createSpan({ text: preset.name, cls: 'preset-label' })
			button.addEventListener('click', async () => {
				console.log('[Teleprompter] Color preset clicked:', preset.name, preset.text, preset.bg)
				this.plugin.settings.textColor = preset.text
				this.plugin.settings.backgroundColor = preset.bg
				await this.plugin.saveSettings()
				console.log('[Teleprompter] Settings saved, refreshing display')

				// Update the color pickers and text inputs immediately
				const textColorPicker = containerEl.querySelector('input[type="color"]') as HTMLInputElement
				const bgColorPicker = containerEl.querySelectorAll('input[type="color"]')[1] as HTMLInputElement
				const textColorInput = textColorSetting.controlEl.querySelector('input[type="text"]') as HTMLInputElement
				const bgColorInput = bgColorSetting.controlEl.querySelector('input[type="text"]') as HTMLInputElement

				if (textColorPicker) textColorPicker.value = preset.text
				if (bgColorPicker) bgColorPicker.value = preset.bg
				if (textColorInput) textColorInput.value = preset.text
				if (bgColorInput) bgColorInput.value = preset.bg
			})
		})

		// Font Family
		containerEl.createEl('h4', { text: 'Font Family' })
		new Setting(containerEl)
			.setName('Font family')
			.setDesc('Choose a font family for the teleprompter')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('inherit', 'System Default')
					.addOption('-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', 'Sans-serif (Modern)')
					.addOption('Georgia, "Times New Roman", Times, serif', 'Serif (Traditional)')
					.addOption('"Courier New", Courier, Monaco, "Lucida Console", monospace', 'Monospace (Code)')
					.addOption('Verdana, Tahoma, "DejaVu Sans", sans-serif', 'Readable (Verdana)')
					.addOption('"Courier New", "Rockwell", "Courier", monospace', 'Slab Serif (Bold)')
					.setValue(this.plugin.settings.fontFamily)
					.onChange(async (value) => {
						this.plugin.settings.fontFamily = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (System)')
					.onClick(async () => {
						this.plugin.settings.fontFamily = DEFAULT_SETTINGS.fontFamily
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Font Presets
		containerEl.createEl('h5', { text: 'Quick Presets' })
		const fontPresetsContainer = containerEl.createDiv('font-presets-container')

		const fontPresets = [
			{ name: 'System', icon: 'tp-font-system', value: 'inherit' },
			{ name: 'Sans', icon: 'tp-font-sans', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
			{ name: 'Serif', icon: 'tp-font-serif', value: 'Georgia, "Times New Roman", Times, serif' },
			{ name: 'Mono', icon: 'tp-font-mono', value: '"Courier New", Courier, Monaco, "Lucida Console", monospace' },
			{ name: 'Readable', icon: 'tp-font-readable', value: 'Verdana, Tahoma, "DejaVu Sans", sans-serif' },
			{ name: 'Slab', icon: 'tp-font-slab', value: '"Courier New", "Rockwell", "Courier", monospace' },
		]

		fontPresets.forEach(preset => {
			const button = fontPresetsContainer.createEl('button', {
				cls: 'mod-cta preset-button',
			})
			setIcon(button, preset.icon)
			const label = button.createSpan({ text: preset.name, cls: 'preset-label' })
			button.style.marginRight = '8px'
			button.style.marginBottom = '8px'
			button.addEventListener('click', async () => {
				this.plugin.settings.fontFamily = preset.value
				await this.plugin.saveSettings()
				this.display()
			})
		})

		// Flip Controls (stays in Appearance tab)
		containerEl.createEl('h3', { text: 'Transform' })
		containerEl.createEl('p', {
			text: 'Mirror the display for teleprompter hardware or special setups',
			cls: 'setting-item-description',
		})

		new Setting(containerEl)
			.setName('Horizontal flip')
			.setDesc('Mirror text left-to-right (for teleprompter mirrors)')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.flipHorizontal).onChange(async (value) => {
					this.plugin.settings.flipHorizontal = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Vertical flip')
			.setDesc('Flip text upside-down (for ceiling-mounted displays)')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.flipVertical).onChange(async (value) => {
					this.plugin.settings.flipVertical = value
					await this.plugin.saveSettings()
				})
			)
	}

	private displayPlaybackTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Configure auto-scroll behavior, speed, and countdown settings',
			cls: 'setting-item-description',
		})

		// Countdown Settings
		containerEl.createEl('h3', { text: 'Countdown' })

		// Default Countdown Duration
		new Setting(containerEl)
			.setName('Default countdown duration')
			.setDesc('Countdown seconds before auto-scroll starts (0-30 seconds)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 30, 1)
					.setValue(this.plugin.settings.defaultCountdown)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.defaultCountdown = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (5 seconds)')
					.onClick(async () => {
						this.plugin.settings.defaultCountdown = DEFAULT_SETTINGS.defaultCountdown
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Scroll Speed Settings
		containerEl.createEl('h3', { text: 'Scroll Speed' })

		// Default Scroll Speed
		new Setting(containerEl)
			.setName('Default scroll speed')
			.setDesc('Initial scroll speed when opening teleprompter (0.5-10)')
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 10, 0.5)
					.setValue(this.plugin.settings.defaultScrollSpeed)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.defaultScrollSpeed = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (2)')
					.onClick(async () => {
						this.plugin.settings.defaultScrollSpeed = DEFAULT_SETTINGS.defaultScrollSpeed
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Speed Increment
		new Setting(containerEl)
			.setName('Speed adjustment amount')
			.setDesc('How much speed changes with each +/- button press (0.1-2)')
			.addSlider((slider) =>
				slider
					.setLimits(0.1, 2, 0.1)
					.setValue(this.plugin.settings.speedIncrement)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.speedIncrement = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (0.5)')
					.onClick(async () => {
						this.plugin.settings.speedIncrement = DEFAULT_SETTINGS.speedIncrement
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Auto Start Playing
		new Setting(containerEl)
			.setName('Auto-start playback')
			.setDesc('Automatically start playing when teleprompter opens')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoStartPlaying)
					.onChange(async (value) => {
						this.plugin.settings.autoStartPlaying = value
						await this.plugin.saveSettings()
					})
			)
	}

	private displayDisplayTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Configure visual elements, reading aids, and navigation',
			cls: 'setting-item-description',
		})

		// Eyeline Settings
		containerEl.createEl('h3', { text: 'Eyeline Indicator' })

		// Show Eyeline
		new Setting(containerEl)
			.setName('Show eyeline indicator')
			.setDesc('Display a visual reading line at a fixed position')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showEyeline)
					.onChange(async (value) => {
						this.plugin.settings.showEyeline = value
						await this.plugin.saveSettings()
					})
			)

		// Eyeline Position
		new Setting(containerEl)
			.setName('Eyeline position')
			.setDesc('Vertical position of the eyeline indicator (0-100%)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.eyelinePosition)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.eyelinePosition = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (50% - middle)')
					.onClick(async () => {
						this.plugin.settings.eyelinePosition = DEFAULT_SETTINGS.eyelinePosition
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Auto Full-Screen
		new Setting(containerEl)
			.setName('Auto full-screen on play')
			.setDesc('Automatically enter full-screen mode when starting playback')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoFullScreen)
					.onChange(async (value) => {
						this.plugin.settings.autoFullScreen = value
						await this.plugin.saveSettings()
					})
			)

		// Keep Awake
		new Setting(containerEl)
			.setName('Keep screen awake')
			.setDesc('Prevent screen sleep by default when teleprompter is open')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.keepAwake)
					.onChange(async (value) => {
						this.plugin.settings.keepAwake = value
						await this.plugin.saveSettings()
					})
			)

		// Navigation Panel Settings
		containerEl.createEl('h3', { text: 'Navigation & Minimap' })

		// Show Minimap
		new Setting(containerEl)
			.setName('Show minimap')
			.setDesc('Display document minimap on right side with headers and current position')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showMinimap).onChange(async (value) => {
					this.plugin.settings.showMinimap = value
					await this.plugin.saveSettings()
				})
			)

		// Scroll Synchronization
		new Setting(containerEl)
			.setName('Enable scroll sync')
			.setDesc('When teleprompter scrolls to a section, editor scrolls to match')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.scrollSyncEnabled).onChange(async (value) => {
					this.plugin.settings.scrollSyncEnabled = value
					await this.plugin.saveSettings()
				})
			)

		// Default Navigation Width
		new Setting(containerEl)
			.setName('Default navigation width')
			.setDesc('Initial width of navigation panel in pixels (150-500)')
			.addSlider((slider) =>
				slider
					.setLimits(150, 500, 10)
					.setValue(this.plugin.settings.defaultNavigationWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.defaultNavigationWidth = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (250px)')
					.onClick(async () => {
						this.plugin.settings.defaultNavigationWidth = DEFAULT_SETTINGS.defaultNavigationWidth
						await this.plugin.saveSettings()
						this.display()
					})
			)

		// Remember Navigation State
		new Setting(containerEl)
			.setName('Remember navigation state')
			.setDesc('Remember if navigation panel was open/closed between sessions')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.rememberNavigationState)
					.onChange(async (value) => {
						this.plugin.settings.rememberNavigationState = value
						await this.plugin.saveSettings()
					})
			)

		// Time Estimation Settings
		containerEl.createEl('h3', { text: 'Time Estimation & Timer' })

		// Show Time Estimation
		new Setting(containerEl)
			.setName('Show time estimation')
			.setDesc('Display estimated remaining time based on scroll speed and speaking pace')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTimeEstimation)
					.onChange(async (value) => {
						this.plugin.settings.showTimeEstimation = value
						await this.plugin.saveSettings()
					})
			)

		// Show Elapsed Time
		new Setting(containerEl)
			.setName('Show elapsed time')
			.setDesc('Display chronometer showing time since playback started')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showElapsedTime)
					.onChange(async (value) => {
						this.plugin.settings.showElapsedTime = value
						await this.plugin.saveSettings()
					})
			)

		// Speaking Pace WPM
		new Setting(containerEl)
			.setName('Speaking pace (WPM)')
			.setDesc('Words per minute for time estimation (100-250, typical: 150)')
			.addSlider((slider) =>
				slider
					.setLimits(100, 250, 10)
					.setValue(this.plugin.settings.speakingPaceWPM)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.speakingPaceWPM = value
						await this.plugin.saveSettings()
					})
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Reset to default (150 WPM)')
					.onClick(async () => {
						this.plugin.settings.speakingPaceWPM = DEFAULT_SETTINGS.speakingPaceWPM
						await this.plugin.saveSettings()
						this.display()
					})
			)
	}

	private displayAdvancedTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'WebSocket server and developer settings',
			cls: 'setting-item-description',
		})

		// Developer Settings Section
		containerEl.createEl('h3', { text: 'Developer' })
		containerEl.createEl('p', {
			text: 'Debug and troubleshooting options',
			cls: 'setting-item-description',
		})

		// Debug Mode
		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Enable verbose console logging for troubleshooting (requires reload)')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value) => {
						this.plugin.settings.debugMode = value
						await this.plugin.saveSettings()
					})
			)

		// WebSocket Server Section
		containerEl.createEl('h3', { text: 'WebSocket Server' })
		containerEl.createEl('p', {
			text: 'Configure the WebSocket server for external control (e.g., Stream Deck integration)',
			cls: 'setting-item-description',
		})

		// Auto-start WebSocket
		new Setting(containerEl)
			.setName('Auto-start WebSocket server')
			.setDesc('Automatically start the WebSocket server when Obsidian loads')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoStartWebSocket)
					.onChange(async (value) => {
						this.plugin.settings.autoStartWebSocket = value
						await this.plugin.saveSettings()
					})
			)

		// WebSocket Port
		new Setting(containerEl)
			.setName('WebSocket port')
			.setDesc('Port number for the WebSocket server (requires restart)')
			.addText((text) =>
				text
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

		// WebSocket Host
		new Setting(containerEl)
			.setName('WebSocket host')
			.setDesc('Host address for the WebSocket server (127.0.0.1 recommended for security)')
			.addText((text) =>
				text
					.setPlaceholder('127.0.0.1')
					.setValue(this.plugin.settings.wsHost)
					.onChange(async (value) => {
						this.plugin.settings.wsHost = value
						await this.plugin.saveSettings()
					})
			)

		// Connection Notifications
		new Setting(containerEl)
			.setName('Show connection notifications')
			.setDesc('Display notifications when WebSocket server starts/stops and when clients connect')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showConnectionNotifications)
					.onChange(async (value) => {
						this.plugin.settings.showConnectionNotifications = value
						await this.plugin.saveSettings()
					})
			)

		// Server Status Display
		const statusSetting = new Setting(containerEl)
			.setName('Server status')
			.setDesc('Current WebSocket server status')

		const statusEl = statusSetting.descEl.createEl('div', {
			cls: 'teleprompter-status',
		})

		this.updateServerStatus(statusEl)

		// Clean up previous interval if exists
		if (this.statusInterval) {
			clearInterval(this.statusInterval)
		}

		// Refresh status every 2 seconds
		this.statusInterval = setInterval(() => {
			this.updateServerStatus(statusEl)
		}, 2000)

		// Manual control buttons
		new Setting(containerEl)
			.setName('Manual control')
			.setDesc('Manually start or stop the WebSocket server')
			.addButton((button) =>
				button.setButtonText('Restart server').onClick(async () => {
					button.setDisabled(true)
					button.setButtonText('Restarting...')
					await this.plugin.restartWebSocketServer()
					button.setButtonText('Restart server')
					button.setDisabled(false)
					this.updateServerStatus(statusEl)
				})
			)
	}

	private displayAboutTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Plugin information, documentation, and Stream Deck integration',
			cls: 'setting-item-description',
		})

		// Plugin Info
		containerEl.createEl('h3', { text: 'About Teleprompter Plus' })

		const infoEl = containerEl.createDiv({ cls: 'setting-item-description' })
		infoEl.createEl('p', {
			text: 'Professional teleprompter solution for Obsidian with advanced features including:',
		})

		const featureList = infoEl.createEl('ul')
		featureList.createEl('li', { text: 'Auto-scroll with adjustable speed and countdown' })
		featureList.createEl('li', { text: '46 custom icons for intuitive control' })
		featureList.createEl('li', { text: 'Full-screen mode with persistent toolbar' })
		featureList.createEl('li', { text: 'Document navigation and minimap' })
		featureList.createEl('li', { text: 'Stream Deck integration via WebSocket' })
		featureList.createEl('li', { text: 'Customizable typography, colors, and layout' })

		// Stream Deck Integration Help
		containerEl.createEl('h3', { text: 'Stream Deck Integration' })

		const helpText = containerEl.createDiv({ cls: 'setting-item-description' })
		helpText.createEl('p', {
			text: 'Control Teleprompter Plus from your Elgato Stream Deck:',
		})

		const helpList = helpText.createEl('ol')
		helpList.createEl('li', { text: 'Enable WebSocket server in Advanced settings' })
		helpList.createEl('li', { text: 'Ensure the server is running (check Advanced tab for status)' })
		helpList.createEl('li', { text: 'Install the companion Stream Deck plugin' })
		helpList.createEl('li', {
			text: 'Stream Deck connects to ws://127.0.0.1:' + this.plugin.settings.wsPort,
		})

		helpText.createEl('p', {
			text: '🔒 For security, the server only accepts connections from localhost (127.0.0.1).',
		})

		helpText.createEl('p', {
			text: '💡 Tip: Stream Deck icons follow the same design as the in-app toolbar for consistency.',
		})

		// Documentation Links
		containerEl.createEl('h3', { text: 'Documentation & Support' })

		new Setting(containerEl)
			.setName('View documentation')
			.setDesc('Complete guide to using Teleprompter Plus')
			.addButton((button) =>
				button.setButtonText('Open docs').onClick(() => {
					window.open(
						'https://github.com/yourusername/obsidian-teleprompter-plus#readme'
					)
				})
			)

		new Setting(containerEl)
			.setName('Stream Deck integration guide')
			.setDesc('Learn how to control Teleprompter Plus from Stream Deck')
			.addButton((button) =>
				button.setButtonText('View guide').onClick(() => {
					window.open(
						'https://github.com/yourusername/obsidian-teleprompter-plus#stream-deck-integration'
					)
				})
			)

		new Setting(containerEl)
			.setName('Report an issue')
			.setDesc('Found a bug or have a feature request?')
			.addButton((button) =>
				button.setButtonText('GitHub Issues').onClick(() => {
					window.open(
						'https://github.com/yourusername/obsidian-teleprompter-plus/issues'
					)
				})
			)

		// Settings Management
		containerEl.createEl('h3', { text: 'Settings Management' })

		new Setting(containerEl)
			.setName('Export Settings')
			.setDesc('Save your current settings configuration to a JSON file')
			.addButton((button) =>
				button
					.setButtonText('Export')
					.setCta()
					.onClick(async () => {
						const settingsJSON = JSON.stringify(this.plugin.settings, null, 2)
						const blob = new Blob([settingsJSON], { type: 'application/json' })
						const url = URL.createObjectURL(blob)

						const a = document.createElement('a')
						a.href = url
						a.download = `teleprompter-settings-${Date.now()}.json`
						a.click()
						URL.revokeObjectURL(url)

						new Notice('✓ Settings exported successfully')
					})
			)

		new Setting(containerEl)
			.setName('Import Settings')
			.setDesc('Load settings from a previously exported JSON file')
			.addButton((button) =>
				button
					.setButtonText('Import')
					.onClick(() => {
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

									// Validate imported settings
									const validKeys = Object.keys(DEFAULT_SETTINGS)
									const importedFiltered: any = {}

									for (const key of validKeys) {
										if (key in imported) {
											importedFiltered[key] = imported[key]
										}
									}

									Object.assign(this.plugin.settings, importedFiltered)
									await this.plugin.saveSettings()
									this.display()

									new Notice('✓ Settings imported successfully')
								} catch (error) {
									new Notice('✗ Failed to import settings: Invalid file format')
									console.error('[Teleprompter] Import error:', error)
								}
							}
							reader.readAsText(file)
						}
						input.click()
					})
			)

		new Setting(containerEl)
			.setName('Reset to Defaults')
			.setDesc('Reset all settings to their default values')
			.addButton((button) =>
				button
					.setButtonText('Reset All')
					.setWarning()
					.onClick(async () => {
						if (confirm('Are you sure you want to reset ALL settings to defaults? This cannot be undone.')) {
							Object.assign(this.plugin.settings, DEFAULT_SETTINGS)
							await this.plugin.saveSettings()
							this.display()
							new Notice('✓ Settings reset to defaults')
						}
					})
			)

		// Credits
		containerEl.createEl('h3', { text: 'Credits' })
		const creditsEl = containerEl.createDiv({ cls: 'setting-item-description' })
		creditsEl.createEl('p', {
			text: 'Built with ❤️ for the Obsidian community',
		})
		creditsEl.createEl('p', {
			text: '🎨 46 custom icons designed for optimal clarity and usability',
		})
		creditsEl.createEl('p', {
			text: '⚡ Powered by Svelte 5 and Obsidian Plugin API',
		})
	}

	/**
	 * Called when the settings tab is hidden
	 */
	hide(): void {
		// Clean up the status interval
		if (this.statusInterval) {
			clearInterval(this.statusInterval)
			this.statusInterval = null
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
