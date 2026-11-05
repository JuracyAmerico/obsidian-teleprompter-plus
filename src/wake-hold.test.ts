import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { migrateKeepAwakeSetting, wakeHoldAction } from './wake-hold'
import { obsidianStub } from './test-support/obsidian-stub'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('./settings')

const base = { enabled: true, reading: false, held: false, heldAutomatically: false }

describe('wake hold', () => {
	test('reading with the setting on starts a hold', () => {
		expect(wakeHoldAction({ ...base, reading: true })).toBe('start')
	})

	test('the setting off never starts one', () => {
		expect(wakeHoldAction({ ...base, enabled: false, reading: true })).toBe('none')
	})

	test('an automatic hold ends when reading stops', () => {
		expect(wakeHoldAction({ ...base, held: true, heldAutomatically: true })).toBe('stop')
	})

	test('a manual hold stays when reading stops', () => {
		expect(wakeHoldAction({ ...base, held: true })).toBe('none')
	})

	test('play, voice and read-aloud each count as reading', () => {
		const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')
		expect(app).toContain("const reading = isPlaying || (voiceTrackingActive && ownsVoice()) || ttsPlaybackState === 'playing'")
		expect(app).toContain('wakeHoldAction(')
	})

	test('migration: a saved off becomes on once, through the real defaults', () => {
		const saved = Object.assign({}, DEFAULT_SETTINGS, { keepAwake: false })
		expect(migrateKeepAwakeSetting(saved)).toBe(true)
		expect(saved.keepAwake).toBe(true)
		saved.keepAwake = false
		expect(migrateKeepAwakeSetting(saved)).toBe(false)
		expect(saved.keepAwake).toBe(false)
	})
})
