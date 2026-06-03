/**
 * TTS engine factory.
 * Detects available engines and creates the appropriate instance.
 */

import type { TTSEngine, TTSEngineType } from './tts-types'
import { WebSpeechEngine } from './web-speech-engine'
import { MacSayEngine } from './mac-say-engine'
import { KokoroEngine } from './kokoro-engine'
import { ElevenLabsEngine } from './elevenlabs-engine'

/** Optional cloud-engine configuration (bring-your-own-key, never auto-selected). */
export interface TTSEngineConfig {
	elevenLabsApiKey?: string
	elevenLabsVoiceId?: string
	elevenLabsModelId?: string
}

/**
 * Create a TTS engine based on preference and availability.
 *
 * Auto-detection order (offline only — cloud ElevenLabs is NEVER auto-selected):
 * 1. Kokoro (MLX neural TTS - best quality)
 * 2. macOS Say (native, good quality)
 * 3. Web Speech (fallback, always available)
 *
 * @param preferred - User's preferred engine type
 * @param config - Optional cloud-engine config (ElevenLabs key/voice/model)
 * @returns The created engine, or null if none available
 */
export function createTTSEngine(preferred: TTSEngineType, config?: TTSEngineConfig): TTSEngine | null {
	if (preferred === 'elevenlabs') {
		const elevenLabs = new ElevenLabsEngine({
			apiKey: config?.elevenLabsApiKey ?? '',
			voiceId: config?.elevenLabsVoiceId ?? '',
			modelId: config?.elevenLabsModelId ?? 'eleven_flash_v2_5',
		})
		if (elevenLabs.isAvailable) return elevenLabs
		// No key configured — fall back to the offline chain rather than failing hard.
		const kokoro = new KokoroEngine()
		if (kokoro.isAvailable) return kokoro
		const macSay = new MacSayEngine()
		if (macSay.isAvailable) return macSay
		const webSpeech = new WebSpeechEngine()
		if (webSpeech.isAvailable) return webSpeech
		return null
	}

	if (preferred === 'kokoro') {
		const kokoro = new KokoroEngine()
		if (kokoro.isAvailable) return kokoro
		// Fall back through chain
		const macSay = new MacSayEngine()
		if (macSay.isAvailable) return macSay
		const webSpeech = new WebSpeechEngine()
		if (webSpeech.isAvailable) return webSpeech
		return null
	}

	if (preferred === 'mac-say') {
		const macSay = new MacSayEngine()
		if (macSay.isAvailable) return macSay
		const webSpeech = new WebSpeechEngine()
		if (webSpeech.isAvailable) return webSpeech
		return null
	}

	if (preferred === 'web-speech') {
		const webSpeech = new WebSpeechEngine()
		if (webSpeech.isAvailable) return webSpeech
		return null
	}

	// Auto-detect: Kokoro > macOS Say > Web Speech
	const kokoro = new KokoroEngine()
	if (kokoro.isAvailable) return kokoro

	const macSay = new MacSayEngine()
	if (macSay.isAvailable) return macSay

	const webSpeech = new WebSpeechEngine()
	if (webSpeech.isAvailable) return webSpeech

	return null
}

/** Get a list of all available engine types */
export function getAvailableEngines(config?: TTSEngineConfig): TTSEngineType[] {
	const available: TTSEngineType[] = []

	const macSay = new MacSayEngine()
	if (macSay.isAvailable) available.push('mac-say')

	const kokoro = new KokoroEngine()
	if (kokoro.isAvailable) available.push('kokoro')

	const webSpeech = new WebSpeechEngine()
	if (webSpeech.isAvailable) available.push('web-speech')

	// Cloud engine: only "available" when the user has supplied an API key.
	if ((config?.elevenLabsApiKey ?? '').trim().length > 0) available.push('elevenlabs')

	return available
}
