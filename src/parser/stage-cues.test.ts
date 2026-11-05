import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { markStageCues, stripStageCues } from './stage-cues'
import { cleanDocument } from './text-cleaner'
import { tokenize } from '../voice/word-tokenizer'
import { UNTRACKED_TEXT_SELECTOR } from '../passage-dom'

const src = (file: string): string => readFileSync(join(import.meta.dir, '..', file), 'utf8')
const cue = (text: string): string => `<span class="tp-stage-cue">${text}</span>`

describe('stage cues', () => {
	test('render: cues are wrapped', () => {
		expect(markStageCues('Hello [pause] there')).toBe(`Hello ${cue('[pause]')} there`)
		expect(markStageCues('[STAR: Situation] We shipped')).toBe(`${cue('[STAR: Situation]')} We shipped`)
		expect(markStageCues('[pausa longa]')).toBe(cue('[pausa longa]'))
	})

	test('render: cues in tight spots are found', () => {
		expect(markStageCues('Say it![pause] now')).toBe(`Say it!${cue('[pause]')} now`)
		expect(markStageCues('Go.[pause][slow down] go')).toContain(cue('[slow down]'))
		expect(markStageCues('Go.[pause][slow down] go')).toContain(cue('[pause]'))
	})

	test('render: a bracket naming a defined link stays a link', () => {
		const note = 'read [the guide] and [more][one] then [pause]\n\n[the guide]: http://x.io\n[one]: http://y.io'
		const marked = markStageCues(note)
		expect(marked).toContain('read [the guide] and [more][one] then')
		expect(marked).toContain(cue('[pause]'))
	})

	test('render: lookalikes are left alone', () => {
		for (const text of [
			'see [@smith2020] here',
			'note[^1] here',
			'[[Wiki link]]',
			'![[embed.png]]',
			'![alt text](a.png)',
			'[a link](http://x.io)',
			'[one]: http://x.io',
			'> [!note] a callout',
			'- [x] done',
			'- [ ] open',
			'[1] numbered',
			'`[pause]` inline code',
			'```\n[pause]\n```',
		]) {
			expect(markStageCues(text)).toBe(text)
		}
	})

	test('render: the app marks cues and has the two display styles', () => {
		const app = src('TeleprompterApp.svelte')
		expect(app).toContain('markStageCues(processedContent)')
		expect(app).toContain("class:tp-show-cues={stageCueDisplay === 'dim'}")
		const css = src('styles.css')
		expect(css).toMatch(/\.tp-stage-cue\s*\{[^}]*display:\s*none/)
		expect(css).toMatch(/\.tp-show-cues[^{]*\.tp-stage-cue\s*\{[^}]*opacity/)
	})

	test('read-aloud: the cleaner strips cues and the DOM path skips them', () => {
		expect(stripStageCues('Hello [pause] there')).toBe('Hello  there')
		const doc = cleanDocument('Hello there [pause] my friend.')
		expect(doc.allSentences.join(' ')).not.toContain('pause')
		expect(doc.allSentences.join(' ')).toContain('friend')
		expect(src('TeleprompterApp.svelte')).toContain('.tp-stage-cue')
		expect(src('TeleprompterApp.svelte')).toContain('spokenTextOf(el)')
	})

	test('read-aloud: a reference link keeps its words', () => {
		const doc = cleanDocument('Read [the guide][ref] today [pause] please.\n\n[ref]: https://example.com\n')
		const spoken = doc.allSentences.join(' ')
		expect(spoken).toContain('the guide')
		expect(spoken).not.toContain('pause')
		expect(spoken).not.toContain('[')
	})

	test('voice: no word inside a cue is counted', () => {
		const words = tokenize('[pause] word').filter(t => t.type === 'TOKEN').map(t => t.value)
		expect(words).toEqual(['word'])
		expect(UNTRACKED_TEXT_SELECTOR).toContain('.tp-stage-cue')
		expect(src('voice/voice-tracking-service.ts')).toContain('const skipSelectors = UNTRACKED_TEXT_SELECTOR')
	})
})
