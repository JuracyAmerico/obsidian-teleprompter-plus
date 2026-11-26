import { afterEach, describe, expect, mock, test } from 'bun:test'
import { obsidianStub } from '../test-support/obsidian-stub'
import { tokenize } from './word-tokenizer'
import { INTERVIEW_SCRIPT } from './fixtures/interview-script'
import { createHarness, type Harness } from './fixtures/service-harness'

// The voice modules import Obsidian runtime values; the tests need none of them.
void mock.module('obsidian', () => obsidianStub)

const { VoiceTrackingService } = await import('./voice-tracking-service')

/**
 * Apple's recognizer takes at most 100 hint words. They are worth spending on the words it is most
 * likely to miss: the rare ones in this script (names, jargon), not on words that merely start a
 * sentence with a capital ("Then", "Now", "I") and that it hears perfectly well anyway.
 */
let harness: Harness
afterEach(() => harness?.restore())

function hintsFor(script: string): string[] {
	harness = createHarness(VoiceTrackingService, script)
	harness.internals.tokens = tokenize(script)
	const hints = harness.internals.buildContextVocabulary()
	return hints ? (JSON.parse(hints) as string[]) : []
}

describe('Apple hint words', () => {
	// A real script read twice over, so its own words are all common, with sentence starters
	// ("Then", "Now", "The") on top; the rare words come last, after the 100-word cap would be full.
	const starters = 'Then we checked it. Now I opened it. The team reviewed it. '.repeat(10)
	const script = `${starters} ${INTERVIEW_SCRIPT} ${INTERVIEW_SCRIPT} Hamid asked about geoint, hydroponics and the U-Haul contract with Niagara.`

	test('rare script words make the list even when they come last', () => {
		const hints = hintsFor(script)
		for (const rare of ['Hamid', 'hydroponics', 'geoint', 'Niagara']) expect(hints).toContain(rare)
	})

	test('frequent capitalised sentence starters do not use up the list', () => {
		const hints = hintsFor(script).map(h => h.toLowerCase())
		for (const common of ['then', 'now', 'i', 'the']) expect(hints).not.toContain(common)
	})

	test('a hyphenated name is hinted whole, as the reader says it', () => {
		expect(hintsFor(script)).toContain('U-Haul')
	})

	test('the script really has more candidate words than the cap', () => {
		const candidates = new Set(tokenize(script).filter(t => t.type === 'TOKEN' && t.value.length >= 4).map(t => t.value.toLowerCase()))
		expect(candidates.size).toBeGreaterThan(130)
	})

	test('never more than 100 hints, each once regardless of case', () => {
		const hints = hintsFor(script)
		expect(hints.length).toBeLessThanOrEqual(100)
		expect(new Set(hints.map(h => h.toLowerCase())).size).toBe(hints.length)
	})

	test('on a real script the list runs from rarest to most frequent', () => {
		const hints = hintsFor(INTERVIEW_SCRIPT)
		const counts = new Map<string, number>()
		for (const t of tokenize(INTERVIEW_SCRIPT)) {
			if (t.type === 'TOKEN') counts.set(t.value.toLowerCase(), (counts.get(t.value.toLowerCase()) ?? 0) + 1)
		}
		const order = hints.map(h => counts.get(h.toLowerCase()) ?? 0)
		expect(order).toEqual([...order].sort((a, b) => a - b))
		expect(hints.slice(0, 40)).toContain('Linux')
	})
})
