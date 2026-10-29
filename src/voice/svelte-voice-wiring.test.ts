import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Source-text guards for two behaviours that live inside the Svelte component, which bun cannot
 * mount. They fail if the old wiring comes back.
 */
const source = readFileSync(join(import.meta.dir, '..', 'TeleprompterApp.svelte'), 'utf8')

function functionBody(name: string): string {
	const start = source.indexOf(`function ${name}(`)
	expect(start).toBeGreaterThan(-1)
	const next = source.indexOf('\n  function ', start + 1)
	const nextAsync = source.indexOf('\n  async function ', start + 1)
	const ends = [next, nextAsync].filter(i => i > start)
	return source.slice(start, Math.min(...ends))
}

describe('TeleprompterApp voice wiring', () => {
	test('no restart in svelte: applying a preset neither stops the service nor schedules a toggle', () => {
		const body = functionBody('applyVoicePreset')
		expect(body).toContain('applyPresetLive(')
		expect(body).not.toMatch(/\.stop\(\)/)
		expect(body).not.toMatch(/setTimeout/)
		expect(body).not.toMatch(/toggleVoiceTracking/)
	})

	test('active not forced after start: voiceTrackingActive is never assigned true by hand', () => {
		expect(source).not.toMatch(/voiceTrackingActive\s*=\s*true/)
		const afterStart = source.slice(source.indexOf('await voiceTrackingService.start()'))
		expect(afterStart.slice(0, 400)).not.toMatch(/voiceTrackingActive\s*=/)
	})
})
