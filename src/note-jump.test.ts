import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { sourceLineOfWord, wordsOf } from './passage-anchor'

const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
const handler = app.slice(app.indexOf('async function handleDoubleClickToEdit'), app.indexOf('function jumpToNextSection'))

describe('jump to note', () => {
	test('source line: a common word lands on its own line, not the first copy', () => {
		const content = 'the opening\n\nthe middle\n\nthe closing'
		const rendered = wordsOf(content)
		expect(sourceLineOfWord(rendered, rendered.lastIndexOf('the'), content)).toBe(4)
		expect(handler).toContain('wordAtPoint(')
		expect(handler).toContain('sourceLineOfWord(')
		expect(handler).toContain('yamlLineOffset')
	})

	test('source line: a pane is opened when none shows the note', () => {
		expect(handler).toContain('openPromptedNoteInPane')
		expect(handler).toContain('resolveMarkdownViewForCurrentNote()')
	})

	test('source line: scrolling inside a section leaves the cursor where the jump put it', () => {
		expect(app).toContain('scrollSyncEnabled && currentHeader.id !== lastSyncedHeaderId')
	})

	test('source line: during voice the clicked word becomes where voice listens', () => {
		expect(handler).toContain('ownsVoice()')
		expect(handler).toContain('seekToWord(')
	})
})
