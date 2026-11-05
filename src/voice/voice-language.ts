/**
 * Which language to listen in for a script. Pure, so it can be tested without a microphone.
 *
 * Order: the note's own frontmatter, then a language picked in settings, then the script itself.
 * A wrong language makes the recognizer hear nonsense, so a note can always say what it is.
 */

export type VoiceLanguageCode = 'en-US' | 'pt-BR'
export type VoiceLanguageSetting = VoiceLanguageCode | 'auto'

/** Common words only one of the two languages uses, so a script's own words decide. */
const PORTUGUESE_WORDS = new Set([
	'o', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
	'que', 'e', 'é', 'para', 'por', 'com', 'não', 'se', 'mais', 'como', 'mas', 'foi', 'ao', 'seu',
	'sua', 'ou', 'quando', 'muito', 'já', 'eu', 'você', 'também', 'só', 'pelo', 'pela', 'até',
	'isso', 'ela', 'ele', 'entre', 'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem', 'essa',
	'num', 'nem', 'suas', 'meu', 'minha', 'às', 'tem', 'são', 'está', 'estou', 'aqui', 'obrigado',
])

const ENGLISH_WORDS = new Set([
	'the', 'of', 'and', 'to', 'in', 'is', 'it', 'that', 'for', 'was', 'on', 'are', 'with', 'as',
	'at', 'be', 'this', 'have', 'from', 'or', 'by', 'not', 'but', 'what', 'all', 'were', 'we',
	'when', 'your', 'can', 'said', 'there', 'an', 'which', 'their', 'if', 'will', 'how', 'our',
	'they', 'you', 'has', 'more', 'about', 'i', 'my', 'me', 'would', 'so', 'been', 'who', 'them',
])

/** The language a script is written in. English when it cannot tell, the plugin's long default. */
export function detectScriptLanguage(script: string): VoiceLanguageCode {
	let portuguese = 0
	let english = 0
	for (const word of script.toLowerCase().match(/[a-zà-ÿ]+/g) ?? []) {
		if (PORTUGUESE_WORDS.has(word)) portuguese++
		if (ENGLISH_WORDS.has(word)) english++
	}
	return portuguese > english ? 'pt-BR' : 'en-US'
}

/** `pt`, `pt-BR`, `Portuguese` and `português` all mean the same thing in a note. Null if unknown. */
export function parseLanguageValue(value: unknown): VoiceLanguageCode | null {
	if (typeof value !== 'string') return null
	const text = value.trim().toLowerCase()
	if (text === 'pt' || text.startsWith('pt-') || text.startsWith('pt_') || text.startsWith('portugu')) return 'pt-BR'
	if (text === 'en' || text.startsWith('en-') || text.startsWith('en_') || text.startsWith('english')) return 'en-US'
	return null
}

/** What a saved language setting may hold: Automatic, or a BCP 47 style code. */
export function isValidVoiceLanguageSetting(value: unknown): boolean {
	return typeof value === 'string' && (value === 'auto' || /^[a-z]{2}(-[A-Z]{2})?$/.test(value))
}

/**
 * en-US was the only language before 0.12.0, so a saved en-US was never a choice. Runs once, so
 * someone who later picks English keeps it. Returns whether anything changed.
 */
export function migrateVoiceLanguageSetting(settings: {
	voiceTrackingLanguage: string
	voiceLanguageAutoMigrated: boolean
}): boolean {
	if (settings.voiceLanguageAutoMigrated) return false
	if (settings.voiceTrackingLanguage === 'en-US') settings.voiceTrackingLanguage = 'auto'
	settings.voiceLanguageAutoMigrated = true
	return true
}

export function resolveVoiceLanguage(
	setting: string | undefined,
	frontmatterValue: unknown,
	script: string
): VoiceLanguageCode {
	const fromNote = parseLanguageValue(frontmatterValue)
	if (fromNote) return fromNote
	if (setting === 'en-US' || setting === 'pt-BR') return setting
	return detectScriptLanguage(script)
}
