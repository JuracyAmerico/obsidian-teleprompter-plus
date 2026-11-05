import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { obsidianStub } from '../test-support/obsidian-stub'
import { buildSpeechBody, contextAround, engineSignature, speechCacheKey } from './elevenlabs-request'
import { migrateReadAloudLanguage, resolveReadAloudLanguage } from '../voice/voice-language'
import { stripBareUrls } from '../parser/text-cleaner'

void mock.module('obsidian', () => obsidianStub)
const { DEFAULT_SETTINGS } = await import('../settings')
const { ElevenLabsEngine } = await import('./elevenlabs-engine')

const svelte = readFileSync(join(import.meta.dir, '..', 'TeleprompterApp.svelte'), 'utf8')
const between = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)))

describe('read-aloud voice', () => {
	test('voice selector: the engine speaks with the voice it was last given', () => {
		const engine = new ElevenLabsEngine({ apiKey: 'k', voiceId: 'old', modelId: 'm' })
		engine.setVoice('new')
		expect(engine.currentVoiceId).toBe('new')
		engine.setVoice('')
		expect(engine.currentVoiceId).toBe('new')
	})

	test('voice selector: the panel saves to the ElevenLabs field and tells the service', () => {
		const body = between(svelte, 'function setTTSVoice', '/**')
		expect(body).toContain('settings.elevenLabsVoiceId = voiceId')
		expect(body).toContain('ttsService?.setVoice(voiceId)')
		const service = readFileSync(join(import.meta.dir, 'tts-service.ts'), 'utf8')
		expect(between(service, 'setVoice(voiceId', 'setLanguage')).toContain('this.engine?.setVoice?.(voiceId)')
	})

	test('takes effect: every engine field changes the signature, and starting compares it', () => {
		const base = { ttsEngine: 'elevenlabs', elevenLabsApiKey: 'k', elevenLabsVoiceId: 'v', elevenLabsModelId: 'm', elevenLabsStability: 0.5, elevenLabsSimilarity: 0.75 }
		for (const change of [{ ttsEngine: 'kokoro' }, { elevenLabsApiKey: 'x' }, { elevenLabsVoiceId: 'x' }, { elevenLabsModelId: 'x' }, { elevenLabsStability: 0.2 }, { elevenLabsSimilarity: 0.2 }]) {
			expect(engineSignature({ ...base, ...change })).not.toBe(engineSignature(base))
		}
		expect(between(svelte, 'async function initTTS', 'ttsService = new TTSService')).toContain('engineSignature(settings)')
		expect(between(svelte, 'async function toggleTTS', 'prepareTTSDocument()')).not.toContain('if (!ttsInitialized)')
	})

	test('voice settings: the request carries them and the defaults are the old values', () => {
		expect(DEFAULT_SETTINGS.elevenLabsStability).toBe(0.5)
		expect(DEFAULT_SETTINGS.elevenLabsSimilarity).toBe(0.75)
		const body = buildSpeechBody({ text: 't', modelId: 'm', stability: 0.3, similarity: 0.9 })
		expect(body.voice_settings).toEqual({ stability: 0.3, similarity_boost: 0.9 })
	})

	test('context: sent with the request and part of the cache key', () => {
		const body = buildSpeechBody({ text: 't', modelId: 'm', stability: 0.5, similarity: 0.75, previousText: 'before', nextText: 'after' })
		expect(body.previous_text).toBe('before')
		expect(body.next_text).toBe('after')
		const plain = buildSpeechBody({ text: 't', modelId: 'm', stability: 0.5, similarity: 0.75 })
		expect('previous_text' in plain).toBe(false)
		expect(speechCacheKey('m', 'v', 't', { previousText: 'a' })).not.toBe(speechCacheKey('m', 'v', 't', { previousText: 'b' }))
		expect(speechCacheKey('m', 'v', 't', {}, 0.5, 0.75)).not.toBe(speechCacheKey('m', 'v', 't', {}, 0.2, 0.75))
	})

	test('context: the neighbours of a sentence, none past either end', () => {
		const list = ['a', 'b', 'c']
		expect(contextAround(list, 0, s => s)).toEqual({ previousText: undefined, nextText: 'b' })
		expect(contextAround(list, 1, s => s.toUpperCase())).toEqual({ previousText: 'A', nextText: 'C' })
		expect(contextAround(list, 2, s => s)).toEqual({ previousText: 'b', nextText: undefined })
	})
})

describe('read-aloud language', () => {
	const PT = 'Trabalhei sete anos na Tableau e vim para o Canadá com a família, que é o que mais importa para nós.'
	const EN = 'I worked for seven years at Tableau and moved to Canada with the family, which is what matters.'

	test('language order: note, then setting, then the script', () => {
		expect(resolveReadAloudLanguage('auto', undefined, PT)).toBe('pt')
		expect(resolveReadAloudLanguage('auto', undefined, EN)).toBe('en')
		expect(resolveReadAloudLanguage('en', undefined, PT)).toBe('en')
		expect(resolveReadAloudLanguage('auto', 'pt-BR', EN)).toBe('pt')
		expect(resolveReadAloudLanguage('en', 'portuguese', EN)).toBe('pt')
		expect(resolveReadAloudLanguage('fr', undefined, EN)).toBe('fr')
	})

	test('language order: prepared for every read, and English words stay on English notes', () => {
		expect(between(svelte, 'function prepareTTSDocument', 'const sections')).toContain('ttsService.setLanguage(scriptReadAloudLanguage())')
		const service = readFileSync(join(import.meta.dir, 'tts-service.ts'), 'utf8')
		expect(between(service, 'private spokenForm', 'private async speakCurrentSentence')).toContain("lang.startsWith('en')")
	})

	test('language migration: a saved en becomes Automatic once, through the real defaults', () => {
		const loaded = (saved: object) => Object.assign({}, DEFAULT_SETTINGS, saved)
		const old = loaded({ ttsLanguage: 'en' })
		expect(migrateReadAloudLanguage(old)).toBe(true)
		expect(old.ttsLanguage).toBe('auto')
		const picked = loaded({ ttsLanguage: 'en', ttsLanguageAutoMigrated: true })
		expect(migrateReadAloudLanguage(picked)).toBe(false)
		expect(picked.ttsLanguage).toBe('en')
		const fresh = loaded({})
		migrateReadAloudLanguage(fresh)
		expect(fresh.ttsLanguage).toBe('auto')
		expect(readFileSync(join(import.meta.dir, '..', 'main.ts'), 'utf8')).toContain('migrateReadAloudLanguage(this.settings)')
	})
})

describe('read-aloud text', () => {
	test('markdown link: the URL inside a link survives, a bare one does not', () => {
		const line = '[LinkedIn](https://www.linkedin.com/in/x/) | https://bare.example.com/a | <https://auto.example.com> | www.bare.example.com'
		const out = stripBareUrls(line)
		expect(out).toContain('[LinkedIn](https://www.linkedin.com/in/x/)')
		expect(out).not.toContain('bare.example')
		expect(out).not.toContain('auto.example')
	})

	test('line break: a break inside a block is spoken as a pause', () => {
		const body = between(svelte, 'function spokenTextOf', 'function prepareTTSDocument')
		expect(body).toContain("querySelectorAll('br')")
	})
})
