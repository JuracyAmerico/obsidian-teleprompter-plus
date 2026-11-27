/**
 * Writes the command reference of docs/websocket-api.md from the code.
 *
 *   bun scripts/gen-ws-docs.ts          rewrite the table between the markers
 *   bun scripts/gen-ws-docs.ts --check  exit 1 when the doc is out of date (writes nothing)
 *
 * The commands are every `registerCommand('name', handler)` call in src/main.ts. A command's
 * parameters are the fields its handler reads from the message (`cmd.speed`, `params?.index`, ...),
 * with the type of the `as number` / `as string` cast that follows. Nothing is listed that the code
 * does not register, and nothing registered can be left out: scripts/gen-ws-docs.test.ts fails on
 * the first command the doc misses.
 *
 * The wire limits (`validateCommand` in src/websocket-server.ts) are written down once below and the
 * test checks that each number is still in that file.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BEGIN_MARKER = '<!-- BEGIN GENERATED: commands (bun scripts/gen-ws-docs.ts) -->'
export const END_MARKER = '<!-- END GENERATED: commands -->'

export interface CommandParam {
	name: string
	/** The type of the `as` cast the handler uses, or 'unknown' when it reads the field uncast. */
	type: string
}

export interface RegisteredCommand {
	name: string
	params: CommandParam[]
}

/**
 * What `validateCommand` in src/websocket-server.ts refuses, by field name. Every number here is
 * asserted to still be in that file by gen-ws-docs.test.ts.
 */
export const WIRE_LIMITS: Record<string, { text: string; literals: string[] }> = {
	speed: { text: '0.1 to 100', literals: ['command.speed < 0.1', 'command.speed > 100'] },
	fontSize: { text: '8 to 200', literals: ['command.fontSize < 8', 'command.fontSize > 200'] },
	seconds: { text: '0 to 3600', literals: ['command.seconds < 0', 'command.seconds > 3600'] },
	amount: { text: '-10000 to 10000', literals: ['command.amount < -10000', 'command.amount > 10000'] },
	index: { text: '0 to 1000', literals: ['command.index < 0', 'command.index > 1000'] },
	headerId: { text: 'at most 200 characters, and none of `<>\'"&\\`', literals: ['command.headerId.length > 200', '[<>\'"&\\\\]'] },
	content: { text: 'at most 1,000,000 characters', literals: ['.length > 1_000_000'] },
}

/** What the prompter does with a value after it passed the wire check. Hand-written; short. */
const PARAM_NOTES: Record<string, string> = {
	'set-speed.speed': 'then held to your speed limits (0.5 to 10 by default)',
	'scroll-up.amount': 'default 100',
	'scroll-down.amount': 'default 100',
	'jump-to-header.index': '0-based, in the order of the headers in the state message',
	'jump-to-header-by-id.headerId': 'an `id` from the `headers` list of the state message',
	'set-font-size.fontSize': 'ignored unless inside Settings min and max font size',
	'set-countdown.seconds': 'the prompter holds it to 0 to 30',
	'open-file.path': 'vault-relative path of a note; unknown paths are ignored',
	'set-scroll-position.position': 'pixels; wins over `percentage` when both are sent',
	'set-scroll-position.percentage': '0 to 100',
	'obs-set-scene.scene': 'scene name exactly as OBS shows it',
	'load-speaker-notes.content': 'replaces the script; ignored when empty',
	'load-speaker-notes.slide': 'shown as "Slide n/total" in place of the note name',
	'load-speaker-notes.totalSlides': 'shown as "Slide n/total" in place of the note name',
}

/** Wording for the commands whose name alone would mislead. Everything else is worded from its name. */
const DESCRIPTIONS: Record<string, string> = {
	'toggle-play': 'Starts or stops scrolling',
	'padding-vertical-increase': 'More space above and below the text',
	'padding-vertical-decrease': 'Less space above and below the text',
	'padding-horizontal-increase': 'More space left and right of the text',
	'padding-horizontal-decrease': 'Less space left and right of the text',
	play: 'Starts scrolling',
	pause: 'Stops scrolling',
	'increase-speed': 'Speeds up by one step',
	'decrease-speed': 'Slows down by one step',
	'set-speed': 'Sets the speed',
	'reset-to-top': 'Back to the top, paused',
	'scroll-up': 'Scrolls up by hand',
	'scroll-down': 'Scrolls down by hand',
	'jump-to-header': 'Jumps to a section by position',
	'jump-to-header-by-id': 'Jumps to a section by its id',
	'next-section': 'Jumps to the next section',
	'previous-section': 'Jumps to the previous section',
	'get-state': 'Asks for a fresh `state` message',
	'increase-font-size': 'Larger text, by the font step',
	'decrease-font-size': 'Smaller text, by the font step',
	'font-size-up': 'Larger text (the Stream Deck key)',
	'font-size-down': 'Smaller text (the Stream Deck key)',
	'set-font-size': 'Sets the font size',
	'countdown-increase': 'Longer pre-roll countdown',
	'countdown-decrease': 'Shorter pre-roll countdown',
	'set-countdown': 'Sets the pre-roll countdown length',
	'start-countdown': 'Stops scrolling and runs the pre-roll countdown; sent again while it runs, it cancels it',
	'cycle-speed-preset': 'Steps through the speed presets',
	'next-speed-preset': 'Next speed preset',
	'prev-speed-preset': 'Previous speed preset',
	'cycle-alignment': 'Cycles text alignment',
	'cycle-progress-indicator': 'Cycles the progress indicator style',
	'toggle-auto-pause': 'Turns auto-pause on editor focus on or off',
	'toggle-pin': 'Pins or unpins the note, locking what the prompter shows',
	'pin-note': 'Pins the current note',
	'unpin-note': 'Unpins the note',
	'refresh-pinned': 'Refreshes the pinned note',
	'toggle-floating': 'Opens the floating window, or closes it when open',
	'floating-unlock': 'Unlocks a locked floating window, so clicks land on it again',
	'toggle-keep-awake': 'Holds or releases the screen-awake hold',
	'toggle-scroll-sync': 'Turns scroll sync with the editor on or off',
	'toggle-view-mode': 'Switches between rendered Markdown and plain text',
	'set-view-mode-rendered': 'Rendered Markdown view',
	'set-view-mode-plain': 'Plain text view',
	'detach-window': 'Opens the prompter in its own window',
	'open-file': 'Loads a note by vault path',
	'open-active-file': 'Loads the note active in Obsidian',
	'voice-start': 'Starts voice tracking if it is not running',
	'voice-stop': 'Stops voice tracking if it is running',
	'voice-toggle': 'Starts or stops voice tracking',
	'get-voice-status': 'Asks for the voice tracking status',
	'set-scroll-position': 'Moves to a position (multi-device sync)',
	'get-broadcast-status': 'Reports whether network broadcast is on and its interval',
	'obs-connect': 'Connects to OBS',
	'obs-disconnect': 'Disconnects from OBS',
	'obs-get-status': 'Reports the OBS connection, recording and streaming state',
	'obs-get-scenes': 'Reports the list of OBS scenes',
	'obs-set-scene': 'Switches the OBS scene',
	'load-speaker-notes': 'Shows the given text as the script (the Stage integration)',
	toggleTTS: 'Starts or stops reading aloud',
	startTTS: 'Starts reading aloud',
	stopTTS: 'Stops reading aloud',
}

function words(slug: string): string {
	return slug.replace(/-/g, ' ')
}

/** The sentence for a command: the hand-written one, else worded from the command name. */
export function describe(name: string): string {
	const known = DESCRIPTIONS[name]
	if (known) return known
	let m = /^toggle-(.+)$/.exec(name)
	if (m) return `Turns ${words(m[1])} on or off`
	m = /^enable-(.+)$/.exec(name)
	if (m) return `Turns ${words(m[1])} on`
	m = /^disable-(.+)$/.exec(name)
	if (m) return `Turns ${words(m[1])} off`
	m = /^show-(.+)$/.exec(name)
	if (m) return `Shows ${words(m[1])}`
	m = /^hide-(.+)$/.exec(name)
	if (m) return `Hides ${words(m[1])}`
	m = /^color-preset-(.+)$/.exec(name)
	if (m) return `Applies the ${m[1]} color preset`
	m = /^font-preset-(.+)$/.exec(name)
	if (m) return `Applies the ${m[1]} font preset`
	m = /^(.+)-(increase|decrease)$/.exec(name)
	if (m) return `${m[2] === 'increase' ? 'Increases' : 'Decreases'} ${words(m[1])}`
	m = /^obs-(toggle|start|stop)-(recording|streaming)$/.exec(name)
	if (m) return m[1] === 'toggle' ? `Starts or stops OBS ${m[2]}` : `${m[1] === 'start' ? 'Starts' : 'Stops'} OBS ${m[2]}`
	return words(name)
}

/** Index of the `)` that closes the `(` at `open`, skipping strings, template literals and comments. */
function matchingParen(source: string, open: number): number {
	let depth = 0
	for (let i = open; i < source.length; i++) {
		const c = source[i]
		if (c === '/' && source[i + 1] === '/') {
			const eol = source.indexOf('\n', i)
			i = eol === -1 ? source.length : eol
		} else if (c === '/' && source[i + 1] === '*') {
			const end = source.indexOf('*/', i + 2)
			i = end === -1 ? source.length : end + 1
		} else if (c === "'" || c === '"' || c === '`') {
			for (i++; i < source.length && source[i] !== c; i++) {
				if (source[i] === '\\') i++
			}
		} else if (c === '(') {
			depth++
		} else if (c === ')') {
			depth--
			if (depth === 0) return i
		}
	}
	throw new Error('gen-ws-docs: unbalanced parentheses after registerCommand')
}

/** `cmd.x`, `params?.x` and `(cmd as Record<string, unknown>)?.x`, each with its `as type` when there is one. */
const FIELD_READ = /(?:\(\s*(?:cmd|params)\s+as\s+Record<string,\s*unknown>\s*\)|\b(?:cmd|params))\s*\??\.\s*(\w+)(?:\s+as\s+(\w+))?/g

export function extractCommands(mainSource: string): RegisteredCommand[] {
	const commands: RegisteredCommand[] = []
	const call = /\.registerCommand\(\s*'([^']+)'/g
	let hit: RegExpExecArray | null
	while ((hit = call.exec(mainSource)) !== null) {
		const open = mainSource.indexOf('(', hit.index)
		const close = matchingParen(mainSource, open)
		const body = mainSource.slice(open, close + 1)
		const params: CommandParam[] = []
		FIELD_READ.lastIndex = 0
		let read: RegExpExecArray | null
		while ((read = FIELD_READ.exec(body)) !== null) {
			const existing = params.find(p => p.name === read![1])
			if (existing) {
				if (existing.type === 'unknown' && read[2]) existing.type = read[2]
			} else {
				params.push({ name: read[1], type: read[2] ?? 'unknown' })
			}
		}
		commands.push({ name: hit[1], params })
	}
	return commands
}

function paramCell(commandName: string, params: CommandParam[]): string {
	if (params.length === 0) return 'none'
	return params
		.map(p => {
			const limit = WIRE_LIMITS[p.name]?.text
			const note = PARAM_NOTES[`${commandName}.${p.name}`]
			const detail = [limit, note].filter(Boolean).join('; ')
			return `\`${p.name}\` (${p.type})${detail ? `: ${detail}` : ''}`
		})
		.join('<br>')
}

export function renderTable(commands: RegisteredCommand[]): string {
	const lines = [
		`${commands.length} commands, in the order \`src/main.ts\` registers them.`,
		'',
		'| Command | Parameters | What it does |',
		'|---|---|---|',
	]
	for (const c of commands) {
		lines.push(`| \`${c.name}\` | ${paramCell(c.name, c.params)} | ${describe(c.name)} |`)
	}
	return lines.join('\n')
}

/** The doc with the text between the markers replaced by `table`. */
export function replaceBetweenMarkers(doc: string, table: string): string {
	const start = doc.indexOf(BEGIN_MARKER)
	const end = doc.indexOf(END_MARKER)
	if (start === -1 || end === -1 || end < start) {
		throw new Error(`gen-ws-docs: docs/websocket-api.md needs ${BEGIN_MARKER} and ${END_MARKER}, in that order`)
	}
	return `${doc.slice(0, start + BEGIN_MARKER.length)}\n\n${table}\n\n${doc.slice(end)}`
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MAIN_PATH = path.join(root, 'src/main.ts')
export const DOC_PATH = path.join(root, 'docs/websocket-api.md')

export function generate(): { current: string; next: string; commands: RegisteredCommand[] } {
	const commands = extractCommands(readFileSync(MAIN_PATH, 'utf8'))
	const current = readFileSync(DOC_PATH, 'utf8')
	return { current, next: replaceBetweenMarkers(current, renderTable(commands)), commands }
}

function main(): void {
	const { current, next, commands } = generate()
	if (process.argv.includes('--check')) {
		if (current !== next) {
			console.error('docs/websocket-api.md is out of date. Run: bun scripts/gen-ws-docs.ts')
			process.exit(1)
		}
		console.log(`docs/websocket-api.md is current (${commands.length} commands)`)
		return
	}
	writeFileSync(DOC_PATH, next)
	console.log(`docs/websocket-api.md: ${commands.length} commands written`)
}

if (import.meta.main) main()
