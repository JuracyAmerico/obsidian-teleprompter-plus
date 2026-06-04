/**
 * ElevenLabs TTS engine — cloud neural text-to-speech via the ElevenLabs REST API.
 *
 * Unlike Kokoro (local MLX subprocess) this engine is CLOUD + PAID and bring-your-own-key:
 * the user supplies their own ElevenLabs API key, their script text is sent to ElevenLabs
 * servers, and playback consumes their account credits. It is therefore NEVER auto-selected —
 * the factory only constructs it when the user explicitly picks the 'elevenlabs' engine AND
 * a key is configured. Offline engines (Kokoro / macOS Say / Web Speech) remain the defaults.
 *
 * Audio is fetched as MP3 via Obsidian's requestUrl (CORS-safe) and played through an
 * HTMLAudioElement. Per-sentence audio is cached (keyed by text+voice+model) so re-reads and
 * hintNext pregeneration never re-bill the same sentence.
 *
 * Phase 2 (not implemented): word-level "karaoke" highlighting via the /with-timestamps
 * endpoint — see https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
 */

import { requestUrl } from 'obsidian'
import type { TTSEngine, TTSVoice, SpeakOptions } from './tts-types'

const API_BASE = 'https://api.elevenlabs.io/v1'
const OUTPUT_FORMAT = 'mp3_44100_128'

/** Configuration injected by the engine factory from plugin settings. */
export interface ElevenLabsConfig {
	apiKey: string
	voiceId: string
	modelId: string
}

export class ElevenLabsEngine implements TTSEngine {
	readonly name = 'ElevenLabs'

	private apiKey: string
	private voiceId: string
	private modelId: string

	private endCallback: (() => void) | null = null
	private currentAudio: HTMLAudioElement | null = null
	private currentUrl: string | null = null
	private paused = false

	/** Per-sentence audio cache: key -> MP3 bytes. Avoids re-billing identical text. */
	private cache: Map<string, ArrayBuffer> = new Map()
	private voicesCache: TTSVoice[] | null = null

	constructor(config: ElevenLabsConfig) {
		this.apiKey = (config.apiKey || '').trim()
		this.voiceId = (config.voiceId || '').trim()
		this.modelId = config.modelId || 'eleven_flash_v2_5'
	}

	/** Available only when the user has supplied an API key. Never auto-selected. */
	get isAvailable(): boolean {
		return this.apiKey.length > 0
	}

	initialize(): Promise<void> {
		if (!this.isAvailable) {
			return Promise.reject(
				new Error('ElevenLabs engine requires an API key. Add one in Settings → Text-to-speech → ElevenLabs.')
			)
		}
		if (!this.voiceId) {
			return Promise.reject(
				new Error('ElevenLabs engine requires a voice ID. Set one in Settings → Text-to-speech → ElevenLabs.')
			)
		}
		return Promise.resolve()
	}

	async speak(text: string, options: SpeakOptions): Promise<void> {
		this.stopPlayback()
		const audio = await this.synthesize(text)
		return this.playBytes(audio, options)
	}

	/** Pre-warm the cache for the next sentence so the following speak() is instant. */
	hintNext(text: string, _options: SpeakOptions): void {
		const key = this.cacheKey(text)
		if (this.cache.has(key)) return
		// Fire-and-forget — failures here are non-fatal; speak() will retry/surface them.
		void this.synthesize(text).catch(() => { /* ignore pregen errors */ })
	}

	pause(): void {
		if (this.currentAudio && !this.paused) {
			this.currentAudio.pause()
			this.paused = true
		}
	}

	resume(): void {
		if (this.currentAudio && this.paused) {
			this.paused = false
			void this.currentAudio.play().catch(() => { /* ignore */ })
		}
	}

	stop(): void {
		this.stopPlayback()
	}

	async getVoices(): Promise<TTSVoice[]> {
		if (!this.isAvailable) return []
		if (this.voicesCache) return this.voicesCache

		const res = await requestUrl({
			url: `${API_BASE}/voices`,
			method: 'GET',
			headers: { 'xi-api-key': this.apiKey },
			throw: false,
		})

		if (res.status !== 200) {
			throw new Error(`ElevenLabs: could not load voices (HTTP ${res.status}). Check your API key.`)
		}

		const raw = res.json as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> }
		const voices: TTSVoice[] = (raw.voices ?? []).map(v => ({
			id: v.voice_id,
			name: v.name,
			language: v.labels?.language ?? v.labels?.accent ?? 'en',
			isDefault: v.voice_id === this.voiceId,
		}))
		this.voicesCache = voices
		return voices
	}

	onEnd(callback: () => void): void {
		this.endCallback = callback
	}

	/**
	 * Phase-2 stub. ElevenLabs exposes character-level timing via the /with-timestamps
	 * endpoint, which would drive word-level highlighting through this hook. Not wired yet.
	 * TODO: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
	 */
	onBoundary(_callback: (_charIndex: number) => void): void {
		/* not implemented in v1 — sentence-level highlighting only */
	}

	destroy(): void {
		this.stopPlayback()
		this.endCallback = null
		this.cache.clear()
		this.voicesCache = null
	}

	// ===== Private =====

	private cacheKey(text: string): string {
		return `${this.modelId}::${this.voiceId}::${text}`
	}

	/** Fetch MP3 bytes for a sentence, using the per-sentence cache when possible. */
	private async synthesize(text: string): Promise<ArrayBuffer> {
		const key = this.cacheKey(text)
		const cached = this.cache.get(key)
		if (cached) return cached

		const res = await requestUrl({
			url: `${API_BASE}/text-to-speech/${encodeURIComponent(this.voiceId)}?output_format=${OUTPUT_FORMAT}`,
			method: 'POST',
			headers: {
				'xi-api-key': this.apiKey,
				'Content-Type': 'application/json',
				'Accept': 'audio/mpeg',
			},
			body: JSON.stringify({
				text,
				model_id: this.modelId,
				voice_settings: { stability: 0.5, similarity_boost: 0.75 },
			}),
			throw: false,
		})

		if (res.status !== 200) {
			throw new Error(this.describeError(res.status))
		}

		this.cache.set(key, res.arrayBuffer)
		return res.arrayBuffer
	}

	private playBytes(bytes: ArrayBuffer, options: SpeakOptions): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				const blob = new Blob([bytes], { type: 'audio/mpeg' })
				const url = URL.createObjectURL(blob)
				const audio = new Audio(url)
				audio.playbackRate = options.rate || 1.0

				this.currentAudio = audio
				this.currentUrl = url
				this.paused = false

				const cleanup = () => {
					if (this.currentUrl === url) {
						URL.revokeObjectURL(url)
						this.currentUrl = null
					}
					if (this.currentAudio === audio) {
						this.currentAudio = null
					}
				}

				audio.onended = () => {
					cleanup()
					this.paused = false
					this.endCallback?.()
					resolve()
				}

				audio.onerror = () => {
					cleanup()
					reject(new Error('ElevenLabs: audio playback failed'))
				}

				void audio.play().catch((err: unknown) => {
					cleanup()
					reject(new Error(err instanceof Error ? err.message : 'ElevenLabs: audio playback failed'))
				})
			} catch (err) {
				reject(new Error(err instanceof Error ? err.message : 'ElevenLabs: audio playback failed'))
			}
		})
	}

	/** Stop only playback (preserve the audio cache for re-use). */
	private stopPlayback(): void {
		if (this.currentAudio) {
			this.currentAudio.onended = null
			this.currentAudio.onerror = null
			try { this.currentAudio.pause() } catch { /* ignore */ }
			this.currentAudio = null
		}
		if (this.currentUrl) {
			URL.revokeObjectURL(this.currentUrl)
			this.currentUrl = null
		}
		this.paused = false
	}

	private describeError(status: number): string {
		if (status === 401) return 'ElevenLabs: invalid API key (HTTP 401).'
		if (status === 422) return 'ElevenLabs: invalid request — check the voice ID (HTTP 422).'
		if (status === 429) return 'ElevenLabs: rate limit or quota exceeded (HTTP 429). Check your plan credits.'
		return `ElevenLabs: request failed (HTTP ${status}).`
	}
}
