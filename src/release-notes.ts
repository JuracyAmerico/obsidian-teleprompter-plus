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

/** The notes the dialog shows: the first MAX_HIGHLIGHTS, but never fewer than every Security item. */
export function dialogHighlights<T extends { security: boolean }>(notes: T[]): T[] {
  const securityCount = notes.filter((note) => note.security).length
  return notes.slice(0, Math.max(MAX_HIGHLIGHTS, securityCount))
}

/** A note plus where it came from, for a dialog that spans several versions. */
export interface VersionedNote extends ReleaseNote {
  version: string
  security: boolean
}

/** The notes of the section starting at `lines[start]`, in order, each tagged with its `###` heading. */
function sectionNotes(lines: string[], start: number): Array<ReleaseNote & { security: boolean }> {
  const notes: Array<ReleaseNote & { security: boolean }> = []
  let icon = DEFAULT_ICON
  let security = false
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break
    const heading = /^###\s+(.+)$/.exec(line)
    if (heading) {
      const name = heading[1].trim().toLowerCase()
      icon = SECTION_ICONS[name] ?? DEFAULT_ICON
      security = name === 'security'
      continue
    }
    const bullet = /^- (.+)$/.exec(line)
    if (!bullet) continue
    // The dialog shows plain text, so Markdown code marks would appear as raw backticks
    const text = bullet[1].trim().replace(/`/g, '')
    const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(text)
    if (bold) {
      notes.push({ icon, security, title: bold[1].replace(/[.:]\s*$/, ''), description: bold[2].trim() })
    } else {
      notes.push({ icon, security, title: '', description: text })
    }
  }
  return notes
}

/** The bullets of `## [version]` in a Keep-a-Changelog file, in order. Empty when missing. */
export function parseReleaseNotes(changelog: string, version: string): ReleaseNote[] {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
  if (start === -1) return []
  return sectionNotes(lines, start).map(({ icon, title, description }) => ({ icon, title, description }))
}

/** `1.2.3` as numbers, or null when it is not a plain dotted number. */
function versionParts(version: string): number[] | null {
  if (!/^\d+(\.\d+)*$/.test(version)) return null
  return version.split('.').map(Number)
}

/** Negative when a is older than b, 0 when equal, positive when newer. Numeric, so 0.12.11 is newer than 0.12.9. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a) ?? []
  const right = versionParts(b) ?? []
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Every note a reader has not seen: the sections newer than `lastSeen` up to and including `current`,
 * newest version first, with the Security items of all of them ahead of everything else.
 * A first install (no `lastSeen`) or a `lastSeen` that is not older than `current` shows `current` alone.
 */
export function parseSkippedReleaseNotes(changelog: string, lastSeen: string | undefined, current: string): VersionedNote[] {
  const lines = changelog.split(/\r?\n/)
  const sections: Array<{ version: string; start: number }> = []
  lines.forEach((line, start) => {
    const match = /^## \[(\d+(?:\.\d+)*)\]/.exec(line)
    if (match) sections.push({ version: match[1], start })
  })

  const skipping = !!lastSeen && versionParts(lastSeen) !== null && compareVersions(lastSeen, current) < 0
  const wanted = sections
    .filter(({ version }) =>
      skipping ? compareVersions(version, lastSeen) > 0 && compareVersions(version, current) <= 0 : version === current
    )
    .sort((a, b) => compareVersions(b.version, a.version))

  const notes = wanted.flatMap(({ version, start }) =>
    sectionNotes(lines, start).map((note) => ({ ...note, version }))
  )
  return [...notes.filter((note) => note.security), ...notes.filter((note) => !note.security)]
}
