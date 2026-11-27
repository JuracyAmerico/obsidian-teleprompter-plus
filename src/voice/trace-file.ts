/**
 * voice-trace.jsonl: the opt-in voice diagnostics file (Settings → Voice tracking → Write a voice
 * trace). Each line holds what the recognizer heard or what the matcher decided, and a run's first
 * lines hold the whole script, so the file is as private as the scripts and travels with a vault
 * sync. Until 0.12.18 it grew without a limit; one real copy reached 19.8 MB.
 *
 * Now it is capped: when the next line would take the file past VOICE_TRACE_MAX_BYTES, the file
 * becomes voice-trace.1.jsonl (replacing the older one) and a new file starts. At most two files,
 * about 2 × the cap, ever exist.
 */

export const VOICE_TRACE_FILE = 'voice-trace.jsonl'
export const VOICE_TRACE_PREVIOUS_FILE = 'voice-trace.1.jsonl'
export const VOICE_TRACE_MAX_BYTES = 5 * 1024 * 1024

/** The parts of Node's fs this needs; injected so tests run on a fake. */
export interface TraceFs {
	appendFileSync: (path: string, data: string, encoding: 'utf8') => void
	statSync: (path: string) => { size: number }
	renameSync: (from: string, to: string) => void
}

/** Byte length of a string as UTF-8, without Buffer (not on the phone). */
export function utf8Bytes(text: string): number {
	return new TextEncoder().encode(text).length
}

/**
 * Appends one line, rotating first if the line would take the file past `maxBytes`. A file that
 * does not exist yet counts as empty. Throws what fs throws; the caller decides to swallow it.
 */
export function appendCappedLine(
	fs: TraceFs,
	file: string,
	previousFile: string,
	line: string,
	maxBytes: number = VOICE_TRACE_MAX_BYTES,
): void {
	let size = 0
	try {
		size = fs.statSync(file).size
	} catch {
		size = 0 // not written yet
	}
	if (size > 0 && size + utf8Bytes(line) > maxBytes) {
		fs.renameSync(file, previousFile)
	}
	fs.appendFileSync(file, line, 'utf8')
}
