/**
 * Measures what Obsidian on a phone allows, so Teleprompter Plus plans from facts.
 * One file, no Node at load, no network. The report goes to a note after every step, so a step
 * that hangs still leaves what was measured. Microphone audio is reduced to a peak level and dropped.
 */
import { Modal, Notice, Platform, Plugin, apiVersion } from 'obsidian'
import type { App } from 'obsidian'

declare const require: undefined | ((name: string) => unknown)

const STEP_TIMEOUT_MS = 8000
const STORAGE_TEST_BYTES = 40 * 1024 * 1024

type Row = [string, string]

/** A step that never settles must not stop the next one. */
export async function bounded(work: () => Promise<string>, timeoutMs = STEP_TIMEOUT_MS): Promise<string> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<string>(resolve => {
		timer = setTimeout(() => resolve(`TIMEOUT after ${timeoutMs} ms`), timeoutMs)
	})
	try {
		return await Promise.race([work(), timeout])
	} catch (err) {
		const e = err as { name?: string; message?: string }
		return `FAILED ${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`
	} finally {
		if (timer) clearTimeout(timer)
	}
}

function attempt(work: () => string): string {
	try {
		return work()
	} catch (err) {
		const e = err as { name?: string; message?: string }
		return `FAILED ${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`
	}
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function present(owner: object | undefined, name: string): string {
	return owner && name in owner ? 'present' : 'absent'
}

/** What each module name does here: the one fact the plugin's load path depends on. */
function requireResult(name: string): string {
	if (typeof require !== 'function') return 'no require function'
	return attempt(() => {
		const loaded = require(name)
		return loaded === undefined || loaded === null ? `returned ${String(loaded)}` : `loaded (${typeof loaded})`
	})
}

/** A short tone, made here, so the playback test needs no network. */
function toneUrl(): string {
	const rate = 8000
	const samples = rate / 4
	const buffer = new ArrayBuffer(44 + samples)
	const view = new DataView(buffer)
	const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)) }
	text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVEfmt ')
	view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
	view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true)
	text(36, 'data'); view.setUint32(40, samples, true)
	for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128 + 40 * Math.sin((2 * Math.PI * 440 * i) / rate))
	return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

/** Played the way the read-aloud engine plays: a new element each time, then play(). */
function playOnce(url: string): Promise<string> {
	return new Promise(resolve => {
		const audio = new Audio(url)
		audio.onended = () => resolve('played to the end')
		audio.onerror = () => resolve('FAILED media error')
		audio.play().catch((err: { name?: string }) => resolve(`REFUSED ${err?.name ?? 'Error'}`))
	})
}

export class ProbeReport {
	readonly rows: Row[] = []
	private path: string | null = null
	private saving: Promise<void> = Promise.resolve()

	constructor(private app: Pick<App, 'vault'>, private stamp: string) {}

	markdown(): string {
		const lines = ['# T+ mobile probe', '', `Run: ${this.stamp}`, '', '| Check | Result |', '|---|---|']
		for (const [name, value] of this.rows) lines.push(`| ${name} | ${value.replace(/\|/g, '/').replace(/\n/g, ' ')} |`)
		return lines.join('\n') + '\n'
	}

	/** Saved after every step, in order, since the two test runs overlap. */
	add(name: string, value: string): Promise<void> {
		this.rows.push([name, value])
		this.saving = this.saving.then(() => this.save())
		return this.saving
	}

	/** A failure to save is on screen, since the note is the only way back. */
	private async save(): Promise<void> {
		try {
			const body = this.markdown()
			if (!this.path) {
				this.path = `T+ mobile probe ${this.stamp}.md`
				await this.app.vault.create(this.path, body)
			} else {
				await this.app.vault.adapter.write(this.path, body)
			}
		} catch (err) {
			new Notice(`Probe could not save its note: ${String(err)}`)
		}
	}
}

async function storageTest(): Promise<string> {
	const started = performance.now()
	const name = 'tp-mobile-probe'
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		const open = indexedDB.open(name, 1)
		open.onupgradeneeded = () => open.result.createObjectStore('blobs')
		open.onsuccess = () => resolve(open.result)
		open.onerror = () => reject(open.error ?? new Error('open failed'))
	})
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction('blobs', 'readwrite')
		tx.objectStore('blobs').put(new ArrayBuffer(STORAGE_TEST_BYTES), 'test')
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error ?? new Error('write failed'))
		tx.onabort = () => reject(tx.error ?? new Error('write aborted'))
	})
	db.close()
	indexedDB.deleteDatabase(name)
	return `40 MB written in ${Math.round(performance.now() - started)} ms, then deleted`
}

async function workerTest(): Promise<string> {
	const url = URL.createObjectURL(new Blob(['postMessage("up")'], { type: 'text/javascript' }))
	return await new Promise<string>(resolve => {
		const worker = new Worker(url)
		worker.onmessage = () => { worker.terminate(); URL.revokeObjectURL(url); resolve('runs') }
		worker.onerror = event => { worker.terminate(); resolve(`FAILED ${event.message || 'worker error'}`) }
	})
}

async function workletTest(): Promise<string> {
	const context = new AudioContext({ sampleRate: 48000 })
	const source = `class P extends AudioWorkletProcessor { process() { return true } } registerProcessor('tp-probe', P)`
	const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
	try {
		await context.audioWorklet.addModule(url)
		const node = new AudioWorkletNode(context, 'tp-probe')
		node.disconnect()
		return `runs; context rate ${context.sampleRate} Hz`
	} finally {
		URL.revokeObjectURL(url)
		await context.close()
	}
}

/** The audio stops here: only the loudest moment is kept, as a number. */
async function microphoneTest(): Promise<string> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
	const context = new AudioContext()
	try {
		const analyser = context.createAnalyser()
		analyser.fftSize = 2048
		context.createMediaStreamSource(stream).connect(analyser)
		if (context.state === 'suspended') await context.resume()
		const samples = new Float32Array(analyser.fftSize)
		let peak = 0
		const until = performance.now() + 1500
		while (performance.now() < until) {
			analyser.getFloatTimeDomainData(samples)
			for (const value of samples) peak = Math.max(peak, Math.abs(value))
			await wait(50)
		}
		const track = stream.getAudioTracks()[0]
		return `granted; track rate ${track?.getSettings().sampleRate ?? 'unknown'} Hz, context rate ${context.sampleRate} Hz, peak ${peak.toFixed(4)}${peak === 0 ? ' (silent stream)' : ''}`
	} finally {
		stream.getTracks().forEach(track => track.stop())
		await context.close()
	}
}

async function wakeLockTest(): Promise<string> {
	const lock = await (navigator as unknown as { wakeLock: { request(type: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request('screen')
	await lock.release()
	return 'granted and released'
}

function speechTest(): Promise<string> {
	return new Promise(resolve => {
		const utterance = new SpeechSynthesisUtterance('Test.')
		utterance.onend = () => resolve('spoke to the end')
		utterance.onerror = event => resolve(`FAILED ${event.error}`)
		speechSynthesis.speak(utterance)
	})
}

export async function runPassive(report: ProbeReport): Promise<void> {
	await report.add('Obsidian API', apiVersion)
	await report.add('Platform', `mobile ${Platform.isMobile}, iOS ${Platform.isIosApp}, Android ${Platform.isAndroidApp}, phone ${Platform.isPhone}, tablet ${Platform.isTablet}`)
	await report.add('User agent', typeof navigator === 'undefined' ? 'none' : navigator.userAgent)
	await report.add('Origin', typeof location === 'undefined' ? 'none' : location.origin)
	await report.add('typeof require', typeof require)
	for (const name of ['obsidian', 'fs', 'path', 'os', 'child_process', 'electron', 'http']) {
		await report.add(`require('${name}')`, requireResult(name))
	}
	await report.add('Regex lookbehind', attempt(() => (new RegExp('(?<=a)b').test('ab') ? 'supported' : 'parsed, wrong result')))
	await report.add('WebAssembly', await bounded(async () => {
		await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
		return 'compiles'
	}))
	const win = (typeof window === 'undefined' ? undefined : window) as object | undefined
	const nav = (typeof navigator === 'undefined' ? undefined : navigator) as object | undefined
	await report.add('Native speech recognition API', `${present(win, 'SpeechRecognition')} / webkit ${present(win, 'webkitSpeechRecognition')} (noted, never called)`)
	await report.add('speechSynthesis', present(win, 'speechSynthesis'))
	await report.add('wakeLock', present(nav, 'wakeLock'))
	await report.add('mediaDevices', present(nav, 'mediaDevices'))
	await report.add('AudioContext', present(win, 'AudioContext'))
	await report.add('Worker from a Blob', await bounded(workerTest))
	await report.add('IndexedDB', await bounded(storageTest, 30000))
	await report.add('Synthesis voices', await bounded(async () => {
		// The list loads late: asking at once answers zero on a machine that has dozens
		if (speechSynthesis.getVoices().length === 0) {
			await Promise.race([
				new Promise(resolve => speechSynthesis.addEventListener('voiceschanged', resolve, { once: true })),
				wait(3000),
			])
		}
		const all = speechSynthesis.getVoices()
		const count = (prefix: string) => all.filter(v => v.lang.toLowerCase().startsWith(prefix)).length
		return `${all.length} total, ${count('en')} English, ${count('pt')} Portuguese`
	}))
}

/** Needs a tap: iOS grants these only from a gesture, and read-aloud chains past that gesture. */
export async function runAfterTap(report: ProbeReport): Promise<void> {
	const url = toneUrl()
	const direct = playOnce(url)
	await report.add('Tone 1, straight from the tap', await bounded(() => direct))
	await wait(1000)
	await report.add('Tone 2, one second later with no tap', await bounded(() => playOnce(url)))
	await wait(1000)
	await report.add('Tone 3, chained with no tap', await bounded(() => playOnce(url)))
	URL.revokeObjectURL(url)
	await report.add('Spoken test', await bounded(speechTest))
	await report.add('Wake lock', await bounded(wakeLockTest))
	await report.add('AudioWorklet from a Blob', await bounded(workletTest))
	await report.add('Microphone', await bounded(microphoneTest, 60000))
	await report.add('Finished', 'all steps ran')
}

class ProbeModal extends Modal {
	constructor(app: App, private report: ProbeReport) {
		super(app)
	}

	onOpen(): void {
		const { contentEl } = this
		contentEl.createEl('h3', { text: 'T+ mobile probe' })
		const status = contentEl.createEl('p', {
			text: 'Tap once. You will hear three short tones and one spoken word, and iOS may ask for the microphone. No audio is kept.',
		})
		const run = contentEl.createEl('button', { text: 'Run the test', cls: 'mod-cta' })
		run.addEventListener('click', () => {
			run.disabled = true
			status.setText('Running. This takes under a minute...')
			void runAfterTap(this.report).then(() => {
				status.setText('Done. The result is saved in a note in this vault and returns through iCloud. Keep the app open for a minute so it can upload.')
				const copy = contentEl.createEl('button', { text: 'Copy the result' })
				copy.addEventListener('click', () => {
					void navigator.clipboard.writeText(this.report.markdown()).then(() => new Notice('Copied'))
				})
			})
		})
	}
}

export default class MobileProbePlugin extends Plugin {
	report: ProbeReport | null = null

	onload(): void {
		this.addCommand({ id: 'run', name: 'Run the probe', callback: () => void this.start() })
		this.app.workspace.onLayoutReady(() => {
			if (Platform.isMobile) void this.start()
		})
	}

	async start(): Promise<void> {
		const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')
		this.report = new ProbeReport(this.app, stamp)
		new ProbeModal(this.app, this.report).open()
		await runPassive(this.report)
	}
}
