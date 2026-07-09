/**
 * Secret-handling policy for settings/profile objects. Kept in its own module (no `obsidian`
 * import) so it is unit-testable and so the list of secret keys has a single home.
 */

/** Setting keys that hold secrets — must never be written to an exported or shared file. */
export const SECRET_SETTING_KEYS = ['elevenLabsApiKey', 'obsPassword'] as const

/**
 * Return a shallow copy of a settings/profile object with secret keys REMOVED (not blanked).
 * Removal, not blanking, is deliberate: an imported file/profile re-applies via Object.assign,
 * which only copies keys it contains — so an absent secret leaves the user's live key untouched
 * instead of wiping it. Used for Settings → Export and Save-as-Profile.
 */
export function redactSecrets<T extends object>(settings: T): Partial<T> {
	const copy: Partial<T> = { ...settings }
	for (const key of SECRET_SETTING_KEYS) {
		delete (copy as Record<string, unknown>)[key]
	}
	return copy
}
