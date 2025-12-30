import { ItemView } from 'obsidian'
import type { WorkspaceLeaf } from 'obsidian'
import type TeleprompterPlusPlugin from './main'
import { mount, unmount } from 'svelte'
import TeleprompterApp from './TeleprompterApp.svelte'

export const VIEW_TYPE_TELEPROMPTER = 'teleprompter-plus-view'

export class TeleprompterView extends ItemView {
	private component?: ReturnType<typeof mount>
	private plugin: TeleprompterPlusPlugin

	constructor(leaf: WorkspaceLeaf, plugin: TeleprompterPlusPlugin) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType() {
		return VIEW_TYPE_TELEPROMPTER
	}

	getDisplayText() {
		return 'Teleprompter Plus'
	}

	getIcon() {
		return 'teleprompter-final'
	}

	async onOpen() {
		const container = this.containerEl.children[1]
		container.empty()

		// Create a div for our Svelte component
		const appContainer = container.createDiv({ cls: 'teleprompter-plus-container' })

		// Get the owner document/window for popout window support
		// This is critical for popout windows which have a different document context
		const ownerDocument = this.containerEl.ownerDocument
		const ownerWindow = ownerDocument.defaultView || window

		// Mount Svelte 5 component using mount() function
		this.component = mount(TeleprompterApp, {
			target: appContainer,
			props: {
				app: this.app,
				plugin: this.plugin,
				ownerDocument: ownerDocument,
				ownerWindow: ownerWindow,
			},
		})
	}

	async onClose() {
		// Unmount Svelte 5 component
		if (this.component) {
			unmount(this.component)
		}
	}
}
