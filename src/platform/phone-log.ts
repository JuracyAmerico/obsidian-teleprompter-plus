/**
 * Test-only diagnostics for the phone, compiled in only when the build sets TP_PHONE_LOG=1.
 * The phone has no console anyone can read, so each step of read-aloud, every uncaught error,
 * and the speech engine's own events go to a note in the vault, which iCloud brings back.
 * Records event names and the first words of a sentence, never audio.
 */
import type { App } from 'obsidian'

declare const __TP_PHONE_LOG__: boolean

const NOTE = 'T+ phone log.md'
const lines: string[] = []
let app: App | null = null
let writing: Promise<void> = Promise.resolve()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastMessage = ''
let repeats = 0
// Writing the note on every line stalled the phone during voice tracking (phone9: 293 rewrites in
// 2 s), which distorts the very thing being measured. Save at most once a second instead.
const FLUSH_EVERY_MS = 1000

export const phoneLogEnabled = typeof __TP_PHONE_LOG__ !== 'undefined' && __TP_PHONE_LOG__

function stamp(): string {
	return new Date().toISOString().slice(11, 23)
}

function flush(): void {
	flushTimer = null
	if (!app) return
	const target = app
	const body = `# T+ phone log\n\n${lines.map(line => `- ${line}`).join('\n')}\n`
	writing = writing.then(() => target.vault.adapter.write(NOTE, body)).catch(() => {})
}

export function phoneLog(message: string): void {
	if (!phoneLogEnabled) return
	// A recognizer repeats an unchanged partial many times a second; count those instead of listing them
	if (message === lastMessage) { repeats++; return }
	if (repeats > 0) lines.push(`${stamp()} (previous line repeated ${repeats} more times)`)
	repeats = 0
	lastMessage = message
	lines.push(`${stamp()} ${message}`)
	if (lines.length > 2000) lines.splice(0, lines.length - 2000)
	if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_EVERY_MS)
}

export function installPhoneLog(target: App): void {
	if (!phoneLogEnabled) return
	app = target
	phoneLog('log started')
	window.addEventListener('error', event => phoneLog(`ERROR ${event.message} at ${event.filename}:${event.lineno}`))
	window.addEventListener('unhandledrejection', event => {
		const reason = event.reason as { message?: string; stack?: string } | undefined
		phoneLog(`REJECTION ${reason?.message ?? String(event.reason)} ${(reason?.stack ?? '').split('\n').slice(0, 3).join(' | ')}`)
	})
	if (typeof speechSynthesis !== 'undefined') {
		const original = speechSynthesis.speak.bind(speechSynthesis)
		speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
			phoneLog(`speechSynthesis.speak "${utterance.text.slice(0, 30)}" voice=${utterance.voice?.name ?? 'default'} lang=${utterance.lang} speaking=${speechSynthesis.speaking} pending=${speechSynthesis.pending}`)
			utterance.addEventListener('start', () => phoneLog('utterance start'))
			utterance.addEventListener('end', () => phoneLog('utterance end'))
			utterance.addEventListener('error', event => phoneLog(`utterance error ${event.error}`))
			original(utterance)
		}
	}
}
