import { ItemView } from 'obsidian'
import type { WorkspaceLeaf } from 'obsidian'
import { mount, unmount } from 'svelte'
import TeleprompterApp from './TeleprompterApp.svelte'

export const VIEW_TYPE_TELEPROMPTER = 'teleprompter-plus-view'

export class TeleprompterView extends ItemView {
	private component?: ReturnType<typeof mount>

	constructor(leaf: WorkspaceLeaf) {
		super(leaf)
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

		// Mount Svelte 5 component using mount() function
		this.component = mount(TeleprompterApp, {
			target: appContainer,
			props: {
				app: this.app,
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
