import { describe, expect, test } from 'bun:test'
import { applyPronunciations, integerToWords, normalizeForSpeech, parsePronunciations, spokenSeparators } from './speech-normalizer'

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

describe('normalizeForSpeech: found reading a real resume aloud', () => {
	test('money suffix', () => {
		expect(normalizeForSpeech('supports more than US$1B in daily trades')).toBe('supports more than one billion US dollars in daily trades')
		expect(normalizeForSpeech('raised $1.5M last year')).toBe('raised one point five million dollars last year')
		expect(normalizeForSpeech('paid $25K.')).toBe('paid twenty-five thousand dollars.')
		expect(normalizeForSpeech('costs C$40 today')).toBe('costs forty Canadian dollars today')
		expect(normalizeForSpeech('costs $40 today')).toBe('costs forty dollars today')
	})
	test('province and month', () => {
		expect(normalizeForSpeech('Niagara Falls, ON')).toBe('Niagara Falls, Ontario')
		expect(normalizeForSpeech('Vancouver, BC, Canada')).toBe('Vancouver, British Columbia, Canada')
		expect(normalizeForSpeech('turn it, ON or off')).toBe('turn it, ON or off')
		expect(normalizeForSpeech('ON AIR')).toBe('ON AIR')
		expect(normalizeForSpeech('Apr 2020 to Sep 2022')).toBe('April twenty twenty to September twenty twenty-two')
		expect(normalizeForSpeech('Sept 3')).toBe('September third')
		expect(normalizeForSpeech('the Sep team')).toBe('the Sep team')
		expect(normalizeForSpeech('May 2020')).toBe('May twenty twenty')
	})
	test('contact details', () => {
		expect(spokenSeparators('jane.doe@example.com', 'en')).toBe('jane dot doe at example dot com')
		expect(spokenSeparators('jane.doe@example.com', 'pt')).toBe('jane ponto doe arroba example ponto com')
		expect(normalizeForSpeech('(555) 012-3456')).toBe('five five five, zero one two, three four five six')
		expect(normalizeForSpeech('+1 555-012-3456')).toBe('five five five, zero one two, three four five six')
		expect(normalizeForSpeech('Job Posting #32250, role')).toBe('Job Posting number three two two five zero, role')
		expect(normalizeForSpeech('code 32-10-0231')).toBe('code 32-10-0231')
	})
	test('separators', () => {
		expect(spokenSeparators('| Juracy| Niagara Falls | Canada', 'en')).toBe('Juracy, Niagara Falls, Canada')
		expect(spokenSeparators('Lead | Apr 2020 |', 'en')).toBe('Lead, Apr 2020')
		expect(normalizeForSpeech('worked with 8+ executives across 150+ accounts.')).toBe('worked with eight plus executives across one hundred fifty plus accounts.')
		expect(normalizeForSpeech('r = +0.19')).toBe('r equals plus zero point one nine')
	})
	test('pronunciation list', () => {
		const list = parsePronunciations('FICO = Fye-co\n\nnot a rule\nSão Paulo = Sao Paulo\n = empty\nbad =')
		expect(list).toEqual([['São Paulo', 'Sao Paulo'], ['FICO', 'Fye-co']])
		expect(applyPronunciations('At FICO, in São Paulo.', list)).toBe('At Fye-co, in Sao Paulo.')
		expect(applyPronunciations('FICOS and fico stay', list)).toBe('FICOS and fico stay')
		expect(parsePronunciations('a.b = x').length).toBe(1)
		expect(applyPronunciations('axb', parsePronunciations('a.b = x'))).toBe('axb')
	})
})
