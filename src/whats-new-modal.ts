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

		// Brand mark — same glyph as the ribbon icon + docs/logo.png (purple tile + white prompter mark)
		const logoContainer = header.createDiv({ cls: 'whats-new-logo' })
		const logoSvg = logoContainer.createSvg('svg', { attr: { width: '80', height: '80', viewBox: '0 0 512 512' } })
		logoSvg.createSvg('rect', { attr: { x: '16', y: '16', width: '480', height: '480', rx: '112', fill: '#7c6cf6' } })
		const mark = logoSvg.createSvg('g', { attr: { transform: 'translate(106,106) scale(12.5)', fill: 'none', stroke: '#ffffff', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } })
		mark.createSvg('rect', { attr: { x: '5', y: '4', width: '16', height: '15', rx: '2' } })
		mark.createSvg('line', { attr: { x1: '9', y1: '8', x2: '16', y2: '8', opacity: '0.5' } })
		mark.createSvg('line', { attr: { x1: '9', y1: '11.5', x2: '18', y2: '11.5' } })
		mark.createSvg('line', { attr: { x1: '9', y1: '15', x2: '14', y2: '15', opacity: '0.5' } })
		mark.createSvg('path', { attr: { d: 'M1.5 11.5 L4.5 9.8 L4.5 13.2 Z', fill: '#ffffff', stroke: 'none' } })

		// Title and version - using div instead of h2 for Obsidian plugin guidelines
		const titleContainer = header.createDiv({ cls: 'whats-new-title-container' })
		titleContainer.createDiv({ text: 'Teleprompter Plus', cls: 'whats-new-title' })  // Plugin name - intentional title case
		titleContainer.createSpan({ text: `v${this.version}`, cls: 'whats-new-version' })

		// Welcome message
		const isFirstInstall = !this.plugin.settings.lastSeenVersion
		const welcomeText = isFirstInstall
			? 'Thanks for installing! 🎉'
			: `Updated to v${this.version}! Here's what's new:`

		contentEl.createEl('p', { text: welcomeText, cls: 'whats-new-welcome' })

		// Release highlights - using Setting.setHeading() for section headers
		const highlights = contentEl.createDiv({ cls: 'whats-new-highlights' })
		new Setting(highlights).setName(`What's new in v${this.version}`).setHeading()

		const featureList = highlights.createEl('ul', { cls: 'whats-new-features' })

		const features = [
			{
				icon: '🗣️',
				title: 'Neural text-to-speech',
				description: 'Read your script aloud — ElevenLabs cloud voices, or offline Kokoro / macOS / Web Speech'
			},
			{
				icon: '🎯',
				title: 'Voice-tracked scrolling',
				description: 'The prompter follows your voice and scrolls smoothly to keep your place'
			},
			{
				icon: '🧰',
				title: 'Redesigned toolbar',
				description: 'Grouped zones, a hero Play, and a tidy More menu — fully theme-aware'
			},
			{
				icon: '⚙️',
				title: 'Native settings',
				description: 'Cleaner Obsidian-native settings with a status dashboard and density options'
			},
			{
				icon: '✨',
				title: 'A fresh look',
				description: 'Unified Lucide icon set, a new brand mark, and a re-skinned mobile remote'
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
		new Setting(supportSection).setName('Support development').setHeading()
		supportSection.createEl('p', {
			text: 'If this plugin helps your workflow, consider supporting its development!',
			cls: 'support-text'
		})

		// Ko-fi button
		const kofiButton = supportSection.createEl('a', {
			href: 'https://ko-fi.com/americocanada',
			cls: 'whats-new-kofi-button',
			attr: { target: '_blank', rel: 'noopener noreferrer' }
		})
		const kofiSvg = kofiButton.createSvg('svg', { attr: { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'currentColor' } })
		kofiSvg.createSvg('path', { attr: { d: 'M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z' } })
		kofiButton.createSpan({ text: 'Buy me a coffee' })

		// Documentation link
		supportSection.createEl('a', {
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
			text: 'Get started',
			cls: 'whats-new-close-button mod-cta'
		})
		closeButton.addEventListener('click', () => this.close())
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()

		// Update last seen version
		this.plugin.settings.lastSeenVersion = this.version
		void this.plugin.saveSettings()
	}
}
