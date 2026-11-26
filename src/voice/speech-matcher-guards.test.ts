import { describe, expect, test } from 'bun:test'
import { tokenizeWords } from './word-tokenizer'
import { findGlobalPosition, type SpeechMatcherConfig } from './speech-matcher'

const CONFIG: SpeechMatcherConfig = { windowSize: 6, confidenceThreshold: 0.2 }

// Distinct filler so the only repeated text in a script is the twin we place on purpose.
function filler(label: string, words: number): string {
	return Array.from({ length: words }, (_, i) => `${label}${i}x`).join(' ')
}

const TWIN = 'the story begins with a small farm near the river'

describe('findGlobalPosition guards', () => {
	test('ambiguity freeze: near-identical distant sections return -1', () => {
		const script = [TWIN, filler('mid', 120), TWIN].join(' ')
		const reference = tokenizeWords(script)
		// Reader sits between the twins' influence; proximity must not decide for them.
		const result = findGlobalPosition('the story begins with a small farm', reference, CONFIG, 60)
		expect(result).toBe(-1)
	})

	test('ambiguity freeze does not fire when the section is unique', () => {
		const script = [TWIN, filler('mid', 120), 'a completely different closing paragraph about taxes'].join(' ')
		const reference = tokenizeWords(script)
		const result = findGlobalPosition('the story begins with a small farm', reference, CONFIG, 0)
		expect(result).toBe(0)
	})

	test('weak evidence: fewer than 4 words cannot jump more than 50 words', () => {
		const script = [filler('lead', 100), 'unique closing sentence appears here today'].join(' ')
		const reference = tokenizeWords(script)
		const farIndex = 100
		const weak = findGlobalPosition('unique closing', reference, CONFIG, 0)
		expect(weak).toBe(-1)
		// Same target with 4 words of evidence is allowed to jump.
		const strong = findGlobalPosition('unique closing sentence appears', reference, CONFIG, 0)
		expect(strong).toBe(farIndex)
	})
})
