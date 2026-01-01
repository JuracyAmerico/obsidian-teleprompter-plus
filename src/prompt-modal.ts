import { Modal, Setting } from 'obsidian'
import type { App } from 'obsidian'

/**
 * Simple prompt modal to replace native prompt() dialogs
 * Obsidian plugins should not use browser prompt() dialogs
 */
export class PromptModal extends Modal {
	private title: string
	private placeholder: string
	private defaultValue: string
	private onSubmit: (value: string) => void

	constructor(
		app: App,
		title: string,
		onSubmit: (value: string) => void,
		placeholder = '',
		defaultValue = ''
	) {
		super(app)
		this.title = title
		this.onSubmit = onSubmit
		this.placeholder = placeholder
		this.defaultValue = defaultValue
	}

	onOpen() {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('teleprompter-prompt-modal')

		// Title
		contentEl.createEl('h3', { text: this.title })

		let inputValue = this.defaultValue

		// Input field using Setting for consistency
		new Setting(contentEl)
			.addText(text => {
				text
					.setPlaceholder(this.placeholder)
					.setValue(this.defaultValue)
					.onChange(value => {
						inputValue = value
					})
				// Focus the input
				setTimeout(() => text.inputEl.focus(), 10)
				// Submit on Enter
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter' && inputValue.trim()) {
						this.onSubmit(inputValue.trim())
						this.close()
					}
				})
			})

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: 'prompt-modal-buttons' })

		// Cancel button
		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'prompt-modal-button'
		})
		cancelButton.addEventListener('click', () => {
			this.close()
		})

		// Submit button
		const submitButton = buttonContainer.createEl('button', {
			text: 'OK',
			cls: 'prompt-modal-button mod-cta'
		})
		submitButton.addEventListener('click', () => {
			if (inputValue.trim()) {
				this.onSubmit(inputValue.trim())
				this.close()
			}
		})
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}
