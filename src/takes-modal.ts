import { Modal, Setting } from 'obsidian'
import type { App } from 'obsidian'
import { bestTakes, formatTakeDate, isBestTake, recentTakes, type TakeLogEntry } from './take-log'
import { formatTakeLine } from './takes'

/**
 * "Show recent takes": the last takes of one note, newest first, with the best take of each
 * section marked (closest to its target over the whole history; see bestTakes).
 */
export class RecentTakesModal extends Modal {
	constructor(
		app: App,
		private readonly notePath: string,
		private readonly takes: readonly TakeLogEntry[],
	) {
		super(app)
	}

	onOpen(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass('teleprompter-takes-modal')

		const name = this.notePath.split('/').pop()?.replace(/\.md$/i, '') ?? this.notePath
		new Setting(contentEl).setName(`Recent takes: ${name}`).setHeading()

		const recent = recentTakes(this.takes, this.notePath)
		if (recent.length === 0) {
			contentEl.createEl('p', {
				cls: 'teleprompter-takes-empty',
				text: 'No takes yet. Play a section from its heading to the next one, or the whole script from the top to the end, and the time is kept here.',
			})
			return
		}

		const best = bestTakes(this.takes, this.notePath)
		const list = contentEl.createEl('ol', { cls: 'teleprompter-takes-list' })
		for (const take of recent) {
			const isBest = isBestTake(best, take)
			const item = list.createEl('li', { cls: isBest ? 'teleprompter-take is-best' : 'teleprompter-take' })
			item.createSpan({ cls: 'teleprompter-take-date', text: formatTakeDate(take.date) })
			item.createSpan({
				cls: 'teleprompter-take-line',
				text: formatTakeLine({ title: take.section, durationSeconds: take.durationSeconds, targetSeconds: take.targetSeconds, complete: true }),
			})
			if (isBest) item.createSpan({ cls: 'teleprompter-take-best', text: 'Best' })
		}
	}

	onClose(): void {
		this.contentEl.empty()
	}
}
