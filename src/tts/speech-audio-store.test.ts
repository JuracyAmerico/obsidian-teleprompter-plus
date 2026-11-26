import { describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { FakeIndexedDB, fakeIndexedDbFactory } from '../test-support/fake-indexeddb'
import type { RequestUrlParam } from 'obsidian'
import type { ElevenLabsIO, ElevenLabsResponse, LoadedAudio, PlayableAudio } from './elevenlabs-engine'
import type { SpeechAudioStore } from './speech-audio-store'

void mock.module('obsidian', () => obsidianStub)
const { ElevenLabsEngine } = await import('./elevenlabs-engine')
const { DEFAULT_SETTINGS } = await import('../settings')
const { IndexedDbSpeechAudioStore, DB_NAME, AUDIO, META, megabytesToBytes } = await import('./speech-audio-store')

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 20))
const OPTIONS = { rate: 1 }

function bytesOf(text: string): ArrayBuffer {
	return new TextEncoder().encode(text).buffer
}

function textOf(bytes: ArrayBuffer | null): string | null {
	return bytes === null ? null : new TextDecoder().decode(bytes)
}

function storeOver(fake: FakeIndexedDB, maxBytes = 1000) {
	const store = new IndexedDbSpeechAudioStore(fakeIndexedDbFactory(fake))
	store.setMaxBytes(maxBytes)
	return store
}

describe('speech audio store (IndexedDB)', () => {
	test('a clip comes back as it went in', async () => {
		const store = storeOver(new FakeIndexedDB())
		await store.put('k', bytesOf('hello'))
		expect(textOf(await store.get('k'))).toBe('hello')
		expect(await store.get('other')).toBeNull()
	})

	test('a second store on the same database finds what the first kept', async () => {
		const fake = new FakeIndexedDB()
		await storeOver(fake).put('k', bytesOf('kept'))
		expect(textOf(await storeOver(fake).get('k'))).toBe('kept')
	})

	test('past the cap the oldest-used clips go first, and a read counts as use', async () => {
		const fake = new FakeIndexedDB()
		const store = storeOver(fake, 30)
		await store.put('a', bytesOf('aaaaaaaaaa'))
		await store.put('b', bytesOf('bbbbbbbbbb'))
		await store.put('c', bytesOf('cccccccccc'))
		await store.get('a') // a is now newer than b
		await store.put('d', bytesOf('dddddddddd'))
		expect(textOf(await store.get('b'))).toBeNull()
		expect(textOf(await store.get('a'))).toBe('aaaaaaaaaa')
		expect(textOf(await store.get('c'))).toBe('cccccccccc')
		expect(textOf(await store.get('d'))).toBe('dddddddddd')
		expect(await store.usage()).toEqual({ bytes: 30, entries: 3 })
	})

	test('a clip bigger than a whole cap is not kept, and keeps nothing out', async () => {
		const store = storeOver(new FakeIndexedDB(), 5)
		await store.put('big', bytesOf('0123456789'))
		expect(await store.usage()).toEqual({ bytes: 0, entries: 0 })
	})

	test('lowering the cap evicts at the next put', async () => {
		const store = storeOver(new FakeIndexedDB(), 100)
		await store.put('a', bytesOf('aaaaaaaaaa'))
		await store.put('b', bytesOf('bbbbbbbbbb'))
		store.setMaxBytes(10)
		await store.put('c', bytesOf('cccccccccc'))
		expect((await store.usage()).entries).toBe(1)
		expect(textOf(await store.get('c'))).toBe('cccccccccc')
	})

	test('clear empties the store', async () => {
		const store = storeOver(new FakeIndexedDB())
		await store.put('a', bytesOf('aaa'))
		await store.put('b', bytesOf('bbb'))
		await store.clear()
		expect(await store.get('a')).toBeNull()
		expect(await store.usage()).toEqual({ bytes: 0, entries: 0 })
	})

	test('a damaged record is a miss and is removed', async () => {
		const fake = new FakeIndexedDB()
		const store = storeOver(fake)
		await store.put('text', bytesOf('good'))
		await store.put('short', bytesOf('good'))
		await store.put('orphan', bytesOf('good'))
		fake.peek(DB_NAME, AUDIO).set('text', { key: 'text', bytes: 'not audio' })
		fake.peek(DB_NAME, AUDIO).set('short', { key: 'short', bytes: bytesOf('go') })
		fake.peek(DB_NAME, META).delete('orphan')
		expect(await store.get('text')).toBeNull()
		expect(await store.get('short')).toBeNull()
		expect(await store.get('orphan')).toBeNull()
		expect(fake.peek(DB_NAME, AUDIO).size).toBe(0)
		expect(fake.peek(DB_NAME, META).size).toBe(0)
	})

	test('no IndexedDB, or storage that refuses to open, is a miss and never an error', async () => {
		const none = new IndexedDbSpeechAudioStore(null)
		await none.put('k', bytesOf('x'))
		expect(await none.get('k')).toBeNull()
		await none.clear()
		const blocked = new FakeIndexedDB()
		blocked.failOpen = true
		const store = storeOver(blocked)
		await store.put('k', bytesOf('x'))
		expect(await store.get('k')).toBeNull()
		expect(await store.usage()).toEqual({ bytes: 0, entries: 0 })
	})

	test('the default cap is 200 MB', () => {
		expect(DEFAULT_SETTINGS.elevenLabsAudioCacheMb).toBe(200)
		expect(megabytesToBytes(DEFAULT_SETTINGS.elevenLabsAudioCacheMb)).toBe(200 * 1024 * 1024)
	})

	test('megabytes convert to bytes, and nonsense falls back to the default', () => {
		expect(megabytesToBytes(200)).toBe(200 * 1024 * 1024)
		expect(megabytesToBytes(Number.NaN)).toBe(200 * 1024 * 1024)
		expect(megabytesToBytes(-1)).toBe(200 * 1024 * 1024)
	})
})

class FakeAudio implements PlayableAudio {
	playbackRate = 1
	onended: ((event: Event) => unknown) | null = null
	onerror: ((event: Event | string) => unknown) | null = null
	constructor(readonly text: string) {}
	play(): Promise<void> {
		return Promise.resolve()
	}
	pause(): void {}
	end(): void {
		this.onended?.(new Event('ended'))
	}
}

/** The network answers every request at once with the sentence as its audio; every call is counted. */
class AnsweringIO implements ElevenLabsIO {
	requests: string[] = []
	audios: FakeAudio[] = []

	request(param: RequestUrlParam): Promise<ElevenLabsResponse> {
		const text = param.body ? (JSON.parse(param.body as string) as { text: string }).text : ''
		this.requests.push(text)
		return Promise.resolve({ status: 200, arrayBuffer: bytesOf(text), json: null })
	}

	load(bytes: ArrayBuffer): LoadedAudio {
		const audio = new FakeAudio(new TextDecoder().decode(bytes))
		this.audios.push(audio)
		return { audio, release: () => {} }
	}
}

function engineOn(io: AnsweringIO, store: SpeechAudioStore | null, voiceId = 'voice') {
	return new ElevenLabsEngine({ apiKey: 'key', voiceId, modelId: 'model' }, io, store)
}

/** Speaks one sentence to the end of its clip. */
async function readAloud(engine: InstanceType<typeof ElevenLabsEngine>, io: AnsweringIO, text: string): Promise<void> {
	const spoken = engine.speak(text, OPTIONS)
	await settle()
	io.audios[io.audios.length - 1]?.end()
	await spoken
}

describe('ElevenLabs engine with the persistent audio store', () => {
	test('a sentence read once is read from the store by a new engine, with no network call', async () => {
		const fake = new FakeIndexedDB()
		const firstIO = new AnsweringIO()
		const first = engineOn(firstIO, storeOver(fake))
		await readAloud(first, firstIO, 'Rehearse this.')
		await settle()
		expect(firstIO.requests).toEqual(['Rehearse this.'])
		first.destroy()

		const secondIO = new AnsweringIO()
		const second = engineOn(secondIO, storeOver(fake))
		await readAloud(second, secondIO, 'Rehearse this.')
		expect(secondIO.requests).toEqual([])
		expect(secondIO.audios.map(a => a.text)).toEqual(['Rehearse this.'])
	})

	test('hintNext saves the next sentence, so a later engine plays it without the network', async () => {
		const fake = new FakeIndexedDB()
		const io = new AnsweringIO()
		engineOn(io, storeOver(fake)).hintNext('Coming up.', OPTIONS)
		await settle()
		expect(io.requests).toEqual(['Coming up.'])

		const laterIO = new AnsweringIO()
		await readAloud(engineOn(laterIO, storeOver(fake)), laterIO, 'Coming up.')
		expect(laterIO.requests).toEqual([])
	})

	test('the same engine answers a repeat from its Map, without asking the store again', async () => {
		const fake = new FakeIndexedDB()
		const real = storeOver(fake)
		let reads = 0
		const counting: SpeechAudioStore = {
			get: (key) => { reads++; return real.get(key) },
			put: (key, bytes) => real.put(key, bytes),
			clear: () => real.clear(),
			setMaxBytes: (n) => real.setMaxBytes(n),
			usage: () => real.usage(),
		}
		const io = new AnsweringIO()
		const engine = engineOn(io, counting)
		await readAloud(engine, io, 'Again.')
		await readAloud(engine, io, 'Again.')
		expect(reads).toBe(1)
		expect(io.requests).toEqual(['Again.'])
	})

	test('a damaged stored clip falls back to the network without a word, and is repaired', async () => {
		const fake = new FakeIndexedDB()
		const seedIO = new AnsweringIO()
		await readAloud(engineOn(seedIO, storeOver(fake)), seedIO, 'Fragile.')
		await settle()
		const [key] = [...fake.peek(DB_NAME, AUDIO).keys()]
		fake.peek(DB_NAME, AUDIO).set(key, { key, bytes: 'garbage' })

		const io = new AnsweringIO()
		await readAloud(engineOn(io, storeOver(fake)), io, 'Fragile.')
		expect(io.requests).toEqual(['Fragile.'])
		expect(io.audios[0].text).toBe('Fragile.')
		await settle()

		const afterIO = new AnsweringIO()
		await readAloud(engineOn(afterIO, storeOver(fake)), afterIO, 'Fragile.')
		expect(afterIO.requests).toEqual([])
	})

	test('a store that throws is only a miss', async () => {
		const broken: SpeechAudioStore = {
			get: () => Promise.reject(new Error('disk on fire')),
			put: () => Promise.reject(new Error('disk on fire')),
			clear: () => Promise.reject(new Error('disk on fire')),
			setMaxBytes: () => {},
			usage: () => Promise.reject(new Error('disk on fire')),
		}
		const io = new AnsweringIO()
		await readAloud(engineOn(io, broken), io, 'Still plays.')
		expect(io.requests).toEqual(['Still plays.'])
	})

	test('another voice is another clip', async () => {
		const fake = new FakeIndexedDB()
		const firstIO = new AnsweringIO()
		await readAloud(engineOn(firstIO, storeOver(fake), 'rachel'), firstIO, 'Same words.')
		await settle()

		const io = new AnsweringIO()
		await readAloud(engineOn(io, storeOver(fake), 'adam'), io, 'Same words.')
		expect(io.requests).toEqual(['Same words.'])
	})

	test('the rate is not part of the key: a slower read reuses the same clip', async () => {
		const fake = new FakeIndexedDB()
		const firstIO = new AnsweringIO()
		await readAloud(engineOn(firstIO, storeOver(fake)), firstIO, 'Pace.')
		await settle()

		const io = new AnsweringIO()
		const engine = engineOn(io, storeOver(fake))
		const spoken = engine.speak('Pace.', { rate: 1.5 })
		await settle()
		io.audios[0].end()
		await spoken
		expect(io.requests).toEqual([])
		expect(io.audios[0].playbackRate).toBe(1.5)
	})

	test('with no store at all the engine behaves as before', async () => {
		const io = new AnsweringIO()
		await readAloud(engineOn(io, null), io, 'Plain.')
		expect(io.requests).toEqual(['Plain.'])
	})
})
