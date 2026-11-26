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
 * hintNext pregeneration never re-bill the same sentence, and a request already in flight is
 * shared rather than sent twice.
 *
 * Every speak() takes a turn. stop() or a newer speak() ends that turn: a fetch that returns
 * afterwards is dropped unplayed, its failure is not reported, and its clip can never fire the
 * end callback. A pause() during a fetch holds the clip when it arrives; resume() starts it.
 *
 * Word-level "karaoke" highlighting through the /with-timestamps endpoint is not implemented:
 * highlighting is per sentence. See
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
 */

import { requestUrl } from 'obsidian'
import type { RequestUrlParam } from 'obsidian'
import type { TTSEngine, TTSVoice, SpeakOptions } from './tts-types'
import { buildSpeechBody, speechCacheKey } from './elevenlabs-request'
import type { SpeechContext } from './elevenlabs-request'

const API_BASE = 'https://api.elevenlabs.io/v1'
const OUTPUT_FORMAT = 'mp3_44100_128'
const MIN_RATE = 0.5
const MAX_RATE = 2.0

/** Configuration injected by the engine factory from plugin settings. */
export interface ElevenLabsConfig {
	apiKey: string
	voiceId: string
	modelId: string
	stability?: number
	similarity?: number
}

/** The part of an HTMLAudioElement this engine uses. */
export interface PlayableAudio {
	playbackRate: number
	onended: ((event: Event) => unknown) | null
	onerror: ((event: Event | string) => unknown) | null
	play(): Promise<void>
	pause(): void
}

/** A clip ready to play, and how to free what it holds once it is done. */
export interface LoadedAudio {
	audio: PlayableAudio
	release(): void
}

/** The part of Obsidian's requestUrl response this engine reads. */
export interface ElevenLabsResponse {
	status: number
	arrayBuffer: ArrayBuffer
	json: unknown
}

/** The engine's two ways out of the process: the network and the speakers. Tests replace both. */
export interface ElevenLabsIO {
	request(param: RequestUrlParam): Promise<ElevenLabsResponse>
	load(bytes: ArrayBuffer): LoadedAudio
}

function loadInBrowser(bytes: ArrayBuffer): LoadedAudio {
	const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
	return { audio: new Audio(url), release: () => URL.revokeObjectURL(url) }
}

const BROWSER_IO: ElevenLabsIO = { request: requestUrl, load: loadInBrowser }

function clampRate(rate: number): number {
	if (!Number.isFinite(rate)) return 1
	return Math.max(MIN_RATE, Math.min(MAX_RATE, rate))
}

function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err)
}

/** ElevenLabs puts its reason in `detail`: a string, `{ message }`, or a list of `{ msg }`. */
export function elevenLabsReason(body: unknown): string {
	if (!body || typeof body !== 'object') return ''
	const detail = (body as { detail?: unknown }).detail
	if (typeof detail === 'string') return detail
	if (Array.isArray(detail)) {
		const first: unknown = detail[0]
		if (first && typeof first === 'object' && typeof (first as { msg?: unknown }).msg === 'string') {
			return (first as { msg: string }).msg
		}
		return ''
	}
	if (detail && typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string') {
		return (detail as { message: string }).message
	}
	return ''
}

/** What the reader is told when a request fails: the cause in plain words, then ElevenLabs' own reason. */
export function describeElevenLabsError(status: number, reason = ''): string {
	const base =
		status === 401 ? 'ElevenLabs: the API key was refused or the quota is used up (HTTP 401).'
		: status === 402 ? 'ElevenLabs: the plan has no credits left for this (HTTP 402).'
		: status === 422 ? 'ElevenLabs: invalid request — check the voice ID (HTTP 422).'
		: status === 429 ? 'ElevenLabs: rate limit or quota exceeded (HTTP 429). Check your plan credits.'
		: `ElevenLabs: request failed (HTTP ${status}).`
	return reason ? `${base} ${reason}` : base
}

interface Clip {
	loaded: LoadedAudio
	resolve: () => void
	reject: (error: Error) => void
}

export class ElevenLabsEngine implements TTSEngine {
	readonly name = 'ElevenLabs'

	private apiKey: string
	private voiceId: string
	private modelId: string
	private stability: number
	private similarity: number
	private io: ElevenLabsIO

	private endCallback: (() => void) | null = null
	/** The clip of the current turn, from the moment its bytes arrive until it ends or is stopped. */
	private clip: Clip | null = null
	/** Bumped by stop() and by every speak(): a fetch from an older turn is dropped when it lands. */
	private turn = 0
	private paused = false
	private rate = 1

	/** Per-sentence audio cache: key -> MP3 bytes. Avoids re-billing identical text. */
	private cache: Map<string, ArrayBuffer> = new Map()
	/** Requests on the wire, so hintNext and speak for the same sentence send one request, not two. */
	private inflight: Map<string, Promise<ArrayBuffer>> = new Map()
	private voicesCache: TTSVoice[] | null = null

	constructor(config: ElevenLabsConfig, io: ElevenLabsIO = BROWSER_IO) {
		this.apiKey = (config.apiKey || '').trim()
		this.voiceId = (config.voiceId || '').trim()
		this.modelId = config.modelId || 'eleven_flash_v2_5'
		this.stability = config.stability ?? 0.5
		this.similarity = config.similarity ?? 0.75
		this.io = io
	}

	get currentVoiceId(): string {
		return this.voiceId
	}

	/** The next sentence is spoken in this voice. An empty id is ignored, it would fail the request. */
	setVoice(voiceId: string): void {
		const next = (voiceId || '').trim()
		if (next) this.voiceId = next
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

	/**
	 * Resolves when the clip ends or this turn is stopped or replaced; rejects only when this turn's
	 * own request or playback fails. A superseded turn never plays and never reports.
	 */
	async speak(text: string, options: SpeakOptions): Promise<void> {
		this.endTurn()
		const turn = this.turn
		this.rate = clampRate(options.rate || 1)

		let bytes: ArrayBuffer
		try {
			bytes = await this.synthesize(text, options)
		} catch (err) {
			if (turn !== this.turn) return
			throw err instanceof Error ? err : new Error(messageOf(err))
		}
		if (turn !== this.turn) return
		return this.playBytes(bytes)
	}

	/** Pre-warm the cache for the next sentence so the following speak() is instant. */
	hintNext(text: string, options: SpeakOptions): void {
		const key = this.cacheKey(text, options)
		if (this.cache.has(key) || this.inflight.has(key)) return
		// Fire-and-forget: speak() makes its own request for this sentence and reports that one.
		void this.synthesize(text, options).catch(() => { /* a failed pregen is retried by speak() */ })
	}

	/** Also holds a clip whose bytes are still on the way: it arrives paused. */
	pause(): void {
		if (this.paused) return
		this.paused = true
		this.clip?.loaded.audio.pause()
	}

	resume(): void {
		if (!this.paused) return
		this.paused = false
		if (this.clip) this.start(this.clip)
	}

	stop(): void {
		this.endTurn()
	}

	/** Takes effect on the clip already playing, not only the next one. */
	setRate(rate: number): void {
		this.rate = clampRate(rate)
		if (this.clip) this.clip.loaded.audio.playbackRate = this.rate
	}

	async getVoices(): Promise<TTSVoice[]> {
		if (!this.isAvailable) return []
		if (this.voicesCache) return this.voicesCache

		const res = await this.send({
			url: `${API_BASE}/voices`,
			method: 'GET',
			headers: { 'xi-api-key': this.apiKey },
			throw: false,
		})

		if (res.status !== 200) {
			throw new Error(`ElevenLabs: could not load voices (HTTP ${res.status}). Check your API key.`)
		}

		const raw = res.json as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> } | null
		const voices: TTSVoice[] = (raw?.voices ?? []).map(v => ({
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

	/** Sentence-level highlighting only; see the file header for the word-level endpoint. */
	onBoundary(_callback: (_charIndex: number) => void): void {
		/* no character timings without the /with-timestamps endpoint */
	}

	destroy(): void {
		this.endTurn()
		this.endCallback = null
		this.cache.clear()
		this.inflight.clear()
		this.voicesCache = null
	}

	// ===== Private =====

	private cacheKey(text: string, context: SpeechContext): string {
		return speechCacheKey(this.modelId, this.voiceId, text, context, this.stability, this.similarity)
	}

	/** Network failures (offline, DNS) throw instead of returning a status: name the engine in them. */
	private async send(param: RequestUrlParam): Promise<ElevenLabsResponse> {
		try {
			return await this.io.request(param)
		} catch (err) {
			throw new Error(`ElevenLabs: could not reach the server (${messageOf(err)}).`)
		}
	}

	/** MP3 bytes for a sentence: from the cache, from a request already on the wire, or a new request. */
	private synthesize(text: string, context: SpeechContext): Promise<ArrayBuffer> {
		const key = this.cacheKey(text, context)
		const cached = this.cache.get(key)
		if (cached) return Promise.resolve(cached)
		const pending = this.inflight.get(key)
		if (pending) return pending

		const request = this.fetchSpeech(text, context)
			.then((bytes) => {
				this.cache.set(key, bytes)
				return bytes
			})
			.finally(() => {
				this.inflight.delete(key)
			})
		this.inflight.set(key, request)
		return request
	}

	private async fetchSpeech(text: string, context: SpeechContext): Promise<ArrayBuffer> {
		const res = await this.send({
			url: `${API_BASE}/text-to-speech/${encodeURIComponent(this.voiceId)}?output_format=${OUTPUT_FORMAT}`,
			method: 'POST',
			headers: {
				'xi-api-key': this.apiKey,
				'Content-Type': 'application/json',
				'Accept': 'audio/mpeg',
			},
			body: JSON.stringify(buildSpeechBody({
				text,
				modelId: this.modelId,
				stability: this.stability,
				similarity: this.similarity,
				previousText: context.previousText,
				nextText: context.nextText,
			})),
			throw: false,
		})

		if (res.status !== 200) {
			let reason = ''
			try {
				reason = elevenLabsReason(res.json)
			} catch {
				// The body was not JSON: the status alone says what went wrong.
			}
			throw new Error(describeElevenLabsError(res.status, reason))
		}
		// Not instanceof: the buffer can come from another realm than this window's.
		if (typeof res.arrayBuffer?.byteLength !== 'number' || res.arrayBuffer.byteLength === 0) {
			throw new Error('ElevenLabs: the server answered with no audio.')
		}
		return res.arrayBuffer
	}

	/** Plays this turn's bytes. Settles when the clip ends (resolve), fails (reject) or is stopped (resolve). */
	private playBytes(bytes: ArrayBuffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let loaded: LoadedAudio
			try {
				loaded = this.io.load(bytes)
			} catch (err) {
				reject(new Error(`ElevenLabs: audio playback failed (${messageOf(err)}).`))
				return
			}

			const clip: Clip = { loaded, resolve, reject }
			// Only one clip ever sounds: whatever was here belongs to an ended turn.
			const stale = this.clip
			if (stale) {
				this.release(stale)
				stale.resolve()
			}
			this.clip = clip
			loaded.audio.playbackRate = this.rate

			loaded.audio.onended = () => {
				if (this.clip !== clip) return
				this.release(clip)
				this.paused = false
				this.endCallback?.()
				resolve()
			}
			loaded.audio.onerror = () => {
				if (this.clip !== clip) return
				this.release(clip)
				reject(new Error('ElevenLabs: audio playback failed.'))
			}

			// Paused while the bytes were on the way: hold the clip, resume() starts it.
			if (!this.paused) this.start(clip)
		})
	}

	private start(clip: Clip): void {
		clip.loaded.audio.play().catch((err: unknown) => {
			// A pause or stop right after play() interrupts it; that is not a failure.
			if (this.clip !== clip || this.paused) return
			this.release(clip)
			clip.reject(new Error(`ElevenLabs: audio playback failed (${messageOf(err)}).`))
		})
	}

	/** Silences a clip and frees its audio. Its speak() is settled by whoever released it. */
	private release(clip: Clip): void {
		if (this.clip === clip) this.clip = null
		clip.loaded.audio.onended = null
		clip.loaded.audio.onerror = null
		try {
			clip.loaded.audio.pause()
		} catch {
			// An element that never started has nothing to pause.
		}
		clip.loaded.release()
	}

	/** Ends the current turn: its clip goes silent, its speak() resolves, a fetch still out is dropped. */
	private endTurn(): void {
		this.turn++
		const clip = this.clip
		if (clip) {
			this.release(clip)
			clip.resolve()
		}
		this.paused = false
	}
}
