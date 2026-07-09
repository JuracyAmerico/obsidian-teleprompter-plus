/**
 * Regression suite for heading -> source-line mapping.
 *
 * Every test here corresponds to a bug that shipped. The plugin decodes a heading's
 * render-order ordinal into a file line in order to scroll the note's editor pane; three
 * separate defects made that land on the wrong line, or on no line at all.
 */
import { describe, expect, test } from 'bun:test'
import { marked } from 'marked'
import { createHeadingLineMapper, removeYAMLFrontmatter } from './heading-source-map'

/** Drive the mapper through marked exactly as TeleprompterApp does. */
function buildMap(content: string, processed = content): number[] {
	const mapper = createHeadingLineMapper(content)
	const map: number[] = []
	const renderer = new marked.Renderer()
	renderer.heading = function (token) {
		map.push(mapper.resolve(token.raw))
		return `<h${token.depth}>x</h${token.depth}>\n`
	}
	void marked.parse(processed, { renderer }) // sync here (no async extensions); we read via the renderer
	return map
}

function headingCount(md: string): number {
	let n = 0
	const renderer = new marked.Renderer()
	renderer.heading = function () {
		n++
		return ''
	}
	void marked.parse(md, { renderer })
	return n
}

/** The plugin's own arithmetic: ordinal -> 0-based line in the FILE. */
function sourceLineForHeader(map: number[], ordinal: number, yamlLineOffset: number): number {
	const contentLine = map[ordinal]
	if (contentLine === undefined || contentLine < 0) return -1
	return contentLine + yamlLineOffset
}

describe('removeYAMLFrontmatter', () => {
	test('linesRemoved is the line shift, not the split-part count', () => {
		// Regression: split('\n').length counted the empty string after the final newline,
		// so every consumer landed one line low.
		const { content, linesRemoved } = removeYAMLFrontmatter('---\ntitle: x\n---\n# H\n')
		expect(linesRemoved).toBe(3)
		expect(content).toBe('# H\n')
		expect(('---\ntitle: x\n---\n# H\n'.split('\n'))[0 + linesRemoved]).toBe('# H')
	})

	test('no frontmatter leaves content untouched with zero shift', () => {
		expect(removeYAMLFrontmatter('# Hi\n\nbody').linesRemoved).toBe(0)
	})

	test('unclosed frontmatter is not treated as frontmatter', () => {
		const r = removeYAMLFrontmatter('---\na: 1\nno close')
		expect(r.linesRemoved).toBe(0)
		expect(r.content).toBe('---\na: 1\nno close')
	})

	test('blank line after frontmatter still yields the correct shift', () => {
		const raw = '---\na: 1\n---\n\n## H\n'
		const { content, linesRemoved } = removeYAMLFrontmatter(raw)
		const contentLine = content.split('\n').findIndex((l) => l.startsWith('## H'))
		expect(raw.split('\n')[contentLine + linesRemoved]).toBe('## H')
	})
})

describe('createHeadingLineMapper', () => {
	test('emits one entry per heading marked actually renders', () => {
		const md = '# A\n\ntext\n\n## B\n\n### C\n'
		expect(buildMap(md).length).toBe(headingCount(md))
	})

	test('maps each heading to its own line', () => {
		expect(buildMap('# A\n\nbody\n\n## B\n')).toEqual([0, 4])
	})

	test('a heading at line 0 resolves to 0', () => {
		expect(buildMap('# First\n\nbody\n')[0]).toBe(0)
	})

	test('duplicate heading texts resolve in document order', () => {
		// Regression: a non-advancing search returned the first match for every duplicate.
		expect(buildMap('## Dup\na\n\n## Dup\nb\n')).toEqual([0, 3])
	})

	test('a # inside a fenced code block is not mistaken for the heading', () => {
		// Regression: the text search scanned raw content, including code fences.
		expect(buildMap('# Top\n\n```\n## Story\n```\n\n## Story\n')).toEqual([0, 6])
	})

	test('a # inside a 4-space indented code block is not mistaken for the heading', () => {
		// A real ATX heading allows at most 3 leading spaces.
		const map = buildMap('# Top\n\n    ## Story\n\n## Story\n')
		expect(map[map.length - 1]).toBe(4)
	})

	test('tilde fences are handled like backtick fences', () => {
		expect(buildMap('# Top\n\n~~~\n## Story\n~~~\n\n## Story\n')).toEqual([0, 6])
	})

	test('setext headings resolve to their text line, not their underline', () => {
		expect(buildMap('Title\n=====\n\nbody\n')).toEqual([0])
	})

	test('an unresolvable heading yields -1 and does not desync the headings after it', () => {
		// A strip pass can rewrite a heading (e.g. citation resolution), so its raw text is
		// absent from `content`. The cursor must not advance on a miss.
		const content = '# Kept\n\nbody\n\n## Later\n'
		const processed = '# Kept\n\n## Ghost Heading\n\n## Later\n'
		const map = buildMap(content, processed)
		expect(map[1]).toBe(-1)
		expect(map[2]).toBe(4)
	})

	test('headings sharing a prefix resolve to distinct lines', () => {
		const md = '## Story\nx\n\n## Story of a thing\ny\n'
		expect(buildMap(md)).toEqual([0, 3])
	})
})

describe('ordinal -> file line (the integer handed to the editor)', () => {
	const raw = '---\na: 1\n---\n# Intro\n\nbody\n\n## Deep\n\nmore\n'
	const { content, linesRemoved } = removeYAMLFrontmatter(raw)
	const map = buildMap(content)
	const fileLines = raw.split('\n')

	test('every ordinal lands on a line that is actually a heading in the file', () => {
		map.forEach((_, ordinal) => {
			const line = sourceLineForHeader(map, ordinal, linesRemoved)
			expect(line).toBeGreaterThanOrEqual(0)
			expect(fileLines[line]).toMatch(/^#{1,6} /)
		})
	})

	test('the frontmatter offset is applied, so content line != file line', () => {
		// Regression: the ordinal itself was used as the line number.
		expect(map[1]).toBe(4) // content coords
		expect(sourceLineForHeader(map, 1, linesRemoved)).toBe(7) // file coords
		expect(fileLines[7]).toBe('## Deep')
	})

	test('an out-of-range ordinal (embedded-note heading) returns -1, not a wrong line', () => {
		expect(sourceLineForHeader(map, 999, linesRemoved)).toBe(-1)
	})

	test('an unresolvable heading returns -1 rather than the offset alone', () => {
		expect(sourceLineForHeader([-1], 0, linesRemoved)).toBe(-1)
	})
})
