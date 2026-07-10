/**
 * Input validators for the Kokoro TTS engine. Kept in their own module (no `obsidian` import) so
 * they are unit-testable, and because they close a real code-injection vector: kokoro-engine builds
 * a Python script by string interpolation (`voice="${voiceId}", speed=${speed}`) and runs it via
 * `spawn(python, ['-c', script])`. If `voiceId`/`speed` came straight from settings (ttsVoice/ttsRate,
 * which validateSettings never checked), a crafted value in a synced data.json could break out of the
 * literal and execute arbitrary Python. These make the interpolated values structurally un-injectable:
 * a resolved voice id is always one of a known allowlist, and a clamped speed is always a finite number.
 */

/**
 * Resolve an untrusted voice id to a known-safe one. The result is ALWAYS a member of `allowedIds`
 * (or `fallback`), so it can never carry shell/Python metacharacters into the generation script.
 */
export function resolveVoiceId(
	requested: string | undefined,
	allowedIds: readonly string[],
	fallback = 'af_heart',
): string {
	return typeof requested === 'string' && allowedIds.includes(requested) ? requested : fallback
}

/**
 * Coerce an untrusted rate to a bounded finite number. A non-numeric or out-of-range value (including
 * an injection string like `1.0)\nimport os`) collapses to a safe clamped number.
 */
export function clampSpeed(requested: unknown, min = 0.5, max = 2.0, fallback = 1.0): number {
	const n = Number(requested)
	if (!Number.isFinite(n)) return fallback
	return Math.min(max, Math.max(min, n))
}
