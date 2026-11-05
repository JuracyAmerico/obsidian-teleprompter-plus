/**
 * Release notes for the What's New dialog, read from CHANGELOG.md at build time.
 * The dialog used to carry a hand-written list that was never updated, so every release showed
 * the same old features under the new version number. Now CHANGELOG.md is the only place release
 * notes are written, and a test fails the release when the current version has no entry.
 */

/** How many notes the dialog shows, so "Get started" stays near the first screen. The changelog lists the best first. */
export const MAX_HIGHLIGHTS = 8

export interface ReleaseNote {
  icon: string
  title: string
  description: string
}

/** Obsidian's own Lucide icon names, so the dialog looks like the rest of the app. */
const SECTION_ICONS: Record<string, string> = {
  added: 'plus-circle',
  fixed: 'wrench',
  changed: 'refresh-cw',
  security: 'shield-check',
  removed: 'minus-circle',
  deprecated: 'alert-triangle',
}
const DEFAULT_ICON = 'dot'

/** The bullets of `## [version]` in a Keep-a-Changelog file, in order. Empty when missing. */
export function parseReleaseNotes(changelog: string, version: string): ReleaseNote[] {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
  if (start === -1) return []

  const notes: ReleaseNote[] = []
  let icon = DEFAULT_ICON
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break
    const heading = /^###\s+(.+)$/.exec(line)
    if (heading) {
      icon = SECTION_ICONS[heading[1].trim().toLowerCase()] ?? DEFAULT_ICON
      continue
    }
    const bullet = /^- (.+)$/.exec(line)
    if (!bullet) continue
    // The dialog shows plain text, so Markdown code marks would appear as raw backticks
    const text = bullet[1].trim().replace(/`/g, '')
    const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(text)
    if (bold) {
      notes.push({ icon, title: bold[1].replace(/[.:]\s*$/, ''), description: bold[2].trim() })
    } else {
      notes.push({ icon, title: '', description: text })
    }
  }
  return notes
}
