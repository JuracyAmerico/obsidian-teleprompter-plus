import { Modal } from 'obsidian'
import type { App } from 'obsidian'

/**
 * Simple confirmation modal to replace native confirm() dialogs
 * Obsidian plugins should not use browser confirm() dialogs
 */
export class ConfirmModal extends Modal {
	private message: string
	private onConfirm: () => void
	private onCancel?: () => void
	private details: string[]

	constructor(
		app: App,
		message: string,
		onConfirm: () => void,
		onCancel?: () => void,
		details: string[] = []
	) {
		super(app)
		this.message = message
		this.onConfirm = onConfirm
		this.onCancel = onCancel
		this.details = details
	}

	onOpen() {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('teleprompter-confirm-modal')

		// Message
		contentEl.createEl('p', {
			text: this.message,
			cls: 'confirm-modal-message'
		})

		// One line per thing the reader is agreeing to
		if (this.details.length > 0) {
			const list = contentEl.createEl('ul', { cls: 'confirm-modal-details' })
			for (const line of this.details) list.createEl('li', { text: line })
		}

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: 'confirm-modal-buttons' })

		// Cancel button
		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'confirm-modal-button'
		})
		cancelButton.addEventListener('click', () => {
			if (this.onCancel) {
				this.onCancel()
			}
			this.close()
		})

		// Confirm button
		const confirmButton = buttonContainer.createEl('button', {
			text: 'Confirm',
			cls: 'confirm-modal-button mod-warning'
		})
		confirmButton.addEventListener('click', () => {
			this.onConfirm()
			this.close()
		})

		// Focus the cancel button by default (safer)
		cancelButton.focus()
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}
