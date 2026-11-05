/**
 * Whether to change the screen-awake hold. Pressing the button is a manual hold, which only the
 * button ends; a hold this logic started ends when reading stops.
 */
export function wakeHoldAction(state: {
	enabled: boolean
	reading: boolean
	held: boolean
	heldAutomatically: boolean
}): 'start' | 'stop' | 'none' {
	if (state.reading) return state.enabled && !state.held ? 'start' : 'none'
	return state.held && state.heldAutomatically ? 'stop' : 'none'
}

/**
 * The setting existed for years and nothing read it, so a saved "off" was never a choice.
 * Runs once, so someone who later turns it off keeps it off. Returns whether anything changed.
 */
export function migrateKeepAwakeSetting(settings: { keepAwake: boolean; keepAwakeAutoMigrated: boolean }): boolean {
	if (settings.keepAwakeAutoMigrated) return false
	settings.keepAwake = true
	settings.keepAwakeAutoMigrated = true
	return true
}
