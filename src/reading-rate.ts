/**
 * Scroll speed in the reader's units: words per minute.
 *
 * Playback speed stays the internal unit (speed 1 = PIXELS_PER_SECOND_AT_SPEED_1 pixels a second,
 * see ./playback). What the reader says per minute is that rate times how many words the script
 * packs into a pixel, which depends on font size, line height, width and spacing, so it is measured
 * from the rendered script rather than assumed. Pure: the caller passes the measured counts.
 */

import { PIXELS_PER_SECOND_AT_SPEED_1 } from './playback'

/** Words per pixel of scroll, or null when there is nothing to measure. */
export function wordsPerPixel(wordCount: number, heightPx: number): number | null {
	if (!(wordCount > 0) || !(heightPx > 0) || !Number.isFinite(wordCount) || !Number.isFinite(heightPx)) return null
	return wordCount / heightPx
}

/** The rendered line table's shape, as far as density needs it (see passage-dom.ts LineTable). */
export interface LineExtent {
	/** Index of each line's first word, then the word count. */
	firstWord: readonly number[]
	/** Content y of each line's top, then the last line's bottom. */
	top: readonly number[]
}

/**
 * Words per pixel over the whole rendered script, first line to last: paragraph gaps, headings and
 * images count as height, because the scroll has to cross them too.
 */
export function densityOfLines(lines: LineExtent): number | null {
	const last = lines.top.length - 1
	if (last < 1 || lines.firstWord.length !== lines.top.length) return null
	return wordsPerPixel(lines.firstWord[last] - lines.firstWord[0], lines.top[last] - lines.top[0])
}

/** Words per minute the reader says at this playback speed. Null when density is unknown. */
export function speedToWordsPerMinute(speed: number, density: number | null): number | null {
	if (density === null || !(density > 0) || !Number.isFinite(speed) || speed < 0) return null
	return speed * PIXELS_PER_SECOND_AT_SPEED_1 * density * 60
}

/** The playback speed that reads `wordsPerMinute`. Null when density is unknown. */
export function wordsPerMinuteToSpeed(wordsPerMinute: number, density: number | null): number | null {
	if (density === null || !(density > 0) || !Number.isFinite(wordsPerMinute) || wordsPerMinute < 0) return null
	return wordsPerMinute / (60 * density * PIXELS_PER_SECOND_AT_SPEED_1)
}

/** "148 wpm", or an empty string when the density is not known yet. */
export function formatWordsPerMinute(wordsPerMinute: number | null): string {
	return wordsPerMinute === null ? '' : `${Math.round(wordsPerMinute)} wpm`
}

/** Words in a stretch of scroll at this density, whole words. */
export function wordsInDistance(distancePx: number, density: number | null): number | null {
	if (density === null || !(density > 0) || !(distancePx >= 0)) return null
	return Math.round(distancePx * density)
}
