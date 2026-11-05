import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { obsidianStub } from '../test-support/obsidian-stub'
import { detectScriptLanguage, isValidVoiceLanguageSetting, migrateVoiceLanguageSetting, parseLanguageValue, resolveVoiceLanguage } from './voice-language'
import { findNextPosition, calculateMatchConfidence } from './speech-matcher'
import { tokenizeWords } from './word-tokenizer'
import { VOICE_LANGUAGES } from './types'

void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')
const { DEFAULT_SETTINGS } = await import('../settings')

const PORTUGUESE = `Trabalhei sete anos como Solutions Engineer na Tableau e na Salesforce, com clientes como B3 e Itaú.
Vim para o Canadá com a família, terminei o mestrado aqui em setembro e estou voltando para pré-vendas.`
const ENGLISH = `We own the sensor. We rent the intelligence. GeoSentinel imagines closing that gap, keeping the analysis and the alerts governed inside Canada.`

describe('script language', () => {
	test('detect: a Portuguese script is Portuguese and an English one is English', () => {
		expect(detectScriptLanguage(PORTUGUESE)).toBe('pt-BR')
		expect(detectScriptLanguage(ENGLISH)).toBe('en-US')
	})

	test('detect: a script with no telling words stays English', () => {
		expect(detectScriptLanguage('GeoSentinel RADARSAT 2026')).toBe('en-US')
		expect(detectScriptLanguage('')).toBe('en-US')
	})

	test('note value: the usual spellings are understood and nonsense is not', () => {
		for (const value of ['pt', 'pt-BR', 'PT_br', 'Portuguese', 'português']) expect(parseLanguageValue(value)).toBe('pt-BR')
		for (const value of ['en', 'en-CA', 'English']) expect(parseLanguageValue(value)).toBe('en-US')
		for (const value of ['klingon', '', 12, null]) expect(parseLanguageValue(value)).toBeNull()
	})

	test('order: the note beats the setting, the setting beats the script', () => {
		expect(resolveVoiceLanguage('en-US', 'pt', ENGLISH)).toBe('pt-BR')
		expect(resolveVoiceLanguage('pt-BR', undefined, ENGLISH)).toBe('pt-BR')
		expect(resolveVoiceLanguage('auto', undefined, PORTUGUESE)).toBe('pt-BR')
		expect(resolveVoiceLanguage(undefined, 'klingon', ENGLISH)).toBe('en-US')
	})
})

describe('settings migration', () => {
	// The way main.ts builds settings: defaults first, then what was saved.
	const loaded = (saved: object) => Object.assign({}, DEFAULT_SETTINGS, saved)

	test('migration: settings saved before this release move from en-US to Automatic', () => {
		const settings = loaded({ voiceTrackingLanguage: 'en-US' })
		expect(migrateVoiceLanguageSetting(settings)).toBe(true)
		expect(settings.voiceTrackingLanguage).toBe('auto')
	})

	test('migration: English picked after the migration stays English', () => {
		const settings = loaded({ voiceTrackingLanguage: 'en-US', voiceLanguageAutoMigrated: true })
		expect(migrateVoiceLanguageSetting(settings)).toBe(false)
		expect(settings.voiceTrackingLanguage).toBe('en-US')
	})

	test('migration: the settings validator keeps Automatic and every offered language', () => {
		for (const value of ['auto', 'en-US', 'pt-BR']) expect(isValidVoiceLanguageSetting(value)).toBe(true)
		for (const value of ['<script>', '', 12]) expect(isValidVoiceLanguageSetting(value)).toBe(false)
		const main = readFileSync(join(import.meta.dir, '..', 'main.ts'), 'utf8')
		expect(main).toContain('!isValidVoiceLanguageSetting(s.voiceTrackingLanguage)')
	})

	test('migration: a fresh install is Automatic', () => {
		const settings = loaded({})
		migrateVoiceLanguageSetting(settings)
		expect(settings.voiceTrackingLanguage).toBe('auto')
	})
})

describe('Portuguese tracking', () => {
	test('offers: Portuguese has a Vosk model for the offline path', () => {
		expect(VOICE_LANGUAGES.find(language => language.code === 'pt-BR')?.voskModel).toBe('vosk-model-small-pt-0.3')
	})

	test('accents: a word heard without its accent still counts as the same word', () => {
		expect(calculateMatchConfidence('voce nao', 'você não')).toBe(1)
		expect(calculateMatchConfidence('canada', 'Canadá')).toBe(1)
	})

	test('accents: tracking moves through Portuguese heard without accents', () => {
		const reference = tokenizeWords(PORTUGUESE)
		const position = findNextPosition('vim para o canada com a familia', reference, 15)
		expect(position).toBeGreaterThan(17)
	})

	test('numbers: English number words are only applied to English speech', () => {
		const source = readFileSync(join(import.meta.dir, 'voice-tracking-service.ts'), 'utf8')
		expect(source).toMatch(/this\.config\.language\.startsWith\('en'\) \? normalizeForSpeech\(rawText\) : rawText/)
	})
})

/** A stand-in for either engine that records what it was asked to do. */
class FakeRecognizer {
	calls: string[] = []
	private errorHandler: (code: string, message: string) => void = () => {}
	private statusHandler: (status: string) => void = () => {}
	private initialized = false
	private language = 'en-US'
	constructor(readonly kind: string) {}
	onResult() {}
	onStatus(handler: (status: string) => void) { this.statusHandler = handler }
	onError(handler: (code: string, message: string) => void) { this.errorHandler = handler }
	onProgress() {}
	getIsInitialized() { return this.initialized }
	getLanguage() { return this.language }
	async initialize(language: string) { this.language = language; this.initialized = true; this.calls.push(`init:${language}`) }
	async start() { this.calls.push('start') }
	stop() { this.calls.push('stop') }
	dispose() { this.calls.push('dispose') }
	updateGrammar() {}
	failWith(code: string) { this.errorHandler(code, 'x'); this.statusHandler('error') }
	emitStatus(status: string) { this.statusHandler(status) }
}

function serviceWithFakes() {
	const made: FakeRecognizer[] = []
	const create = (kind: 'apple' | 'vosk') => {
		const fake = new FakeRecognizer(kind)
		made.push(fake)
		return fake as never
	}
	const errors: string[] = []
	const statuses: string[] = []
	const service = new VoiceTrackingService({ engine: 'apple', language: 'pt-BR', silenceGate: false } as never, undefined, create)
	service.onError = code => errors.push(code)
	service.onStatusChange = status => statuses.push(status)
	return { service, made, errors, statuses }
}

describe('engine choice', () => {
	test('offline fallback: when Apple cannot stay on this Mac, Vosk takes over in the same language', async () => {
		const { service, made, errors } = serviceWithFakes()
		await service.start()
		expect(made[0].kind).toBe('apple')
		made[0].failWith('no-on-device')
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(made[1].kind).toBe('vosk')
		expect(made[1].calls).toEqual(['init:pt-BR', 'start'])
		expect(errors).toEqual([])
	})

	test('offline fallback: the old engine status no longer reaches the app after the swap', async () => {
		const { service, made, statuses } = serviceWithFakes()
		await service.start()
		made[0].failWith('no-on-device')
		await new Promise(resolve => setTimeout(resolve, 0))
		made[0].emitStatus('off')
		expect(statuses).not.toContain('error')
		expect(statuses).not.toContain('off')
	})

	test('offline fallback: the next start goes straight to Vosk for that language', async () => {
		const { service, made } = serviceWithFakes()
		await service.start()
		made[0].failWith('no-on-device')
		await new Promise(resolve => setTimeout(resolve, 0))
		service.stop()
		await service.start()
		expect(made.filter(fake => fake.kind === 'apple')).toHaveLength(1)
	})

	test('switching script language: a different language gets a recognizer in that language', async () => {
		const { service, made } = serviceWithFakes()
		await service.start()
		service.stop()
		service.updateConfig({ language: 'en-US' })
		await service.start()
		expect(made[1].kind).toBe('apple')
		expect(made[1].calls).toEqual(['init:en-US', 'start'])
		expect(made[0].calls).toContain('dispose')
	})

	test('other errors still reach the app', async () => {
		const { service, made, errors } = serviceWithFakes()
		await service.start()
		made[0].failWith('microphone-denied')
		expect(errors).toEqual(['microphone-denied'])
	})
})

describe('apple helper privacy', () => {
	const helper = readFileSync(join(import.meta.dir, '..', '..', 'native', 'teleprompter-stt.swift'), 'utf8')
	const recognizer = readFileSync(join(import.meta.dir, 'apple-speech-recognizer.ts'), 'utf8')

	test('on-device only: the helper refuses to run when recognition would leave the Mac', () => {
		expect(helper).toMatch(/guard recognizer\.supportsOnDeviceRecognition else \{[\s\S]{0,200}"no-on-device"[\s\S]{0,80}exit\(1\)/)
		expect(helper).toContain('req.requiresOnDeviceRecognition = true')
		expect(helper).toContain('"onDevice": true')
	})

	test('on-device only: an older helper that does not promise it is not trusted with another language', () => {
		expect(recognizer).toMatch(/this\.language !== 'en-US' && msg\.onDevice !== true/)
	})
})
