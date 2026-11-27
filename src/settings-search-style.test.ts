import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The magnifier in Settings' search box sat over the first letter of "Search settings..." (ISC-213).
 * Obsidian styles every `input[type="text"]` with its own padding, specificity (0,1,1), which beat
 * our `.tp-search-input` (0,1,0): measured live, the box's left padding was 8 px instead of 2.25rem,
 * and the 16 px icon starts at 12 px.
 */
const css = readFileSync(join(import.meta.dir, 'styles.css'), 'utf8')

/** [ids, classes + attributes + pseudo-classes, elements] of one simple CSS selector. */
function specificity(selector: string): [number, number, number] {
	const ids = selector.match(/#[\w-]+/g)?.length ?? 0
	const classes = (selector.match(/\.[\w-]+/g)?.length ?? 0) + (selector.match(/\[[^\]]+\]/g)?.length ?? 0) +
		(selector.match(/:(?!:)[\w-]+/g)?.length ?? 0)
	const elements = selector.replace(/\[[^\]]+\]/g, '').split(/[\s>+~]+/).filter(part => /^[a-z]/i.test(part)).length
	return [ids, classes, elements]
}

function beats(a: [number, number, number], b: [number, number, number]): boolean {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
	return false
}

/** Every rule in styles.css whose selector names the search input, with its declarations. */
function searchInputRules(): Array<{ selector: string; body: string }> {
	const rules: Array<{ selector: string; body: string }> = []
	for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
		for (const selector of match[1].split(',').map(s => s.trim())) {
			if (selector.includes('tp-search-input') && !selector.includes('::placeholder')) rules.push({ selector, body: match[2] })
		}
	}
	return rules
}

describe('settings search box (ISC-213)', () => {
	const OBSIDIAN_TEXT_INPUT = specificity('input[type="text"]')

	test('the selector check measures what it should', () => {
		expect(OBSIDIAN_TEXT_INPUT).toEqual([0, 1, 1])
		expect(specificity('.tp-search-input')).toEqual([0, 1, 0])
		expect(specificity('.tp-search-container .tp-search-input')).toEqual([0, 2, 0])
	})

	test('the rule that pads the input clear of the icon outranks Obsidian\'s text-input padding', () => {
		const padded = searchInputRules().filter(rule => /padding(-left)?\s*:/.test(rule.body))
		expect(padded.length).toBeGreaterThan(0)
		for (const rule of padded) expect(beats(specificity(rule.selector), OBSIDIAN_TEXT_INPUT), rule.selector).toBe(true)
	})

	test('the left padding clears the icon: icon left plus its 16 px width plus a gap', () => {
		const icon = /\.tp-search-icon\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
		expect(icon).toContain('left: 0.75rem')
		expect(icon).toContain('width: 16px')
		const padded = searchInputRules().find(rule => /padding\s*:/.test(rule.body))
		const left = /padding:\s*[\d.]+rem\s+[\d.]+rem\s+[\d.]+rem\s+([\d.]+)rem/.exec(padded?.body ?? '')?.[1]
		// 0.75rem + 16 px (1rem) = 1.75rem; the text starts at least 0.25rem after the icon.
		expect(Number(left)).toBeGreaterThanOrEqual(2)
	})
})
