/**
 * Which vault files the teleprompter may show as a script. Anything else (an image, audio, video,
 * a canvas, an archive) is never read as text: on 2026-11-27 a .jpg in the active pane was read
 * with `vault.read` and its bytes filled the prompter.
 */

/** Read as text: Markdown and its relatives (Quarto, R Markdown, MDX), plain text and Fountain screenplays. */
const TEXT_SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set(['md', 'markdown', 'mdx', 'qmd', 'rmd', 'txt', 'text', 'fountain'])

/** True for a file read as text. A PDF is a script but not text: it goes through pdftotext. */
export function isTextScript(extension: string): boolean {
	return TEXT_SCRIPT_EXTENSIONS.has(extension.toLowerCase())
}

/** True for any file the teleprompter can show: a text script or a PDF. */
export function isScriptFile(file: { extension: string }): boolean {
	return isTextScript(file.extension) || file.extension.toLowerCase() === 'pdf'
}
