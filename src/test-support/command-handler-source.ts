import { expect } from 'bun:test'
import { parseCommand } from '../commands'

/**
 * The component code that runs for a command event. Which intent the event becomes is behaviour,
 * from commands.ts; what the view then does lives in TeleprompterApp.svelte, which bun cannot
 * mount, so that part is read as source: the intent's entry in `commandHandlers`, plus the body of
 * the `...Command` function the entry calls, if it calls one. Found by name, never by position.
 */
export function commandHandlerSource(app: string, type: string, detail?: unknown): string {
	const intent = parseCommand(`teleprompter:${type}`, detail)
	expect(intent).not.toBeNull()
	if (!intent) return ''
	const map = app.slice(app.indexOf('const commandHandlers: CommandHandlers = {'))
	const start = map.indexOf(`\n    ${intent.kind}: `)
	expect(start).toBeGreaterThan(-1)
	const rest = map.slice(start + 1)
	const next = rest.search(/\n {4}[A-Za-z]+: /)
	const entry = next === -1 ? rest.slice(0, rest.indexOf('\n  }')) : rest.slice(0, next)
	const delegate = /=> (\w+Command)\(/.exec(entry)
	if (!delegate) return entry
	const fn = app.indexOf(`\n  function ${delegate[1]}(`)
	expect(fn).toBeGreaterThan(-1)
	const body = app.slice(fn + 1)
	const end = body.search(/\n {2}(async )?function /)
	return entry + '\n' + (end === -1 ? body : body.slice(0, end))
}
