/**
 * Voice tracking accuracy benchmark on recorded rehearsals.
 *
 *   bun run bench:voice                 # every voice-trace*.jsonl of the vault's plugin folder
 *   bun run bench:voice -- --json       # machine-readable report
 *   bun run bench:voice -- --trace a.jsonl --trace b.jsonl --vault ~/Notes --settings data.json
 *   bun run bench:voice -- --day 2026-11-05           # score only sessions that started that day (UTC)
 *   bun run bench:voice -- --not-day 2026-11-05       # score every session but those
 *
 * Replays each recorded session through the CURRENT VoiceTrackingService, at the recorded timing, and
 * compares where the matcher put the reader with an offline ground truth. Read-only: trace files, the
 * vault and the plugin settings are only read.
 *
 * Ground truth (src/voice/bench/ground-truth.ts, full method there): each recognizer result is mapped
 * offline to the script word just said, using the whole session, later results included. Results are
 * grouped into utterances; each utterance's last (most revised) hypothesis is cut into ~16-word units;
 * each unit is placed in the script by a fitting word alignment; a Viterbi pass over the whole session
 * picks the placements that read on continuously (any other move costs extra), or marks a unit
 * off-script; each result's newest word is aligned into its utterance's final hypothesis and takes that
 * word's script index. Results without a reliable truth (off-script, nothing placed yet) are left out
 * of every metric. 47 hand-checked results (src/voice/fixtures/bench-sample.ts) hold the method.
 *
 * Replay (src/voice/bench/replay.ts): the recorded results go to the real service on a manual clock.
 * Moves the reader made outside the matcher (section jumps, manual scrolls, edits) are read from the
 * recorded decisions and repeated at the same moment. The page is one number that follows the place;
 * a session after a reload starts with the page where the view's previous session left it. The score
 * is the place the page shows. There is no microphone, so the silence gate fails open.
 *
 * Metrics (src/voice/bench/metrics.ts): lag in words p50/p95 (truth minus place, positive = behind),
 * share of updates more than 5 words off, the matcher's own jumps over 10 words (and how many landed
 * wrong), stalled seconds per minute of speech, and seconds to recover after a re-sync the matcher
 * armed itself.
 *
 * Where each session's script comes from, and why a session is unresolved, is printed per session.
 * Reconstructed scripts must agree with the word indexes the trace recorded, or the session is skipped.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { obsidianStub } from '../src/test-support/obsidian-stub'
import { runBench, type BenchReport, type NoteLookup } from '../src/voice/bench/bench'
import { overallMetrics, percentile, type SessionMetrics } from '../src/voice/bench/metrics'
import { contentMatchingSize } from '../src/voice/bench/script-words'
import { readTraceSessions, type TraceSession } from '../src/voice/bench/trace'
import type { VoiceTrackingConfig } from '../src/voice/types'

// The voice modules import Obsidian runtime values the replay never uses.
Bun.plugin({
	name: 'obsidian-stub',
	setup(build) {
		build.module('obsidian', () => ({ exports: obsidianStub, loader: 'object' }))
	},
})

interface Options {
	traces: string[]
	vault: string
	settings: string
	json: boolean
	/** Score only sessions that started on these UTC days (YYYY-MM-DD); empty means every day. */
	days: string[]
	/** Leave out sessions that started on these UTC days. */
	notDays: string[]
}

function usage(message: string): never {
	console.error(`${message}\nusage: bun run bench:voice -- [--trace FILE]... [--vault DIR] [--settings data.json] [--day YYYY-MM-DD]... [--not-day YYYY-MM-DD]... [--json]`)
	process.exit(2)
}

function parseOptions(argv: string[]): Options {
	const home = process.env.HOME
	if (!home) usage('HOME is not set')
	const vault = join(home, 'Documents', 'Notes')
	const options: Options = { traces: [], vault, settings: '', json: false, days: [], notDays: [] }
	const day = (value: string): string => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) usage(`a day is YYYY-MM-DD, not ${value}`)
		return value
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		const value = (): string => {
			const next = argv[++i]
			if (next === undefined) usage(`${arg} needs a value`)
			return next
		}
		if (arg === '--trace') options.traces.push(value())
		else if (arg === '--vault') options.vault = value()
		else if (arg === '--settings') options.settings = value()
		else if (arg === '--json') options.json = true
		else if (arg === '--day') options.days.push(day(value()))
		else if (arg === '--not-day') options.notDays.push(day(value()))
		else usage(`unknown argument ${arg}`)
	}
	const pluginDir = join(options.vault, '.obsidian', 'plugins', 'teleprompter-plus')
	if (options.traces.length === 0) {
		if (!existsSync(pluginDir)) usage(`no plugin folder at ${pluginDir}; pass --vault or --trace`)
		options.traces = readdirSync(pluginDir)
			.filter(name => /^voice-trace.*\.jsonl$/.test(name))
			.map(name => join(pluginDir, name))
	}
	if (!options.settings) options.settings = join(pluginDir, 'data.json')
	return options
}

/** The matcher settings the app passes from saved settings, with the app's own defaults. */
function matcherConfig(settingsPath: string): { config: Partial<VoiceTrackingConfig>; languageSetting: string } {
	let saved: Record<string, unknown> = {}
	if (existsSync(settingsPath)) {
		const parsed: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'))
		if (typeof parsed === 'object' && parsed !== null) saved = parsed as Record<string, unknown>
	}
	const n = (key: string, fallback: number): number => (typeof saved[key] === 'number' ? saved[key] : fallback)
	return {
		config: {
			confidenceThreshold: n('voiceTrackingConfidenceThreshold', 0.2),
			windowSize: n('voiceTrackingWindowSize', 6),
			maxJumpDistance: n('voiceTrackingMaxJumpDistance', 3),
			minJumpDistance: n('voiceTrackingMinJumpDistance', 2),
			updateFrequencyMs: n('voiceTrackingUpdateFrequencyMs', 500),
			pauseDetection: saved.voiceTrackingPauseDetection !== false,
			pauseThresholdMs: n('voiceTrackingPauseThresholdMs', 1200),
			scrollPosition: n('voiceTrackingScrollPosition', 20),
			highlightLead: n('voiceTrackingHighlightLead', 0),
			showWordHighlight: false,
		},
		languageSetting: typeof saved.voiceTrackingLanguage === 'string' ? saved.voiceTrackingLanguage : 'auto',
	}
}

/** Vault notes, read once and only when an old trace needs a note found by its size. */
function vaultLookup(vault: string): NoteLookup {
	let notes: { path: string; raw: string }[] | null = null
	const walk = (dir: string, out: { path: string; raw: string }[]): void => {
		let entries
		try {
			entries = readdirSync(dir, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue
			const full = join(dir, entry.name)
			if (entry.isDirectory()) walk(full, out)
			else if (entry.name.endsWith('.md')) {
				try {
					out.push({ path: relative(vault, full), raw: readFileSync(full, 'utf8') })
				} catch {
					// A dangling link or unreadable file is simply not a candidate.
				}
			}
		}
	}
	return {
		read(path) {
			const full = join(vault, path)
			if (!existsSync(full)) return null
			return { raw: readFileSync(full, 'utf8'), mtime: statSync(full).mtimeMs }
		},
		findBySize(chars, words) {
			if (notes === null) {
				notes = []
				walk(vault, notes)
			}
			const found: { path: string; raw: string; content: string }[] = []
			for (const note of notes) {
				const content = contentMatchingSize(note.raw, chars, words)
				if (content !== null) found.push({ ...note, content })
			}
			return found
		},
	}
}

const fixed = (value: number, digits = 1): string => value.toFixed(digits)
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`

function describeRecovery(m: SessionMetrics): string {
	if (m.resyncs === 0) return '-'
	const done = m.recoverySeconds.length
	const body = done ? `${fixed(percentile(m.recoverySeconds, 50))}/${fixed(percentile(m.recoverySeconds, 95))}s` : 'never'
	return `${body} (${done}/${m.resyncs})`
}

function label(session: TraceSession): string {
	return `${new Date(session.start).toISOString().slice(0, 16).replace('T', ' ')} ${session.view}`
}

function printReport(report: BenchReport, traces: string[]): void {
	const rows = [['session', 'words', 'script from', 'updates', 'truth', 'lag p50', 'lag p95', 'off>5', 'jumps>10 (bad)', 'stall s/min', 'recover p50/p95 (n)', 'ext moves']]
	for (const s of report.sessions) {
		const m = s.metrics
		rows.push([
			label(s.session),
			String(s.resolution.words.length),
			s.resolution.origin + (s.resolution.notePath ? `: ${s.resolution.notePath.split('/').pop()}` : ''),
			String(m.updates),
			pct(s.truthCoverage),
			fixed(m.lagP50),
			fixed(m.lagP95),
			pct(m.offOver5),
			`${m.jumpsOver10} (${m.badJumps})`,
			fixed(m.stalledPerMinute),
			describeRecovery(m),
			String(s.externalMoves),
		])
	}
	const o = report.overall
	rows.push(['OVERALL', '', `${report.sessions.length} sessions`, String(o.updates), '', fixed(o.lagP50), fixed(o.lagP95), pct(o.offOver5), `${o.jumpsOver10} (${o.badJumps})`, fixed(o.stalledPerMinute), describeRecovery(o), ''])
	const widths = rows[0].map((_, c) => Math.max(...rows.map(r => r[c].length)))
	console.log(`Voice tracking benchmark: ${traces.length} trace file(s), current matcher\n`)
	for (const row of rows) console.log(row.map((cell, c) => cell.padEnd(widths[c])).join('  '))
	console.log(`\nSpeaking time scored: ${fixed(o.speakingSeconds / 60)} min. Re-syncs never recovered: ${o.unrecoveredResyncs}.`)
	const heardLost = report.unresolved.reduce((total, u) => total + u.session.heard.length, 0)
	console.log(`\nUnresolved sessions: ${report.unresolved.length} (${heardLost} recognizer results not scored)`)
	for (const u of report.unresolved) console.log(`  ${label(u.session)}  ${u.session.heard.length} results  ${u.reason}`)
}

const options = parseOptions(process.argv.slice(2))
const { config, languageSetting } = matcherConfig(options.settings)
const sessions = readTraceSessions(options.traces.map(file => ({ file: file.split('/').pop() ?? file, text: readFileSync(file, 'utf8') })))
const { VoiceTrackingService } = await import('../src/voice/voice-tracking-service')
const full = runBench(VoiceTrackingService, sessions, vaultLookup(options.vault), config, languageSetting)
// Every session is replayed, in order, so a session starts its page where the view's previous one left it;
// the day filter only chooses which of them are scored.
const startDay = (session: TraceSession): string => new Date(session.start).toISOString().slice(0, 10)
const scoredDay = (session: TraceSession): boolean =>
	(options.days.length === 0 || options.days.includes(startDay(session))) && !options.notDays.includes(startDay(session))
const kept = full.sessions.filter(s => scoredDay(s.session))
const report: BenchReport = {
	sessions: kept,
	unresolved: full.unresolved.filter(u => scoredDay(u.session)),
	overall: overallMetrics(kept),
}

if (options.json) {
	console.log(JSON.stringify({
		overall: report.overall,
		sessions: report.sessions.map(s => ({
			id: s.session.id,
			words: s.resolution.words.length,
			headingWords: s.resolution.headings.length,
			scriptFrom: s.resolution.origin,
			notePath: s.resolution.notePath,
			language: s.resolution.language,
			wordAgreement: s.resolution.check.agreement,
			truthCoverage: s.truthCoverage,
			externalMoves: s.externalMoves,
			metrics: s.metrics,
		})),
		unresolved: report.unresolved.map(u => ({ id: u.session.id, results: u.session.heard.length, reason: u.reason })),
	}, null, 2))
} else {
	printReport(report, options.traces)
}
