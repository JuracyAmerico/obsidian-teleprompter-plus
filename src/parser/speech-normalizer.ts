/**
 * Spoken-form normalization for TTS (English).
 *
 * Small/fast voices (ElevenLabs Flash v2.5, Kokoro, Web Speech) guess at raw digits and symbols:
 * "r = +0.012" or "595,445" come out as gibberish or as "one thousand thousand". ElevenLabs'
 * own guidance for Flash is to normalize before sending. We do it once, deterministically, for
 * every engine — the text is only ever spoken, never displayed, so the on-screen script is intact.
 *
 * Deliberately conservative: anything that looks like a code or version (32-10-0231, v2.5,
 * 0.11.7, 10:30, 1/2) is left untouched rather than read wrong in a new way.
 */

const ONES = [
	'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
	'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion']

function underHundred(n: number): string {
	if (n < 20) return ONES[n]
	const t = TENS[Math.floor(n / 10)]
	return n % 10 ? `${t}-${ONES[n % 10]}` : t
}

function underThousand(n: number): string {
	const h = Math.floor(n / 100)
	const rest = n % 100
	if (!h) return underHundred(rest)
	return rest ? `${ONES[h]} hundred ${underHundred(rest)}` : `${ONES[h]} hundred`
}

function spellDigits(digits: string): string {
	return digits.split('').map(d => ONES[Number(d)]).join(' ')
}

/** "595445" -> "five hundred ninety-five thousand four hundred forty-five" */
export function integerToWords(digits: string): string {
	if (!/^\d+$/.test(digits)) return digits
	// Past trillions, or a leading zero ("0231"), digits are an identifier — read them one by one.
	if (digits.length > 15 || (digits.length > 1 && digits[0] === '0')) return spellDigits(digits)
	let n = Number(digits)
	if (n === 0) return 'zero'
	const parts: string[] = []
	for (let scale = 0; n > 0; scale++) {
		const chunk = n % 1000
		if (chunk) parts.unshift(SCALES[scale] ? `${underThousand(chunk)} ${SCALES[scale]}` : underThousand(chunk))
		n = Math.floor(n / 1000)
	}
	return parts.join(' ')
}

/** "2022" -> "twenty twenty-two", "1995" -> "nineteen ninety-five", "2005" -> "two thousand five" */
function yearToWords(n: number): string {
	if (n >= 2000 && n < 2010) return integerToWords(String(n))
	const hi = Math.floor(n / 100)
	const lo = n % 100
	if (!lo) return `${underHundred(hi)} hundred`
	return `${underHundred(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : underHundred(lo)}`
}

function ordinalize(words: string): string {
	const irregular: Record<string, string> = {
		one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
	}
	return words.replace(/([a-z]+)$/, (last) => {
		if (irregular[last]) return irregular[last]
		if (last.endsWith('y')) return last.slice(0, -1) + 'ieth'
		return last + 'th'
	})
}

function readNumber(intPart: string, fraction: string | undefined): string {
	const plain = intPart.replace(/,/g, '')
	let words: string
	if (!intPart.includes(',') && !fraction && /^\d{4}$/.test(plain) && +plain >= 1100 && +plain < 2100) {
		words = yearToWords(+plain)
	} else {
		words = integerToWords(plain)
	}
	return fraction ? `${words} point ${spellDigits(fraction)}` : words
}

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'

const CURRENCY: Record<string, [string, string]> = { '$': ['dollar', 'dollars'], '€': ['euro', 'euros'], '£': ['pound', 'pounds'] }

// A number may not touch a word character, a hyphen/slash/colon (codes, dates, times, fractions),
// or another digit group — that is what keeps "32-10-0231", "v2.5" and "0.11.7" out.
const NUMBER = /(?<![\w\-/:.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?![\w\-/:]|[.,]\d)/g
const LEADING_DECIMAL = /(?<![\w\-/:.,])\.(\d+)(?![\w\-/:]|[.,]\d)/g

export function normalizeForSpeech(text: string): string {
	let out = text

	// $1,250.50 / $1.5 million
	out = out.replace(
		/(?<![\w.])([$€£])\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s(thousand|million|billion|trillion)\b)?(?![\w\-/:]|[.,]\d)/g,
		(_m, sym: string, int: string, frac: string | undefined, scale: string | undefined) => {
			const [one, many] = CURRENCY[sym]
			if (scale) return `${readNumber(int, frac)} ${scale} ${many}`
			const unit = int === '1' && !frac ? one : many
			if (frac && frac.length === 2) {
				const cents = Number(frac)
				return cents ? `${readNumber(int, undefined)} ${unit} and ${integerToWords(String(cents))} cents` : `${readNumber(int, undefined)} ${unit}`
			}
			return `${readNumber(int, frac)} ${unit}`
		},
	)

	// 25,000–35,000 (en/em dash only; a hyphen is usually a code)
	out = out.replace(/(\d)\s?[–—]\s?(?=[$€£]?\.?\d)/g, '$1 to ')

	// 86.5% -> 86.5 percent
	out = out.replace(/(\d)\s?%/g, '$1 percent')

	// Dates: "1 September" -> "the first of September", "September 1" -> "September first"
	out = out.replace(new RegExp(`(?<![\\w.,])(\\d{1,2})\\s(${MONTHS})\\b`, 'g'), (m, d: string, month: string) =>
		+d >= 1 && +d <= 31 ? `the ${ordinalize(integerToWords(d))} of ${month}` : m)
	out = out.replace(new RegExp(`\\b(${MONTHS})\\s(\\d{1,2})(?![\\w\\-/:]|[.,]\\d)`, 'g'), (m, month: string, d: string) =>
		+d >= 1 && +d <= 31 ? `${month} ${ordinalize(integerToWords(d))}` : m)

	// 29th, 1st
	out = out.replace(/(?<![\w.,])(\d+)(st|nd|rd|th)\b/gi, (_m, n: string) => ordinalize(integerToWords(n)))

	// Operators only when spaced like a formula, so prose and markup are never touched.
	const operators: Array<[RegExp, string]> = [
		[/\s(?:≤|<=)\s/g, ' less than or equal to '],
		[/\s(?:≥|>=)\s/g, ' greater than or equal to '],
		[/\s(?:≠|!=)\s/g, ' not equal to '],
		[/\s≈\s/g, ' approximately '],
		[/\s±\s/g, ' plus or minus '],
		[/\s=\s/g, ' equals '],
		[/\s<\s/g, ' less than '],
		[/\s>\s/g, ' greater than '],
		[/\s[×x]\s(?=\d)/g, ' times '],
		[/\s÷\s/g, ' divided by '],
	]
	for (const [pattern, spoken] of operators) out = out.replace(pattern, spoken)

	// Signs directly on a number: "+0.19", "(−0.4", "± .05"
	out = out.replace(/(^|[\s(])±(?=\.?\d)/g, '$1plus or minus ')
	out = out.replace(/(^|[\s(])\+(?=\.?\d)/g, '$1plus ')
	out = out.replace(/(^|[\s(])[-−](?=\.?\d)/g, '$1minus ')

	out = out.replace(NUMBER, (_m, int: string, frac: string | undefined) => readNumber(int, frac))
	out = out.replace(LEADING_DECIMAL, (_m, frac: string) => `point ${spellDigits(frac)}`)

	return out
}
