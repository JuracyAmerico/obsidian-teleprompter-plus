/**
 * Settings that arrive from outside the settings tab: an imported settings file, an imported
 * profile file, or a profile applied from the list (a custom profile can come from a shared file
 * or a synced data.json). Kept free of `obsidian` so it is unit-testable.
 *
 * Two rules. Only keys the plugin defines, with the type of their default and no secrets, get
 * through. And a change to how the plugin uses the network is listed for the reader to accept
 * before anything is applied, as the settings fields themselves warn.
 */
import { SECRET_SETTING_KEYS } from './settings-secrets'

/** Keys that are never taken from a file or profile: secrets, and the profile list itself. */
const NEVER_IMPORTED = new Set<string>([...SECRET_SETTING_KEYS, 'profiles'])

function jsonKind(value: unknown): string {
	if (value === null) return 'null'
	return Array.isArray(value) ? 'array' : typeof value
}

/**
 * The part of `raw` that may be applied: keys present in `defaults` (anything else, such as the
 * undocumented `voiceTrace`, is dropped), whose value has the same JSON type as the default, minus
 * secrets and the profile list. A non-object gives `{}`. Ranges and formats are checked later by
 * the plugin's own validator, which runs on every apply.
 */
export function pickImportableSettings<T extends object>(raw: unknown, defaults: T): Partial<T> {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
	const source = raw as Record<string, unknown>
	const picked: Record<string, unknown> = {}
	for (const [key, fallback] of Object.entries(defaults)) {
		if (NEVER_IMPORTED.has(key) || !Object.prototype.hasOwnProperty.call(source, key)) continue
		const value = source[key]
		if (jsonKind(value) !== jsonKind(fallback)) continue
		picked[key] = value
	}
	return picked as Partial<T>
}

/** A profile as stored in settings, after it has been read from a file. */
export interface ImportedProfile<T> {
	id: string
	name: string
	icon: string
	description: string
	settings: Partial<T>
	createdAt: number
	isBuiltIn: false
}

const shortText = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')

/**
 * A profile read from a file, or null when it has no name or no settings object. Its settings are
 * narrowed like an imported settings file, so what is stored is only what may later be applied.
 */
export function readImportedProfile<T extends object>(raw: unknown, defaults: T, id: string): ImportedProfile<T> | null {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
	const source = raw as Record<string, unknown>
	const name = shortText(source.name, 80).trim()
	const settings = source.settings
	if (!name || settings === null || typeof settings !== 'object' || Array.isArray(settings)) return null
	return {
		id,
		name,
		icon: shortText(source.icon, 40),
		description: shortText(source.description, 200),
		settings: pickImportableSettings(settings, defaults),
		createdAt: Date.now(),
		isBuiltIn: false,
	}
}

/** The settings that decide what the plugin exposes, connects to or sends off this computer. */
export interface NetworkSettings {
	wsHost: string
	wsPort: number
	autoStartWebSocket: boolean
	obsEnabled: boolean
	obsHost: string
	obsPort: number
	obsAutoConnect: boolean
	obsSyncRecording: boolean
	obsSyncStreaming: boolean
	ttsEngine: string
}

export const NETWORK_SETTING_KEYS: ReadonlyArray<keyof NetworkSettings> = [
	'wsHost', 'wsPort', 'autoStartWebSocket', 'obsEnabled', 'obsHost', 'obsPort',
	'obsAutoConnect', 'obsSyncRecording', 'obsSyncStreaming', 'ttsEngine',
]

export function isLoopbackHost(host: string): boolean {
	const h = host.trim().toLowerCase()
	return h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
}

/**
 * One line per change that widens what the plugin exposes or sends, in the words a reader needs
 * to decide. Changes that narrow it (back to 127.0.0.1, a feature turned off) need no consent.
 */
export function describeNetworkChanges(current: NetworkSettings, incoming: Partial<NetworkSettings>): string[] {
	const lines: string[] = []
	const changed = (key: keyof NetworkSettings): boolean =>
		Object.prototype.hasOwnProperty.call(incoming, key) && incoming[key] !== current[key]
	const turnsOn = (key: 'autoStartWebSocket' | 'obsEnabled' | 'obsAutoConnect' | 'obsSyncRecording' | 'obsSyncStreaming'): boolean =>
		changed(key) && incoming[key] === true
	const wsHost = String(incoming.wsHost ?? '')
	const obsHost = String(incoming.obsHost ?? '')

	if (changed('wsHost') && !isLoopbackHost(wsHost)) {
		lines.push(`The remote server would listen on ${wsHost}, so other devices on your network can reach it (plain http and ws, not encrypted).`)
	}
	if (changed('wsPort')) lines.push(`The remote server would move to port ${String(incoming.wsPort)}.`)
	if (turnsOn('autoStartWebSocket')) lines.push('The remote server would start by itself whenever Obsidian opens.')
	if (changed('obsHost') && !isLoopbackHost(obsHost)) {
		lines.push(`OBS would be contacted at ${obsHost} over plain ws, and that computer gets the answer to OBS's password challenge.`)
	}
	if (changed('obsPort')) lines.push(`OBS would be contacted on port ${String(incoming.obsPort)}.`)
	if (turnsOn('obsEnabled')) lines.push('The OBS connection would be turned on.')
	if (turnsOn('obsAutoConnect')) lines.push('OBS would be connected to automatically.')
	if (turnsOn('obsSyncRecording')) lines.push('Pressing Play would start recording in OBS.')
	if (turnsOn('obsSyncStreaming')) lines.push('Pressing Play would start a live stream in OBS.')
	if (changed('ttsEngine') && incoming.ttsEngine === 'elevenlabs') {
		lines.push('Read aloud would send your script text to ElevenLabs.')
	}
	return lines
}
