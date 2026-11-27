import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { obsidianStub } from './test-support/obsidian-stub'
import { describeNetworkChanges, isLoopbackHost, pickImportableSettings, readImportedProfile, type NetworkSettings } from './settings-import'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('./settings')

const src = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8')

const current: NetworkSettings = {
	wsHost: '127.0.0.1', wsPort: 8765, autoStartWebSocket: true,
	obsEnabled: false, obsHost: '127.0.0.1', obsPort: 4455, obsAutoConnect: false,
	obsSyncRecording: false, obsSyncStreaming: false, ttsEngine: 'auto',
}

describe('settings and profiles from a file', () => {
	test('only known keys with their default type get through, never secrets, voiceTrace or the profile list', () => {
		const picked = pickImportableSettings({
			fontSize: 30,
			wsHost: '0.0.0.0',
			voiceTrace: true,                 // not a defined setting: diagnostics stay a deliberate choice
			elevenLabsApiKey: 'sk-from-file', // secrets never come from a file
			obsPassword: 'hunter2',
			remoteKey: 'attacker-chosen',
			profiles: { active: 'x', custom: [] },
			textColor: 42,                    // wrong type
			customHotkeys: 'not-an-object',   // wrong type
			__proto__: { polluted: true },
			notASetting: 'x',
		}, DEFAULT_SETTINGS) as Record<string, unknown>
		expect(picked).toEqual({ fontSize: 30, wsHost: '0.0.0.0' })
		expect(({} as Record<string, unknown>).polluted).toBeUndefined()
	})

	test('a file that is not an object gives nothing', () => {
		for (const raw of [null, 3, 'text', [], undefined]) expect(pickImportableSettings(raw, DEFAULT_SETTINGS)).toEqual({})
	})

	test('a profile file is stored narrowed, with short plain-text labels', () => {
		const profile = readImportedProfile({
			name: 'Shared ' + 'n'.repeat(200), icon: 'radio', description: 7,
			settings: { fontSize: 40, voiceTrace: true, obsPassword: 'x', wsHost: '0.0.0.0' },
		}, DEFAULT_SETTINGS, 'custom-1')
		expect(profile?.name.length).toBe(80)
		expect(profile?.description).toBe('')
		expect(profile?.isBuiltIn).toBe(false)
		expect(profile?.settings).toEqual({ fontSize: 40, wsHost: '0.0.0.0' })
		expect(readImportedProfile({ name: 'x' }, DEFAULT_SETTINGS, 'c')).toBeNull()
		expect(readImportedProfile({ settings: {} }, DEFAULT_SETTINGS, 'c')).toBeNull()
		expect(readImportedProfile({ name: 'x', settings: [] }, DEFAULT_SETTINGS, 'c')).toBeNull()
	})

	test('every change that widens what the plugin exposes or sends is listed for consent', () => {
		const lines = describeNetworkChanges(current, {
			wsHost: '0.0.0.0', wsPort: 9000, obsEnabled: true, obsHost: '203.0.113.9', obsPort: 4456,
			obsAutoConnect: true, obsSyncRecording: true, obsSyncStreaming: true, ttsEngine: 'elevenlabs',
		})
		expect(lines).toHaveLength(9)
		expect(lines.join('\n')).toContain('listen on 0.0.0.0')
		expect(lines.join('\n')).toContain('203.0.113.9')
		expect(lines.join('\n')).toContain('live stream')
		expect(lines.join('\n')).toContain('ElevenLabs')
		expect(describeNetworkChanges({ ...current, autoStartWebSocket: false }, { autoStartWebSocket: true })).toHaveLength(1)
	})

	test('a profile that changes nothing on the network, or narrows it, asks nothing', () => {
		expect(describeNetworkChanges(current, { fontSize: 30 } as Partial<NetworkSettings>)).toEqual([])
		expect(describeNetworkChanges(current, { ...current })).toEqual([])
		expect(describeNetworkChanges({ ...current, wsHost: '0.0.0.0', obsSyncStreaming: true }, {
			wsHost: '127.0.0.1', obsSyncStreaming: false, autoStartWebSocket: false, ttsEngine: 'mac-say',
		})).toEqual([])
		expect(isLoopbackHost('localhost')).toBe(true)
		expect(isLoopbackHost('127.4.5.6')).toBe(true)
		expect(isLoopbackHost('0.0.0.0')).toBe(false)
	})

	test('wiring: every apply goes through the narrowing, the consent and the validator', () => {
		const settings = src('settings.ts')
		// The reset to defaults is the only direct assignment left
		expect(settings.match(/Object\.assign\(this\.plugin\.settings,/g)).toHaveLength(1)
		expect(settings).toContain('Object.assign(this.plugin.settings, DEFAULT_SETTINGS)')
		// The three profile buttons (quick chip, built-in, custom) apply through applyProfile
		expect(settings.match(/addEventListener\('click', \(\) => this\.applyProfile\(profile\)\)/g)).toHaveLength(3)
		expect(settings).toMatch(/private applyFromOutside[\s\S]*?pickImportableSettings\(raw, DEFAULT_SETTINGS\)[\s\S]*?describeNetworkChanges\(this\.plugin\.settings, changes\)[\s\S]*?new ConfirmModal/)
		expect(settings).toContain("this.applyFromOutside(imported, 'This settings file'")
		expect(settings).toMatch(/const profile = readImportedProfile\(/)
		// The plugin side validates before it saves
		expect(src('main.ts')).toMatch(/async applyExternalSettings[\s\S]*?Object\.assign\(this\.settings, changes\)\s*this\.validateSettings\(\)\s*await this\.saveSettings\(\)/)
	})
})
