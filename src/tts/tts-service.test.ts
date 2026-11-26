import { describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import type { SpeakOptions, TTSDocument, TTSEngine, TTSVoice } from './tts-types'

void mock.module('obsidian', () => obsidianStub)
const { TTSService } = await import('./tts-service')
const { createRateMemory } = await import('./rate-memory')

/** A speak() the test finishes (clip ended) or fails by hand. */
interface PendingSpeech {
	text: string
	options: SpeakOptions
	resolve: () => void
	reject: (error: Error) => void
}

/** Records what the service asks of an engine; nothing plays. */
class FakeEngine implements TTSEngine {
	readonly name = 'Fake'
	readonly isAvailable = true
	spoken: string[] = []
	pending: PendingSpeech[] = []
	hints: string[] = []
	rates: number[] = []
	calls: string[] = []
	private end: (() => void) | null = null

	initialize(): Promise<void> { return Promise.resolve() }
	getVoices(): Promise<TTSVoice[]> { return Promise.resolve([]) }
	onEnd(callback: () => void): void { this.end = callback }
	destroy(): void { this.calls.push('destroy') }
	pause(): void { this.calls.push('pause') }
	resume(): void { this.calls.push('resume') }
	stop(): void { this.calls.push('stop') }
	setRate(rate: number): void { this.rates.push(rate) }
	hintNext(text: string): void { this.hints.push(text) }

	speak(text: string, options: SpeakOptions): Promise<void> {
		this.spoken.push(text)
		this.calls.push(`speak:${text}`)
		return new Promise<void>((resolve, reject) => this.pending.push({ text, options, resolve, reject }))
	}

	/** The newest clip plays to its end. */
	finish(): void {
		const speech = this.pending.pop()
		if (!speech) throw new Error('nothing is being spoken')
		this.end?.()
		speech.resolve()
	}

	/** The speech at `index` (default: newest) fails. */
	fail(message: string, index = this.pending.length - 1): void {
		const [speech] = this.pending.splice(index, 1)
		if (!speech) throw new Error('nothing is being spoken')
		speech.reject(new Error(message))
	}
}

const SENTENCES = ['Alpha speaks.', 'Bravo speaks.', 'Charlie speaks.', 'Delta speaks.']

function documentOf(sentences: string[]): TTSDocument {
	return {
		sections: [{ heading: 'One', headingId: 'h-1', sentences }],
		allSentences: sentences,
		sectionMap: sentences.map(() => 0),
	}
}

/** Lets awaited promise chains inside the service run. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

async function serviceWith(engine: FakeEngine, rate = 1) {
	const service = new TTSService({ language: 'pt', rate }, () => engine)
	await service.initialize()
	service.setDocument(documentOf(SENTENCES))
	const errors: string[] = []
	service.onError(({ message }) => errors.push(message))
	return { service, errors }
}

describe('read-aloud failure is visible (W1 #1)', () => {
	test('a failed sentence pauses the reading, reports why once, and Play tries it again', async () => {
		const engine = new FakeEngine()
		const { service, errors } = await serviceWith(engine)
		void service.play()
		await settle()
		engine.fail('ElevenLabs: rate limit or quota exceeded (HTTP 429). Check your plan credits.')
		await settle()

		expect(service.getState().playbackState).toBe('paused')
		expect(service.getState().currentSentenceIndex).toBe(0)
		expect(errors).toEqual(['ElevenLabs: rate limit or quota exceeded (HTTP 429). Check your plan credits.'])

		void service.play()
		await settle()
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Alpha speaks.'])
		expect(engine.calls).not.toContain('resume')
		expect(service.getState().playbackState).toBe('playing')
	})

	test('a sentence that failed while paused keeps the pause, is reported, and Play speaks it afresh', async () => {
		const engine = new FakeEngine()
		const { service, errors } = await serviceWith(engine)
		void service.play()
		await settle()
		service.pause()
		engine.fail('ElevenLabs: invalid API key (HTTP 401).')
		await settle()

		expect(service.getState().playbackState).toBe('paused')
		expect(errors).toHaveLength(1)
		void service.play()
		await settle()
		expect(engine.calls).not.toContain('resume')
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Alpha speaks.'])
	})
})

describe('a skipped or stopped sentence stays quiet (W1 #2)', () => {
	test('the failure of a sentence already skipped is not reported and does not pause', async () => {
		const engine = new FakeEngine()
		const { service, errors } = await serviceWith(engine)
		void service.play()
		await settle()
		void service.nextSentence()
		await settle()
		engine.fail('stale', 0)
		await settle()

		expect(errors).toEqual([])
		expect(service.getState().playbackState).toBe('playing')
		expect(service.getState().currentSentenceIndex).toBe(1)
	})

	test('pause, then next, then Play speaks the new sentence instead of resuming nothing', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		void service.play()
		await settle()
		service.pause()
		await service.nextSentence()
		expect(service.getState().playbackState).toBe('paused')

		void service.play()
		await settle()
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Bravo speaks.'])
		expect(engine.calls).not.toContain('resume')
	})

	test('a plain pause resumes the clip in the engine', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		void service.play()
		await settle()
		service.pause()
		void service.play()
		await settle()
		expect(engine.calls.filter(c => c === 'resume')).toHaveLength(1)
		expect(engine.spoken).toEqual(['Alpha speaks.'])
	})
})

describe('read-aloud speed (W1 #3, #5)', () => {
	test('a speed change reaches the clip already playing', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		void service.play()
		await settle()
		service.setRate(1.5)
		expect(engine.rates).toEqual([1.5])
		expect(service.getState().rate).toBe(1.5)
		service.setRate(9)
		expect(engine.rates.at(-1)).toBe(2)
	})

	test('a saved speed is what a rebuilt service starts with', async () => {
		const settings = { ttsRate: 1 }
		let saves = 0
		const queued: Array<() => void> = []
		const remember = createRateMemory(settings, () => { saves++ }, 500, {
			set: (run) => { queued.push(run); return queued.length },
			clear: (handle) => { queued[(handle as number) - 1] = () => {} },
		})

		remember(1.25)
		remember(1.4)
		remember(1.5)
		expect(settings.ttsRate).toBe(1.5)
		expect(saves).toBe(0)
		queued.forEach(run => run())
		expect(saves).toBe(1)

		// initTTS builds the service from settings: the first floating read, or after a voice change
		const engine = new FakeEngine()
		const rebuilt = new TTSService({ rate: settings.ttsRate }, () => engine)
		await rebuilt.initialize()
		rebuilt.setDocument(documentOf(SENTENCES))
		void rebuilt.play()
		await settle()
		expect(rebuilt.getState().rate).toBe(1.5)
		expect(engine.pending[0].options.rate).toBe(1.5)

		remember(Number.NaN)
		remember(7)
		expect(settings.ttsRate).toBe(2)
	})
})

describe('repeat and loop the current sentence (W1 #6)', () => {
	test('repeat reads the current sentence again from its start', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		void service.play()
		await settle()
		engine.finish()
		await settle()
		expect(service.getState().currentSentenceIndex).toBe(1)

		void service.repeatCurrent()
		await settle()
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Bravo speaks.', 'Bravo speaks.'])
		expect(engine.calls.at(-2)).toBe('stop')
		expect(service.getState().currentSentenceIndex).toBe(1)
	})

	test('repeat from a pause plays; with nothing being read it does nothing', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		await service.repeatCurrent()
		expect(engine.spoken).toEqual([])

		void service.play()
		await settle()
		service.pause()
		void service.repeatCurrent()
		await settle()
		expect(service.getState().playbackState).toBe('playing')
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Alpha speaks.'])
	})

	test('loop keeps reading the same sentence and pregenerates nothing; off moves on', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		const states: boolean[] = []
		service.onStateChange(state => states.push(state.loop))
		expect(service.toggleLoop()).toBe(true)
		expect(states.at(-1)).toBe(true)

		void service.play()
		await settle()
		engine.finish()
		await settle()
		engine.finish()
		await settle()
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Alpha speaks.', 'Alpha speaks.'])
		expect(engine.hints).toEqual([])

		service.setLoop(false)
		engine.finish()
		await settle()
		expect(engine.spoken.at(-1)).toBe('Bravo speaks.')
		expect(service.getState().loop).toBe(false)
	})
})

describe('a pause announced at a sentence start (a take\'s section end)', () => {
	test('a sentence-start listener pauses before the sentence is spoken; Play speaks it from its start', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		const starts: number[] = []
		service.onSentenceStartEvent(({ index }) => {
			starts.push(index)
			// The take tracker sees the third sentence's block reach a heading and stops there, once.
			if (index === 2 && starts.filter(i => i === 2).length === 1) service.pauseBeforeSentence()
		})
		void service.play()
		await settle()
		engine.finish() // Alpha
		await settle()
		engine.finish() // Bravo
		await settle()

		expect(service.getState().playbackState).toBe('paused')
		expect(service.getState().currentSentenceIndex).toBe(2)
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Bravo speaks.'])

		void service.play()
		await settle()
		expect(engine.spoken).toEqual(['Alpha speaks.', 'Bravo speaks.', 'Charlie speaks.'])
		expect(engine.calls).not.toContain('resume')
		expect(service.getState().playbackState).toBe('playing')
	})

	test('it does nothing unless the reading is playing', async () => {
		const engine = new FakeEngine()
		const { service } = await serviceWith(engine)
		service.pauseBeforeSentence()
		expect(service.getState().playbackState).toBe('idle')
		void service.play()
		await settle()
		service.pause()
		service.pauseBeforeSentence()
		expect(engine.calls.filter(c => c === 'stop')).toEqual([])
	})
})
