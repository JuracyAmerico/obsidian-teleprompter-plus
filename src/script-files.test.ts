import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isScriptFile, isTextScript } from './script-files'

/**
 * A non-markdown active file is never read as text (ISC-211). On 2026-11-27 the active pane held
 * a .jpg; loadActiveNote passed it to readScript, which sent everything but a PDF to vault.read,
 * and the image's bytes filled the prompter. The isImageFile guard only covered embeds.
 */
const app = readFileSync(join(import.meta.dir, 'TeleprompterApp.svelte'), 'utf8')

function functionBody(name: string): string {
	const start = app.search(new RegExp(`(async )?function ${name}\\(`))
	expect(start).toBeGreaterThan(-1)
	const rest = app.slice(start + 1)
	const end = rest.search(/\n {2}(async )?function /)
	return rest.slice(0, end)
}

describe('which files are scripts', () => {
	test('markdown and its relatives, plain text and Fountain are read as text, in any case', () => {
		for (const ext of ['md', 'MD', 'markdown', 'mdx', 'qmd', 'Rmd', 'txt', 'text', 'fountain']) {
			expect(isTextScript(ext), ext).toBe(true)
			expect(isScriptFile({ extension: ext }), ext).toBe(true)
		}
	})

	test('a PDF is a script but is never read as text', () => {
		expect(isScriptFile({ extension: 'pdf' })).toBe(true)
		expect(isScriptFile({ extension: 'PDF' })).toBe(true)
		expect(isTextScript('pdf')).toBe(false)
	})

	test('images, audio, video, canvases, bases and archives are not scripts', () => {
		for (const ext of ['jpg', 'jpeg', 'JPG', 'png', 'gif', 'webp', 'heic', 'svg', 'mp3', 'm4a', 'wav', 'mp4', 'mov', 'webm', 'canvas', 'base', 'zip', 'docx', '']) {
			expect(isScriptFile({ extension: ext }), ext).toBe(false)
			expect(isTextScript(ext), ext).toBe(false)
		}
	})
})

describe('no path reads a non-script file as text', () => {
	test('the active file is checked before it is read, and a non-script leaves the current script on screen', () => {
		const body = functionBody('loadActiveNote')
		const guard = body.indexOf('if (activeFile && !isScriptFile(activeFile)) {')
		expect(guard).toBeGreaterThan(-1)
		expect(guard).toBeLessThan(body.indexOf('saveNotePosition()'))
		expect(guard).toBeLessThan(body.indexOf('readScript(activeFile)'))
	})

	test('readScript itself refuses a file that is not a script', () => {
		const body = functionBody('readScript')
		expect(body.indexOf('if (!isScriptFile(file))')).toBeGreaterThan(-1)
		expect(body.indexOf('if (!isScriptFile(file))')).toBeLessThan(body.indexOf('app.vault.read(file)'))
	})

	test('a Stream Deck or floating open of a non-script is refused before readScript', () => {
		const body = functionBody('openFile')
		expect(body.indexOf('!isScriptFile(file as TFile)')).toBeGreaterThan(-1)
		expect(body.indexOf('!isScriptFile(file as TFile)')).toBeLessThan(body.indexOf('readScript(file as TFile)'))
	})

	test('the prompted note falls back to the active file only when that file is a script', () => {
		expect(functionBody('currentSourcePath')).toContain('isScriptFile(active)')
	})

	test('live refresh, the frontmatter target, the bibliography and embedded notes read only text scripts', () => {
		expect(functionBody('reloadPromptedNote')).toContain('if (!file || !isTextScript(file.extension)) return')
		expect(app).toContain('if (!sourceFile || !isTextScript(sourceFile.extension)) {')
		expect(app).toContain('if (!activeFile || !isTextScript(activeFile.extension)) return')
		expect(functionBody('processEmbeddedNotes')).toContain("if (file && 'extension' in file && isTextScript((file as TFile).extension)) {")
	})
})
