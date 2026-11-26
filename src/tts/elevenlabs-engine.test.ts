import { describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import type { RequestUrlParam } from 'obsidian'
import type { ElevenLabsIO, ElevenLabsResponse, LoadedAudio, PlayableAudio } from './elevenlabs-engine'
import type { TTSDocument } from './tts-types'

void mock.module('obsidian', () => obsidianStub)
const { ElevenLabsEngine, describeElevenLabsError, elevenLabsReason } = await import('./elevenlabs-engine')
const { TTSService } = await import('./tts-service')

/** Stands in for an HTMLAudioElement: records play/pause, plays nothing. */
class FakeAudio implements PlayableAudio {
	playbackRate = 1
	onended: ((event: Event) => unknown) | null = null
	onerror: ((event: Event | string) => unknown) | null = null
	plays = 0
	pauses = 0
	released = false
	/** Hold play() open until started; a pause() before then rejects it, as Chromium does. */
	slowStart = false
	private starting: ((error: Error) => void) | null = null

	constructor(readonly text: string) {}

	play(): Promise<void> {
		this.plays++
		if (!this.slowStart) return Promise.resolve()
		return new Promise<void>((_resolve, reject) => { this.starting = reject })
	}

	pause(): void {
		this.pauses++
		const interrupt = this.starting
		this.starting = null
		interrupt?.(new Error('The play() request was interrupted by a call to pause().'))
	}

	/** The browser fires 'ended' with whatever handler is set now. */
	end(): void {
		this.onended?.(new Event('ended'))
	}
}

interface PendingRequest {
	text: string
	param: RequestUrlParam
	answer: (response: Partial<ElevenLabsResponse>) => void
	fail: (error: Error) => void
}

/** The network and the speakers, both by hand. Bytes carry their sentence so clips can be told apart. */
class FakeIO implements ElevenLabsIO {
	requests: PendingRequest[] = []
	audios: FakeAudio[] = []

	request(param: RequestUrlParam): Promise<ElevenLabsResponse> {
		if (param.url.endsWith('/voices')) {
			return Promise.resolve({ status: 200, arrayBuffer: new ArrayBuffer(0), json: { voices: [] } })
		}
		const text = param.body ? (JSON.parse(param.body as string) as { text: string }).text : ''
		return new Promise<ElevenLabsResponse>((resolve, reject) => {
			this.requests.push({
				text,
				param,
				answer: (response) => resolve({ status: 200, arrayBuffer: new TextEncoder().encode(text).buffer, json: null, ...response }),
				fail: reject,
			})
		})
	}

	load(bytes: ArrayBuffer): LoadedAudio {
		const audio = new FakeAudio(new TextDecoder().decode(bytes))
		this.audios.push(audio)
		return { audio, release: () => { audio.released = true } }
	}

	/** Answer the request for this sentence with its audio. */
	deliver(text: string): void {
		const index = this.requests.findIndex(r => r.text === text)
		if (index === -1) throw new Error(`no request for ${text}`)
		const [request] = this.requests.splice(index, 1)
		request.answer({})
	}

	refuse(text: string, status: number, json: unknown = null): void {
		const index = this.requests.findIndex(r => r.text === text)
		const [request] = this.requests.splice(index, 1)
		request.answer({ status, json, arrayBuffer: new ArrayBuffer(0) })
	}

	audioFor(text: string): FakeAudio[] {
		return this.audios.filter(a => a.text === text)
	}
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const OPTIONS = { rate: 1 }

/** The rejection message, or null when the promise resolved. */
function failureOf(promise: Promise<unknown>): Promise<string | null> {
	return promise.then(() => null, (error: unknown) => (error instanceof Error ? error.message : String(error)))
}

function engineWith(io: FakeIO) {
	const engine = new ElevenLabsEngine({ apiKey: 'key', voiceId: 'voice', modelId: 'model' }, io)
	let ends = 0
	engine.onEnd(() => { ends++ })
	return { engine, ends: () => ends }
}

describe('ElevenLabs: one voice at a time (W1 #2)', () => {
	test('next during a fetch: only the newer sentence plays, and it ends once', async () => {
		const io = new FakeIO()
		const { engine, ends } = engineWith(io)
		const first = engine.speak('One.', OPTIONS)
		const second = engine.speak('Two.', OPTIONS)
		io.deliver('One.')
		await settle()
		io.deliver('Two.')
		await settle()

		expect(io.audioFor('One.')).toHaveLength(0)
		expect(io.audioFor('Two.')[0].plays).toBe(1)
		await first // the superseded turn settles quietly

		io.audioFor('Two.')[0].end()
		await second
		expect(ends()).toBe(1)
	})

	test('the stale end of a replaced clip does not skip a sentence', async () => {
		const io = new FakeIO()
		const { engine, ends } = engineWith(io)
		void engine.speak('One.', OPTIONS)
		io.deliver('One.')
		await settle()
		const old = io.audioFor('One.')[0]
		const queuedEnd = old.onended // an 'ended' event already queued when next was pressed

		void engine.speak('Two.', OPTIONS)
		expect(old.released).toBe(true)
		expect(old.pauses).toBeGreaterThan(0)
		queuedEnd?.(new Event('ended'))
		old.end()
		expect(ends()).toBe(0)
	})

	test('a clip from an ended turn is silenced when a newer one starts', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		void engine.speak('One.', OPTIONS)
		io.deliver('One.')
		await settle()
		void engine.speak('Two.', OPTIONS)
		io.deliver('Two.')
		await settle()
		const sounding = io.audios.filter(a => !a.released)
		expect(sounding.map(a => a.text)).toEqual(['Two.'])
	})

	test('stop during a fetch: the sentence never plays and speak resolves', async () => {
		const io = new FakeIO()
		const { engine, ends } = engineWith(io)
		const speaking = engine.speak('One.', OPTIONS)
		engine.stop()
		io.deliver('One.')
		await speaking
		expect(io.audios).toHaveLength(0)
		expect(ends()).toBe(0)
	})

	test('pause during a fetch holds the clip; resume starts it', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		void engine.speak('One.', OPTIONS)
		engine.pause()
		io.deliver('One.')
		await settle()
		const clip = io.audioFor('One.')[0]
		expect(clip.plays).toBe(0)

		engine.resume()
		expect(clip.plays).toBe(1)
	})

	test('a pause that interrupts play() is not a failure', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		let failed: unknown = null
		const original = io.load.bind(io)
		io.load = (bytes) => {
			const loaded = original(bytes)
			;(loaded.audio as FakeAudio).slowStart = true
			return loaded
		}
		void engine.speak('One.', OPTIONS).catch((err) => { failed = err })
		io.deliver('One.')
		await settle()
		const clip = io.audioFor('One.')[0]
		expect(clip.plays).toBe(1)

		engine.pause()
		await settle()
		expect(failed).toBeNull()
		expect(clip.released).toBe(false)
		engine.resume()
		expect(clip.plays).toBe(2)
	})

	test('a sentence asked for by hintNext and then spoken is requested once', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		engine.hintNext('Two.', OPTIONS)
		void engine.speak('Two.', OPTIONS)
		expect(io.requests).toHaveLength(1)
		io.deliver('Two.')
		await settle()
		expect(io.audioFor('Two.')[0].plays).toBe(1)
	})
})

describe('ElevenLabs: failures say why (W1 #1)', () => {
	test('a refused request rejects with the status and ElevenLabs\' own reason', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		const speaking = engine.speak('One.', OPTIONS)
		io.refuse('One.', 401, { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota.' } })
		expect(await failureOf(speaking)).toBe('ElevenLabs: the API key was refused or the quota is used up (HTTP 401). This request exceeds your quota.')
		const again = engine.speak('One.', OPTIONS)
		io.refuse('One.', 429)
		expect(await failureOf(again)).toContain('rate limit or quota exceeded (HTTP 429)')
	})

	test('the failure of a stopped sentence is swallowed', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		const speaking = engine.speak('One.', OPTIONS)
		engine.stop()
		io.refuse('One.', 429)
		expect(await failureOf(speaking)).toBeNull()
	})

	test('no network names the engine', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		const speaking = engine.speak('One.', OPTIONS)
		io.requests[0].fail(new Error('net::ERR_INTERNET_DISCONNECTED'))
		expect(await failureOf(speaking)).toBe('ElevenLabs: could not reach the server (net::ERR_INTERNET_DISCONNECTED).')
	})

	test('reasons come from every shape ElevenLabs uses', () => {
		expect(elevenLabsReason({ detail: 'plain' })).toBe('plain')
		expect(elevenLabsReason({ detail: { message: 'nested' } })).toBe('nested')
		expect(elevenLabsReason({ detail: [{ msg: 'listed' }] })).toBe('listed')
		expect(elevenLabsReason(null)).toBe('')
		expect(describeElevenLabsError(500)).toBe('ElevenLabs: request failed (HTTP 500).')
	})

	test('through the service: a 429 pauses the reading with the reason, and Play asks again', async () => {
		const io = new FakeIO()
		const engine = new ElevenLabsEngine({ apiKey: 'key', voiceId: 'voice', modelId: 'model' }, io)
		const service = new TTSService({ engineType: 'elevenlabs', language: 'pt' }, () => engine)
		await service.initialize()
		const doc: TTSDocument = {
			sections: [{ heading: 'One', headingId: 'h-1', sentences: ['One.', 'Two.'] }],
			allSentences: ['One.', 'Two.'],
			sectionMap: [0, 0],
		}
		service.setDocument(doc)
		const errors: string[] = []
		service.onError(({ message }) => errors.push(message))

		void service.play()
		await settle()
		io.refuse('One.', 429)
		await settle()
		expect(service.getState().playbackState).toBe('paused')
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain('HTTP 429')

		void service.play()
		await settle()
		expect(io.requests.map(r => r.text)).toContain('One.')
	})
})

describe('ElevenLabs: speed applies to the clip already playing (W1 #5)', () => {
	test('setRate changes the playing clip at once', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		void engine.speak('One.', { rate: 1 })
		io.deliver('One.')
		await settle()
		const clip = io.audioFor('One.')[0]
		expect(clip.playbackRate).toBe(1)
		engine.setRate(1.5)
		expect(clip.playbackRate).toBe(1.5)
		engine.setRate(10)
		expect(clip.playbackRate).toBe(2)
	})

	test('a speed set while the sentence is on the way is the speed it starts at', async () => {
		const io = new FakeIO()
		const { engine } = engineWith(io)
		void engine.speak('One.', { rate: 1 })
		engine.setRate(0.75)
		io.deliver('One.')
		await settle()
		expect(io.audioFor('One.')[0].playbackRate).toBe(0.75)
	})

	test('through the service: the slider reaches the clip already playing', async () => {
		const io = new FakeIO()
		const engine = new ElevenLabsEngine({ apiKey: 'key', voiceId: 'voice', modelId: 'model' }, io)
		const service = new TTSService({ engineType: 'elevenlabs', language: 'pt' }, () => engine)
		await service.initialize()
		service.setDocument({
			sections: [{ heading: 'One', headingId: 'h-1', sentences: ['One.'] }],
			allSentences: ['One.'],
			sectionMap: [0],
		})
		void service.play()
		await settle()
		io.deliver('One.')
		await settle()
		service.setRate(1.25)
		expect(io.audioFor('One.')[0].playbackRate).toBe(1.25)
	})
})
