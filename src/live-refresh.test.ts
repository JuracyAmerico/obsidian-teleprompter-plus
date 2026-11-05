import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { alignWords, mapWordIndex, wordsOf } from './passage-anchor'

const src = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8')
const app = src('TeleprompterApp.svelte')
const between = (a: string, b: string): string => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)))

describe('live refresh', () => {
	test('refreshes: a modify event reads the note and applies it', () => {
		expect(app).toContain("app.vault.on('modify'")
		const reload = between('async function reloadPromptedNote', 'async function applyContentKeepingPlace')
		expect(reload).toContain('cachedRead')
		expect(reload).toContain('applyContentKeepingPlace(')
	})

	test('keeps passage: an edit above the reader maps to the same word', () => {
		const before = wordsOf('one two three four five six seven eight nine ten')
		const after = wordsOf('a whole new opening one two three four five six seven eight nine ten')
		const landed = mapWordIndex(alignWords(before, after), before.indexOf('seven'), after.length)
		expect(after[landed]).toBe('seven')
	})

	test('keeps passage: playback is never touched and voice is rebound, not restarted', () => {
		const apply = between('async function applyContentKeepingPlace', 'function refreshPinnedNote')
		expect(apply).not.toContain('isPlaying')
		expect(apply).not.toContain('pauseSession')
		expect(apply).toContain('.rebind(')
		expect(apply).not.toMatch(/voiceTrackingService\??\.(stop|start|initialize)\(/)
	})

	test('voice rebind keeps listening and keeps the word position', () => {
		const service = src('voice/voice-tracking-service.ts')
		const rebind = service.slice(service.indexOf('rebind(contentArea'), service.indexOf('rebind(contentArea') + 500)
		expect(rebind).toContain('buildWordPositionMap()')
		expect(rebind).toContain('seekToWord(')
		expect(rebind).not.toContain('recognizer')
	})

	test('only the prompted note: other notes are ignored, a pinned note refreshes', () => {
		const handler = between("app.vault.on('modify'", '})')
		expect(handler).toContain('file.path !== currentSourcePath()')
		expect(app.slice(app.indexOf('function currentSourcePath'), app.indexOf('function currentSourcePath') + 200)).toContain('pinnedNotePath')
		const pinned = between('function refreshPinnedNote', 'function toggleKeepAwake')
		expect(pinned).toContain('reloadPromptedNote')
	})
})

describe('a place belongs to its note', () => {
	test('a delayed placement checks the reader is still on that note', () => {
		const late = between('function placeAgainAfterLateContent', 'async function restoreNotePosition')
		expect(late).toContain('currentSourcePath() !== scheduledFor')
	})
})
