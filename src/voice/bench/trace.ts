/**
 * Reads voice-trace.jsonl (written by the app when `voiceTrace` is on) into replayable sessions.
 *
 * Each teleprompter view writes its own events (the `view` field), and two views can listen at once
 * with their own recognizers and scripts, so sessions are split per view. A session is the run of a
 * view's recognizer results between two boundaries: the view's microphone going off, or the view
 * loading or re-wrapping a script. Its script is whatever that view last loaded before it.
 */

/** One recognizer result as the app received it (already normalised for speech when English). */
export interface HeardEvent {
	/** Milliseconds since the epoch. */
	t: number
	text: string
	final: boolean
}

/** One matcher decision the app recorded: where it was, and where the matcher proposed to go. */
export interface RecordedMatch {
	t: number
	/** Index into the session's heard events of the result that led to this decision. */
	heardIndex: number
	cur: number
	curWord: string
	proposed: number
	proposedWord: string
	global: boolean
	total: number
}

/** A go-back-and-re-read the app committed: the place moved to `to`. */
export interface RecordedReread {
	t: number
	to: number
}

/** Everything the trace says about the script a session ran against. Older traces carry only sizes. */
export interface TracedScript {
	contentChars?: number
	incomingWords?: number
	scriptHash?: string
	script?: string
	language?: string
	notePath?: string
	noteMtime?: number
	wrappedWords?: number
	wordList?: string
	wordsHash?: string
}

export interface TraceSession {
	/** `<file>#<view>@<first heard time>`, stable across runs. */
	id: string
	file: string
	view: string
	start: number
	end: number
	script: TracedScript | null
	/** The script was re-wrapped while the microphone stayed on (an edit): the place carried over. */
	continued: boolean
	heard: HeardEvent[]
	matches: RecordedMatch[]
	rereads: RecordedReread[]
}

type Json = Record<string, unknown>

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** Parse one JSONL line; anything that is not an object with a time and a type is skipped. */
function parseLine(line: string): (Json & { t: number; type: string; view: string }) | null {
	if (!line.trim()) return null
	let value: unknown
	try {
		value = JSON.parse(line)
	} catch {
		return null
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
	const record = value as Json
	const t = Date.parse(str(record.t) ?? '')
	const type = str(record.type)
	if (!Number.isFinite(t) || !type) return null
	return { ...record, t, type, view: str(record.view) ?? '-' }
}

function scriptFromInit(record: Json): TracedScript {
	return {
		contentChars: num(record.contentChars),
		incomingWords: num(record.incomingWords),
		scriptHash: str(record.scriptHash),
		script: str(record.script),
		language: str(record.language),
		notePath: str(record.notePath),
		noteMtime: num(record.noteMtime),
	}
}

interface ViewState {
	script: TracedScript | null
	open: TraceSession | null
	/** Last thing seen: a load, a recognizer result, a re-wrap after results (an edit), or the microphone off. */
	boundary: 'init' | 'heard' | 'rewrap' | 'off'
}

export interface TraceFile {
	/** Name shown in session ids. */
	file: string
	text: string
}

/**
 * Split trace files into sessions. The files are read as one stream in time order, because a view can
 * load its script in one file and keep listening in the next (the trace was rotated by hand).
 * Sessions without a recognizer result are dropped.
 */
export function readTraceSessions(files: TraceFile[]): TraceSession[] {
	const records = files
		.flatMap(({ file, text }) => text.split('\n').map(line => ({ file, record: parseLine(line) })))
		.filter((entry): entry is { file: string; record: NonNullable<ReturnType<typeof parseLine>> } => entry.record !== null)
	// Stable: lines with the same time keep their order within the file.
	records.sort((a, b) => a.record.t - b.record.t)

	const sessions: TraceSession[] = []
	const views = new Map<string, ViewState>()
	const stateOf = (view: string): ViewState => {
		let state = views.get(view)
		if (!state) {
			state = { script: null, open: null, boundary: 'off' }
			views.set(view, state)
		}
		return state
	}
	const close = (state: ViewState): void => {
		if (state.open && state.open.heard.length > 0) sessions.push(state.open)
		state.open = null
	}

	for (const { file, record } of records) {
		const state = stateOf(record.view)
		switch (record.type) {
			case 'init':
				close(state)
				state.boundary = 'init'
				state.script = scriptFromInit(record)
				break
			case 'wrapped':
				close(state)
				// The wrap that follows a load belongs to that load; one after results is an edit under a live session.
				if (state.boundary === 'heard') state.boundary = 'rewrap'
				state.script = {
					...(state.script ?? {}),
					wrappedWords: num(record.words),
					wordList: str(record.wordList),
					wordsHash: str(record.wordsHash),
				}
				break
			case 'status':
				if (record.status === 'off' || record.status === 'error') {
					close(state)
					state.boundary = 'off'
				}
				break
			case 'heard': {
				const heardText = str(record.text)
				if (heardText === undefined) break
				if (!state.open) {
					state.open = {
						id: `${file}#${record.view}@${new Date(record.t).toISOString()}`,
						file,
						view: record.view,
						start: record.t,
						end: record.t,
						script: state.script ? { ...state.script } : null,
						continued: state.boundary === 'rewrap',
						heard: [],
						matches: [],
						rereads: [],
					}
				}
				state.open.heard.push({ t: record.t, text: heardText, final: record.final === true })
				state.open.end = record.t
				state.boundary = 'heard'
				break
			}
			case 'match': {
				const open = state.open
				const cur = num(record.cur)
				const proposed = num(record.proposed)
				if (!open || cur === undefined || proposed === undefined) break
				open.matches.push({
					t: record.t,
					heardIndex: open.heard.length - 1,
					cur,
					curWord: str(record.curWord) ?? '?',
					proposed,
					proposedWord: str(record.proposedWord) ?? '?',
					global: record.global === true,
					total: num(record.total) ?? -1,
				})
				break
			}
			case 'reread': {
				const to = num(record.to)
				if (state.open && to !== undefined) state.open.rereads.push({ t: record.t, to })
				break
			}
			default:
				break
		}
	}
	for (const state of views.values()) close(state)
	return sessions.sort((a, b) => a.start - b.start)
}
