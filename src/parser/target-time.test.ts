import { describe, expect, test } from 'bun:test'
import { extractTargetTime } from './text-cleaner'
import { parseTargetTime } from '../timing/speech-timer'

const fm = (body: string) => `---\n${body}\n---\n\n## Abertura\n\nSou engenheiro de dados.\n`

describe('extractTargetTime', () => {
	test('reads target-time and the teleprompter-target alias', () => {
		expect(extractTargetTime(fm('title: Resposta\ntarget-time: 2:00'))).toBe('2:00')
		expect(extractTargetTime(fm('teleprompter-target: 45m'))).toBe('45m')
	})

	test('handles quoted values and padding', () => {
		expect(extractTargetTime(fm('target-time: "2:00"'))).toBe('2:00')
		expect(extractTargetTime(fm("target-time:   '1:30:00'  "))).toBe('1:30:00')
	})

	test('ignores a commented-out key — a silently applied target is worse than none', () => {
		expect(extractTargetTime(fm('# target-time: 5:00\ntitle: Resposta'))).toBeNull()
	})

	test('ignores the key in the note body, outside the frontmatter', () => {
		expect(extractTargetTime('# Script\n\ntarget-time: 5:00 is what we agreed.\n')).toBeNull()
		expect(extractTargetTime(fm('title: Resposta') + '\ntarget-time: 9:00\n')).toBeNull()
	})

	test('absent key, absent frontmatter and empty value are all null', () => {
		expect(extractTargetTime(fm('title: Resposta'))).toBeNull()
		expect(extractTargetTime('Sem frontmatter nenhum.')).toBeNull()
		expect(extractTargetTime(fm('target-time:'))).toBeNull()
	})

	test('stays linear on a hostile note', () => {
		const start = performance.now()
		expect(extractTargetTime('---\n' + 'a'.repeat(200_000))).toBeNull()
		expect(extractTargetTime(fm('x: y\n'.repeat(20_000)))).toBeNull()
		expect(performance.now() - start).toBeLessThan(1000)
	})
})

describe('extractTargetTime + parseTargetTime together', () => {
	test('a real note frontmatter resolves to seconds', () => {
		expect(parseTargetTime(extractTargetTime(fm('target-time: 2:00')))).toBe(120)
		expect(parseTargetTime(extractTargetTime(fm('target-time: 1h')))).toBe(3600)
	})

	test('an unparseable value resolves to null so the caller can fall back to the default', () => {
		expect(parseTargetTime(extractTargetTime(fm('target-time: logo mais')))).toBeNull()
		expect(parseTargetTime(extractTargetTime(fm('target-time: 2:75')))).toBeNull()
	})
})
