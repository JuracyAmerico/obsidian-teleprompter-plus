import { describe, expect, test } from 'bun:test'
import {
	assignSectionTargets,
	normalizeHeadingTitle,
	parseHeadingTarget,
	parseSectionTargets,
	stripHeadingTargets,
} from './section-targets'
import { createHeadingLineMapper } from './heading-source-map'
import { cleanDocument } from './text-cleaner'

describe('parseHeadingTarget', () => {
	test('minutes:seconds and seconds both give a target, and the braces leave the title', () => {
		expect(parseHeadingTarget('Why us {1:30}')).toEqual({ title: 'Why us', targetSeconds: 90 })
		expect(parseHeadingTarget('Why us {90s}')).toEqual({ title: 'Why us', targetSeconds: 90 })
		expect(parseHeadingTarget('Closing {2m}')).toEqual({ title: 'Closing', targetSeconds: 120 })
		expect(parseHeadingTarget('Talk {1:05:00}')).toEqual({ title: 'Talk', targetSeconds: 3900 })
		expect(parseHeadingTarget('Story {1m 30s}')).toEqual({ title: 'Story', targetSeconds: 90 })
	})

	test('padding inside the braces and after them is allowed', () => {
		expect(parseHeadingTarget('Why us { 1:30 }  ')).toEqual({ title: 'Why us', targetSeconds: 90 })
	})

	test('a heading with no target is its own title, with no target', () => {
		expect(parseHeadingTarget('Why us')).toEqual({ title: 'Why us', targetSeconds: null })
		expect(parseHeadingTarget('  Why us  ')).toEqual({ title: 'Why us', targetSeconds: null })
	})

	test('a time-shaped value that does not parse is removed but gives no target', () => {
		expect(parseHeadingTarget('Why us {1:75}')).toEqual({ title: 'Why us', targetSeconds: null })
		expect(parseHeadingTarget('Why us {0s}')).toEqual({ title: 'Why us', targetSeconds: null })
	})

	test('malformed or non-time braces are not a target and stay in the title', () => {
		for (const text of ['Why us {1:30', 'Why us 1:30}', 'Why us {}', 'Why us {soon}', 'Why us {#why}', 'Why us {.unnumbered}']) {
			expect(parseHeadingTarget(text)).toEqual({ title: text, targetSeconds: null })
		}
	})

	test('a bare number is not a target: a year in a title must never become 2024 minutes', () => {
		expect(parseHeadingTarget('Plans for {2024}')).toEqual({ title: 'Plans for {2024}', targetSeconds: null })
	})

	test('only the last brace group counts, and only at the very end', () => {
		expect(parseHeadingTarget('Why {1:30} us')).toEqual({ title: 'Why {1:30} us', targetSeconds: null })
		expect(parseHeadingTarget('A {x} B {45s}')).toEqual({ title: 'A {x} B', targetSeconds: 45 })
	})

	test('an ATX closing sequence is ignored', () => {
		expect(parseHeadingTarget('Why us {1:30} ##')).toEqual({ title: 'Why us', targetSeconds: 90 })
		expect(parseHeadingTarget('C# basics')).toEqual({ title: 'C# basics', targetSeconds: null })
	})
})

describe('stripHeadingTargets', () => {
	const note = [
		'Intro line {1:30} stays: it is not a heading.',
		'',
		'## Why us {1:30}',
		'',
		'Because.',
		'',
		'### Detail {90s} ###',
		'',
		'```',
		'## Not a heading {1:30}',
		'```',
		'',
		'    ## Indented code {1:30}',
		'## Pandoc {#keep}',
	].join('\n')

	test('removes the braces from headings only, keeping every line', () => {
		const out = stripHeadingTargets(note).split('\n')
		expect(out.length).toBe(note.split('\n').length)
		expect(out[0]).toBe('Intro line {1:30} stays: it is not a heading.')
		expect(out[2]).toBe('## Why us')
		expect(out[6]).toBe('### Detail')
		expect(out[9]).toBe('## Not a heading {1:30}')
		expect(out[12]).toBe('    ## Indented code {1:30}')
		expect(out[13]).toBe('## Pandoc {#keep}')
	})

	test('a stripped heading is still a prefix of its source line, so the line mapper finds it', () => {
		const source = '#   Spaced {1:30}\n\nText\n\n## Why us {90s}\n\nMore'
		const stripped = stripHeadingTargets(source)
		const mapper = createHeadingLineMapper(source)
		expect(mapper.resolve(stripped.split('\n')[0])).toBe(0)
		expect(mapper.resolve(stripped.split('\n')[4])).toBe(4)
	})

	test('a note with no braces comes back as the same string', () => {
		const plain = '## Why us\n\nBecause.'
		expect(stripHeadingTargets(plain)).toBe(plain)
	})

	test('stays linear on a hostile note', () => {
		const start = performance.now()
		stripHeadingTargets('# ' + ' '.repeat(100_000) + '{')
		stripHeadingTargets(('# a {' + '1'.repeat(30) + '}\n').repeat(20_000))
		parseHeadingTarget(' '.repeat(100_000) + '#'.repeat(100_000))
		parseHeadingTarget('{'.repeat(100_000) + '}')
		expect(performance.now() - start).toBeLessThan(1000)
	})
})

describe('parseSectionTargets', () => {
	test('lists every heading in order with its target and line', () => {
		const md = '# Title\n\n## Why us {1:30}\n\ntext\n\n## Closing\n'
		expect(parseSectionTargets(md)).toEqual([
			{ title: 'Title', targetSeconds: null, line: 0 },
			{ title: 'Why us', targetSeconds: 90, line: 2 },
			{ title: 'Closing', targetSeconds: null, line: 6 },
		])
	})

	test('hashtags and fenced headings are not sections', () => {
		expect(parseSectionTargets('#tag\n~~~\n# fenced\n~~~\n#\n')).toEqual([{ title: '', targetSeconds: null, line: 4 }])
	})
})

describe('assignSectionTargets', () => {
	const source = parseSectionTargets('## Intro\n## Why us {1:30}\n## **Strengths** {2:00}\n## Why us {45s}\n')

	test('matches rendered titles by their words, ignoring markdown symbols and case', () => {
		expect(assignSectionTargets(['Intro', 'Why us', 'Strengths', 'Why us'], source)).toEqual([null, 90, 120, 45])
		expect(assignSectionTargets(['INTRO', 'why  us', '**Strengths**', 'Why us!'], source)).toEqual([null, 90, 120, 45])
	})

	test('a rendered heading with no source match gets null and does not shift the rest', () => {
		expect(assignSectionTargets(['Intro', 'From an embed', 'Why us', 'Strengths'], source)).toEqual([null, null, 90, 120])
	})

	test('an empty title never matches', () => {
		expect(assignSectionTargets(['', '...'], source)).toEqual([null, null])
	})

	test('normalization keeps letters of every script and drops accents and symbols', () => {
		expect(normalizeHeadingTitle('Por que nós? — Ação')).toBe('porquenosacao')
	})
})

describe('read-aloud never says the target', () => {
	test('cleanDocument drops the braces from the spoken heading', () => {
		const doc = cleanDocument('## Why us {1:30}\n\nBecause we ship.\n')
		expect(doc.sections[0].heading).toBe('Why us')
		expect(doc.allSentences.join(' ')).not.toContain('1:30')
	})
})
