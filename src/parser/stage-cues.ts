/**
 * Stage cues: `[pause]`, `[slow down]`, `[STAR: Situation]`. Notes to the speaker, never words to say.
 * A cue starts with a letter and has at least two characters. That leaves citations `[@key]`,
 * footnotes `[^1]`, wiki links `[[x]]`, callouts `[!note]`, task boxes `[x]` and inline links alone.
 * A bracket naming a link the note defines (`[one]: http://x.io`) is a link, not a cue.
 */

const CUE = /(?<![\[\\])\[(\p{L}[^\][\n]{1,80})\](?![(:])/gu

const LINK_DEFINITION = /^ {0,3}\[([^\]\n]+)\]:/gm

/** Fenced code and inline code keep their brackets. */
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g

function outsideCode(markdown: string, change: (text: string) => string): string {
	return markdown
		.split(CODE)
		.map((part, i) => (i % 2 === 1 ? part : change(part)))
		.join('')
}

function linkLabels(markdown: string): Set<string> {
	return new Set([...markdown.matchAll(LINK_DEFINITION)].map(match => match[1].toLowerCase()))
}

function replaceCues(markdown: string, replacement: (cue: string) => string): string {
	const labels = linkLabels(markdown)
	const keepLinks = (cue: string, label: string): string =>
		labels.has(label.toLowerCase()) ? cue : replacement(cue)
	return outsideCode(markdown, text => {
		// A pair where the second names a link is one reference link, so both brackets stay.
		const protectedText = text.replace(/\[[^\][\n]+\]\[([^\][\n]+)\]/g, (pair: string, label: string) =>
			labels.has(label.toLowerCase()) ? pair.replace(/\[/g, '\u0000') : pair
		)
		return protectedText.replace(CUE, keepLinks).replace(/\u0000/g, '[')
	})
}

/** Wraps each cue so the display can hide or dim it and voice can skip it. */
export function markStageCues(markdown: string): string {
	return replaceCues(markdown, cue => `<span class="tp-stage-cue">${cue}</span>`)
}

/** Removes each cue, for text about to be spoken. */
export function stripStageCues(text: string): string {
	return replaceCues(text, () => '')
}
