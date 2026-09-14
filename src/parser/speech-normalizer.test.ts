import { describe, expect, test } from 'bun:test'
import { integerToWords, normalizeForSpeech } from './speech-normalizer'

describe('integerToWords', () => {
	test('scales', () => {
		expect(integerToWords('0')).toBe('zero')
		expect(integerToWords('595445')).toBe('five hundred ninety-five thousand four hundred forty-five')
		expect(integerToWords('1000000')).toBe('one million')
		expect(integerToWords('12380')).toBe('twelve thousand three hundred eighty')
	})
	test('leading zero reads as digits', () => {
		expect(integerToWords('0231')).toBe('zero two three one')
	})
})

describe('normalizeForSpeech — sentences from a real capstone reflection', () => {
	test('correlation formula', () => {
		expect(normalizeForSpeech('from r = +0.012 to r = +0.19, and'))
			.toBe('from r equals plus zero point zero one two to r equals plus zero point one nine, and')
	})
	test('p-value with leading decimal', () => {
		expect(normalizeForSpeech('at r = +0.19 and p = .35 across'))
			.toBe('at r equals plus zero point one nine and p equals point three five across')
	})
	test('thousands separators', () => {
		expect(normalizeForSpeech('discarding 595,445 households.'))
			.toBe('discarding five hundred ninety-five thousand four hundred forty-five households.')
		expect(normalizeForSpeech('from 16,276 to 12,380.'))
			.toBe('from sixteen thousand two hundred seventy-six to twelve thousand three hundred eighty.')
	})
	test('decimal percent', () => {
		expect(normalizeForSpeech('covering 86.5 percent of points')).toBe('covering eighty-six point five percent of points')
		expect(normalizeForSpeech('covering 86.5% of points')).toBe('covering eighty-six point five percent of points')
	})
	test('years and dates', () => {
		expect(normalizeForSpeech('(Statistics Canada, 2022).')).toBe('(Statistics Canada, twenty twenty-two).')
		expect(normalizeForSpeech('On 1 September, while')).toBe('On the first of September, while')
		expect(normalizeForSpeech('delivered on 2 September.')).toBe('delivered on the second of September.')
		expect(normalizeForSpeech('on September 22, 2026')).toBe('on September twenty-second, twenty twenty-six')
		expect(normalizeForSpeech('from 13 to 40 May')).toBe('from thirteen to forty May')
		expect(normalizeForSpeech('in 2005')).toBe('in two thousand five')
	})
})

describe('normalizeForSpeech — other forms', () => {
	test('currency', () => {
		expect(normalizeForSpeech('$1,000,000')).toBe('one million dollars')
		expect(normalizeForSpeech('$12.50 each')).toBe('twelve dollars and fifty cents each')
		expect(normalizeForSpeech('$1.5 million')).toBe('one point five million dollars')
		expect(normalizeForSpeech('$1 fee')).toBe('one dollar fee')
	})
	test('ranges and ordinals', () => {
		expect(normalizeForSpeech('25,000–35,000 farms')).toBe('twenty-five thousand to thirty-five thousand farms')
		expect(normalizeForSpeech('the 29th and 1st')).toBe('the twenty-ninth and first')
	})
	test('negative and comparison', () => {
		expect(normalizeForSpeech('β = −0.4, p < .05')).toBe('β equals minus zero point four, p less than point zero five')
		expect(normalizeForSpeech('n ≥ 30')).toBe('n greater than or equal to thirty')
	})
	test('identifiers, versions, times and fractions stay untouched', () => {
		for (const s of ['Table 32-10-0231', 'version 0.11.7', 'Flash v2.5', 'at 10:30', 'half is 1/2', 'five-year', 'COVID-19']) {
			expect(normalizeForSpeech(s)).toBe(s)
		}
	})
	test('hostile input stays linear (synced notes are untrusted)', () => {
		for (const input of ['1'.repeat(100_000) + 'a', '1,'.repeat(50_000), '.1'.repeat(50_000), ' = '.repeat(30_000)]) {
			const start = performance.now()
			normalizeForSpeech(input)
			expect(performance.now() - start).toBeLessThan(1000)
		}
	})
	test('plain prose is unchanged', () => {
		const s = 'The client approved that change in writing, and nothing in the table is a forecast.'
		expect(normalizeForSpeech(s)).toBe(s)
	})
})
