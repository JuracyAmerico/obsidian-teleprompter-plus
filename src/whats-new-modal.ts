import { Modal, Setting } from 'obsidian'
import type { App } from 'obsidian'
import type TeleprompterPlusPlugin from './main'

/**
 * What's New Modal - Shows release notes on first install or after update
 * Inspired by Excalidraw and QuickAdd plugins
 */
export class WhatsNewModal extends Modal {
	private plugin: TeleprompterPlusPlugin
	private version: string

	constructor(app: App, plugin: TeleprompterPlusPlugin) {
		super(app)
		this.plugin = plugin
		this.version = plugin.manifest.version
	}

	onOpen() {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('teleprompter-whats-new-modal')

		// Header with logo
		const header = contentEl.createDiv({ cls: 'whats-new-header' })

		// Logo placeholder - using text since we can't embed external images easily
		const logoContainer = header.createDiv({ cls: 'whats-new-logo' })
		logoContainer.innerHTML = `
			<svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
				<circle cx="50" cy="50" r="45" fill="#7c3aed"/>
				<text x="50" y="62" text-anchor="middle" fill="white" font-size="32" font-weight="bold" font-family="system-ui">TP+</text>
			</svg>
		`

		// Title and version
		const titleContainer = header.createDiv({ cls: 'whats-new-title-container' })
		titleContainer.createEl('h2', { text: 'Teleprompter Plus', cls: 'whats-new-title' })
		titleContainer.createEl('span', { text: `v${this.version}`, cls: 'whats-new-version' })

		// Welcome message
		const isFirstInstall = !this.plugin.settings.lastSeenVersion
		const welcomeText = isFirstInstall
			? 'Thanks for installing Teleprompter Plus! 🎉'
			: `Updated to v${this.version}! Here's what's new:`

		contentEl.createEl('p', { text: welcomeText, cls: 'whats-new-welcome' })

		// Release highlights
		const highlights = contentEl.createDiv({ cls: 'whats-new-highlights' })
		highlights.createEl('h3', { text: `What's New in v${this.version}` })

		const featureList = highlights.createEl('ul', { cls: 'whats-new-features' })

		const features = [
			{
				icon: '📱',
				title: 'Remote Web Interface',
				description: 'Control from any device on your network - phone, tablet, or second computer'
			},
			{
				icon: '⏱️',
				title: 'Countdown Timer',
				description: 'Get ready with a visual countdown before auto-scroll starts'
			},
			{
				icon: '📍',
				title: 'Section Navigation',
				description: 'Jump to headers/sections with a tap - works from mobile remote too'
			},
			{
				icon: '🎛️',
				title: 'Stream Deck Integration',
				description: '55+ actions for professional teleprompter control'
			},
			{
				icon: '🎤',
				title: 'Voice Tracking (Beta)',
				description: 'Experimental feature - scrolls as you speak'
			}
		]

		features.forEach(feature => {
			const li = featureList.createEl('li', { cls: 'whats-new-feature' })
			li.createSpan({ text: feature.icon, cls: 'feature-icon' })
			const textContainer = li.createDiv({ cls: 'feature-text' })
			textContainer.createEl('strong', { text: feature.title })
			textContainer.createEl('span', { text: ` - ${feature.description}` })
		})

		// Ko-fi support section
		const supportSection = contentEl.createDiv({ cls: 'whats-new-support' })
		supportSection.createEl('h3', { text: 'Support Development' })
		supportSection.createEl('p', {
			text: 'If Teleprompter Plus helps your workflow, consider supporting its development!',
			cls: 'support-text'
		})

		// Ko-fi button
		const kofiButton = supportSection.createEl('a', {
			href: 'https://ko-fi.com/americocanada',
			cls: 'whats-new-kofi-button',
			attr: { target: '_blank', rel: 'noopener noreferrer' }
		})
		kofiButton.innerHTML = `
			<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
				<path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>
			</svg>
			<span>Buy me a coffee</span>
		`

		// Documentation link
		const docsLink = supportSection.createEl('a', {
			href: 'https://github.com/JuracyAmerico/obsidian-teleprompter-plus',
			text: 'View documentation →',
			cls: 'whats-new-docs-link',
			attr: { target: '_blank', rel: 'noopener noreferrer' }
		})

		// Footer with checkbox and close button
		const footer = contentEl.createDiv({ cls: 'whats-new-footer' })

		// Don't show again checkbox
		new Setting(footer)
			.setName("Don't show on updates")
			.setDesc('You can re-enable this in settings')
			.addToggle(toggle => toggle
				.setValue(!this.plugin.settings.showReleaseNotes)
				.onChange(async (value) => {
					this.plugin.settings.showReleaseNotes = !value
					await this.plugin.saveSettings()
				})
			)

		// Close button
		const closeButton = footer.createEl('button', {
			text: 'Get Started',
			cls: 'whats-new-close-button mod-cta'
		})
		closeButton.addEventListener('click', () => this.close())
	}

	async onClose() {
		const { contentEl } = this
		contentEl.empty()

		// Update last seen version
		this.plugin.settings.lastSeenVersion = this.version
		await this.plugin.saveSettings()
	}
}
