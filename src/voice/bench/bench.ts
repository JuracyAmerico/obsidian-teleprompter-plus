/**
 * One benchmark run over recorded sessions: find each session's script, work out the ground truth,
 * replay the session through the current matcher at its recorded timing, and score it.
 *
 * Where a session's script comes from, best first:
 *  1. the word list its trace recorded (exact; traces written since this bench existed),
 *  2. the script text its trace recorded, rendered to words,
 *  3. the note path its trace recorded, if the note there still has the recorded hash,
 *  4. for older traces that recorded only sizes: a vault note whose prompted text has exactly the
 *     recorded character and word counts.
 * Anything rendered (2 to 4) must put the same words at the indexes the trace recorded, and have the
 * recorded word count, or the session is reported unresolved with the reason. Nothing is guessed.
 */

import { resolveVoiceLanguage } from '../voice-language'
import type { VoiceTrackingConfig } from '../types'
import type { VoiceTrackingService } from '../voice-tracking-service'
import { groundTruth } from './ground-truth'
import { overallMetrics, sessionMetrics, updateSamples, type SessionMetrics, type UpdateSample } from './metrics'
import { externalMoves, replaySession } from './replay'
import { contentMatchingHash, renderedScriptWords, verifyWords, type WordCheck } from './script-words'
import type { TraceSession } from './trace'

export interface NoteLookup {
	/** The note at this vault path, or null when it is gone. */
	read(path: string): { raw: string; mtime: number } | null
	/** Notes whose prompted text has exactly this many characters and words. */
	findBySize(chars: number, words: number): { path: string; raw: string; content: string }[]
}

export type ScriptOrigin = 'trace word list' | 'trace script' | 'note path' | 'vault note with the traced size'

export type Resolution =
	| { ok: true; words: string[]; origin: ScriptOrigin; notePath?: string; language: string; check: WordCheck }
	| { ok: false; reason: string }

const MIN_AGREEMENT = 0.95
const MIN_COMPARED = 5

function frontmatterLanguage(raw: string): string | undefined {
	const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(raw)?.[1]
	if (!frontmatter) return undefined
	return /^(?:voice-language|lang):\s*["']?([^"'\n]+)/m.exec(frontmatter)?.[1]?.trim()
}

/** Find the words a session ran against. `languageSetting` is the app's voice language setting. */
export function resolveScript(session: TraceSession, lookup: NoteLookup, languageSetting: string): Resolution {
	const script = session.script
	if (!script) return { ok: false, reason: 'no script load in the trace before this session' }

	const language = (content: string, raw?: string): string =>
		script.language ?? resolveVoiceLanguage(languageSetting, raw ? frontmatterLanguage(raw) : undefined, content)

	const accept = (words: string[], origin: ScriptOrigin, content: string, raw?: string, notePath?: string): Resolution => {
		const check = verifyWords(words, script, session.matches)
		if (origin !== 'trace word list') {
			if (check.tracedCount >= 0 && check.tracedCount !== words.length) {
				return { ok: false, reason: `${origin}: ${words.length} words rendered, the trace recorded ${check.tracedCount}` }
			}
			if (check.compared >= MIN_COMPARED && check.agreement < MIN_AGREEMENT) {
				return { ok: false, reason: `${origin}: only ${(check.agreement * 100).toFixed(0)}% of recorded word positions agree` }
			}
		}
		return { ok: true, words, origin, notePath, language: language(content, raw), check }
	}

	if (script.wordList !== undefined) {
		const words = script.wordList.split(' ').filter(word => word.length > 0)
		return accept(words, 'trace word list', script.script ?? words.join(' '))
	}
	if (script.script !== undefined) return accept(renderedScriptWords(script.script), 'trace script', script.script)
	if (script.notePath && script.scriptHash) {
		const note = lookup.read(script.notePath)
		if (!note) return { ok: false, reason: `note ${script.notePath} no longer exists` }
		const content = contentMatchingHash(note.raw, script.scriptHash)
		if (content === null) return { ok: false, reason: `note ${script.notePath} changed since the session` }
		return accept(renderedScriptWords(content), 'note path', content, note.raw, script.notePath)
	}
	if (script.contentChars !== undefined && script.incomingWords !== undefined) {
		const found = lookup.findBySize(script.contentChars, script.incomingWords)
		const texts = new Set(found.map(note => note.content))
		if (texts.size === 0) {
			return { ok: false, reason: `no vault note has the traced size (${script.contentChars} chars, ${script.incomingWords} words): edited or gone` }
		}
		if (texts.size > 1) {
			return { ok: false, reason: `${texts.size} different vault notes have the traced size; refusing to pick one` }
		}
		const note = found[0]
		return accept(renderedScriptWords(note.content), 'vault note with the traced size', note.content, note.raw, note.path)
	}
	return { ok: false, reason: 'the trace recorded nothing that identifies the script' }
}

type ServiceClass = new (config: Partial<VoiceTrackingConfig>, recognizer: never) => VoiceTrackingService

export interface SessionReport {
	session: TraceSession
	resolution: Extract<Resolution, { ok: true }>
	/** Share of recognizer results the aligner could give a truth. */
	truthCoverage: number
	offScriptUnits: number
	units: number
	externalMoves: number
	samples: UpdateSample[]
	metrics: SessionMetrics
	/** Where the replayed place ended: the page the view's next session starts from. */
	finalPosition: number
}

export interface UnresolvedSession {
	session: TraceSession
	reason: string
}

export interface BenchReport {
	sessions: SessionReport[]
	unresolved: UnresolvedSession[]
	overall: SessionMetrics
}

/** Ground truth, replay and score for one session whose words are known. */
export function scoreSession(
	Service: ServiceClass,
	session: TraceSession,
	resolution: Extract<Resolution, { ok: true }>,
	config: Partial<VoiceTrackingConfig>,
	startPage = 0,
): SessionReport {
	const truth = groundTruth(session.heard, resolution.words)
	const moves = externalMoves(session.heard, session.matches, session.rereads)
	const replay = replaySession(
		Service,
		resolution.words,
		session.heard,
		{ ...config, language: resolution.language },
		moves,
		session.continued,
		startPage,
	)
	const samples = updateSamples(
		session.heard.map(event => event.text),
		session.heard.map(event => event.t),
		truth.positions,
		replay.positionAfter,
	)
	const withTruth = truth.positions.filter(position => position !== null).length
	return {
		session,
		resolution,
		truthCoverage: session.heard.length ? withTruth / session.heard.length : 0,
		offScriptUnits: truth.offScriptUnits,
		units: truth.units,
		externalMoves: moves.filter(move => !move.anchor).length,
		samples,
		metrics: sessionMetrics(samples, replay.moves, replay.resyncs),
		finalPosition: replay.finalPosition,
	}
}

export function runBench(
	Service: ServiceClass,
	sessions: TraceSession[],
	lookup: NoteLookup,
	config: Partial<VoiceTrackingConfig>,
	languageSetting: string,
): BenchReport {
	const scored: SessionReport[] = []
	const unresolved: UnresolvedSession[] = []
	// Per view, where the page was left and on which words: the next session on the same words starts there.
	const pageLeft = new Map<string, { words: string; page: number }>()
	for (const session of [...sessions].sort((a, b) => a.start - b.start)) {
		const resolution = resolveScript(session, lookup, languageSetting)
		if (!resolution.ok) {
			unresolved.push({ session, reason: resolution.reason })
			pageLeft.delete(session.view)
			continue
		}
		const words = resolution.words.join(' ')
		const left = pageLeft.get(session.view)
		const report = scoreSession(Service, session, resolution, config, left?.words === words ? left.page : 0)
		pageLeft.set(session.view, { words, page: report.finalPosition })
		scored.push(report)
	}
	return { sessions: scored, unresolved, overall: overallMetrics(scored) }
}
