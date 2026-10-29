import { describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { EventEmitter } from 'events'

void mock.module('obsidian', () => obsidianStub)

const { AppleSpeechRecognizer } = await import('./apple-speech-recognizer')

/** A stand-in for the spawned helper. kill() answers like the real one: it prints a "stopped"
 *  status line on its way out, a moment after the signal. */
class FakeProc extends EventEmitter {
	stdout = new EventEmitter()
	stderr = new EventEmitter()
	killed: string[] = []
	kill(signal: string): boolean {
		this.killed.push(signal)
		setTimeout(() => this.say({ type: 'status', value: 'stopped' }), 0)
		return true
	}
	say(obj: Record<string, unknown>): void {
		this.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n'))
	}
}

interface BuildOptions {
	shortMs?: number
	longMs?: number
	maxRecognitionErrors?: number
	now?: () => number
}

function build({ shortMs = 15000, longMs = 90000, maxRecognitionErrors = 20, now = () => 0 }: BuildOptions = {}) {
	const procs: FakeProc[] = []
	const rec = new AppleSpeechRecognizer({
		spawn: (() => {
			const proc = new FakeProc()
			procs.push(proc)
			return proc
		}) as never,
		isMacOS: true,
		sidecarExists: () => true,
		startTimeoutMs: shortMs,
		permissionDialogTimeoutMs: longMs,
		maxConsecutiveRecognitionErrors: maxRecognitionErrors,
		recognitionErrorWindowMs: 10000,
		now,
	})
	const statuses: string[] = []
	const errors: Array<{ code: string; message: string }> = []
	rec.onStatus(s => statuses.push(s))
	rec.onError((code, message) => errors.push({ code, message }))
	return { rec, procs, statuses, errors }
}

const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('AppleSpeechRecognizer start failures', () => {
	test('early exit: a helper that dies before listening reports its exit code and stderr', async () => {
		const { rec, procs, statuses, errors } = build()
		await rec.start()
		procs[0].stderr.emit('data', Buffer.from('tcc: denied'))
		procs[0].emit('close', 9, null)
		expect(errors).toHaveLength(1)
		expect(errors[0].message).toContain('exit code 9')
		expect(errors[0].message).toContain('tcc: denied')
		expect(statuses.at(-1)).toBe('error')
	})

	test('early exit: a helper killed by a signal reports the signal', async () => {
		const { rec, procs, errors } = build()
		await rec.start()
		procs[0].emit('close', null, 'SIGKILL')
		expect(errors).toHaveLength(1)
		expect(errors[0].message).toContain('SIGKILL')
	})

	test('early exit: a helper that reported its own error is not reported twice', async () => {
		const { rec, procs, errors } = build()
		await rec.start()
		procs[0].say({ type: 'error', code: 'mic-denied', message: 'Microphone permission denied' })
		procs[0].emit('close', 1, null)
		expect(errors).toHaveLength(1)
		expect(errors[0].code).toBe('microphone-denied')
	})

	test('a fatal error line stops the helper', async () => {
		const { rec, procs } = build()
		await rec.start()
		procs[0].say({ type: 'error', code: 'speech-denied', message: 'denied' })
		expect(procs[0].killed).toContain('SIGTERM')
	})

	test('an error after listening is reported once, even when the helper then exits', async () => {
		const { rec, procs, errors } = build()
		await rec.start()
		procs[0].say({ type: 'status', value: 'listening' })
		procs[0].say({ type: 'error', code: 'audio-start', message: 'audio engine failed' })
		procs[0].emit('close', 1, null)
		expect(errors).toHaveLength(1)
	})

	test('silent helper: a current helper that goes quiet errors inside the short limit and is killed', async () => {
		const { rec, procs, errors } = build({ shortMs: 30, longMs: 5000 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'authorizing', prompt: false })
		await tick(100)
		expect(errors).toHaveLength(1)
		expect(errors[0].code).toBe('permission-timeout')
		expect(errors[0].message).toContain('Privacy & Security')
		expect(procs[0].killed).toContain('SIGTERM')
	})

	test('silent helper: an old-style helper with no prompt field gets the long limit, not the short one', async () => {
		const { rec, procs, errors } = build({ shortMs: 30, longMs: 400 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'authorizing' })
		await tick(200)
		expect(errors).toHaveLength(0)
		await tick(400)
		expect(errors).toHaveLength(1)
		expect(errors[0].code).toBe('permission-timeout')
	})

	test('silent helper: a pending permission dialog keeps the long limit', async () => {
		const { rec, procs, errors } = build({ shortMs: 30, longMs: 400 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'authorizing', prompt: true })
		await tick(150)
		expect(errors).toHaveLength(0)
	})

	test('stays error: the final status after a start timeout is error, never off, even when the helper prints stopped', async () => {
		const { rec, procs, statuses } = build({ shortMs: 30, longMs: 5000 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'authorizing', prompt: false })
		await tick(150)
		expect(procs[0].killed).toContain('SIGTERM')
		expect(statuses.at(-1)).toBe('error')
		expect(statuses).not.toContain('off')
	})

	test('a dying helper cannot poison a newer run: its late error is ignored and the new run still times out', async () => {
		const { rec, procs, errors, statuses } = build({ shortMs: 30, longMs: 5000 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'authorizing', prompt: false })
		await tick(100)
		expect(errors).toHaveLength(1)

		await rec.start()
		procs[1].say({ type: 'status', value: 'authorizing', prompt: false })
		procs[0].say({ type: 'error', code: 'speech-denied', message: 'late line from the old helper' })
		procs[0].emit('close', 1, null)
		expect(errors).toHaveLength(1)

		await tick(100)
		expect(errors).toHaveLength(2)
		expect(errors[1].code).toBe('permission-timeout')
		expect(statuses.at(-1)).toBe('error')
	})

	test('same chunk: lines after the one that ended the run are dropped', async () => {
		const { rec, procs, errors, statuses } = build({ maxRecognitionErrors: 2 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'listening' })
		procs[0].say({ type: 'error', code: 'recognition', message: 'broken' })
		const chunk = [
			JSON.stringify({ type: 'error', code: 'recognition', message: 'broken' }),
			JSON.stringify({ type: 'status', value: 'listening' }),
			'',
		].join('\n')
		procs[0].stdout.emit('data', Buffer.from(chunk))
		expect(errors).toHaveLength(1)
		expect(statuses.at(-1)).toBe('error')
	})

	test('a helper that reaches listening is never timed out', async () => {
		const { rec, procs, errors, statuses } = build({ shortMs: 30, longMs: 60 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'listening' })
		await tick(150)
		expect(errors).toHaveLength(0)
		expect(statuses.at(-1)).toBe('listening')
	})
})

describe('AppleSpeechRecognizer recognition errors', () => {
	test('a transient recognition error while listening is not a failure', async () => {
		const { rec, procs, errors, statuses } = build()
		await rec.start()
		procs[0].say({ type: 'status', value: 'listening' })
		procs[0].say({ type: 'error', code: 'recognition', message: 'No speech detected' })
		expect(errors).toHaveLength(0)
		expect(statuses.at(-1)).toBe('listening')
	})

	test('recognition loop: errors that never produce a transcript end the run with an error', async () => {
		const { rec, procs, errors, statuses } = build({ maxRecognitionErrors: 5 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'listening' })
		for (let i = 0; i < 4; i++) procs[0].say({ type: 'error', code: 'recognition', message: 'broken' })
		expect(errors).toHaveLength(0)
		procs[0].say({ type: 'error', code: 'recognition', message: 'broken' })
		expect(errors).toHaveLength(1)
		expect(errors[0].code).toBe('recognition-failed')
		expect(statuses.at(-1)).toBe('error')
		expect(procs[0].killed).toContain('SIGTERM')
	})

	test('slow errors: errors spaced wider than the window never fail the run', async () => {
		let clock = 0
		const { rec, procs, errors, statuses } = build({ maxRecognitionErrors: 3, now: () => clock })
		await rec.start()
		procs[0].say({ type: 'status', value: 'listening' })
		for (let i = 0; i < 30; i++) {
			clock += 6000 // Apple's own silence timeout: seconds apart, the user is thinking
			procs[0].say({ type: 'error', code: 'recognition', message: 'No speech detected' })
		}
		expect(errors).toHaveLength(0)
		expect(statuses.at(-1)).toBe('listening')
	})

	test('recognition loop: a transcript between errors resets the count', async () => {
		const { rec, procs, errors } = build({ maxRecognitionErrors: 5 })
		await rec.start()
		procs[0].say({ type: 'status', value: 'listening' })
		for (let round = 0; round < 4; round++) {
			for (let i = 0; i < 4; i++) procs[0].say({ type: 'error', code: 'recognition', message: 'blip' })
			procs[0].say({ type: 'partial', text: 'hello there' })
		}
		expect(errors).toHaveLength(0)
	})
})
