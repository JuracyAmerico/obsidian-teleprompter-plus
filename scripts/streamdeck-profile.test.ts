import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ACTION_ICONS, actionIcon } from '../src/action-icons'
import {
	ACTIONS, CHROME, COLS, EMPTY, ICON_DIR, LIST_DIR, PAGES, PROFILE_DOC, ROWS, UUID_PREFIX,
	actionListSvg, canonicalSvg, compareWithManifest, keyFor, layoutMarkdown, loadIconSet,
	lucideIconId, lucideInner, onStateSvg, pictures, placedKeys, pngSize, spliceDoc, stateIcons, writePluginOverlay,
} from './streamdeck-profile'

const catalog = readFileSync(path.resolve(import.meta.dir, '../docs/stream-deck-actions.md'), 'utf8')

/** `| **Key** | \`command\` | ...` rows of the action catalog, the list the deck docs test keeps true to the plugin. */
function catalogRows(): Map<string, string | null> {
	const rows = new Map<string, string | null>()
	for (const line of catalog.split('\n')) {
		const m = /^\| \*\*(.+?)\*\* \| (`[^`]+`|none[^|]*) \|/.exec(line)
		if (m) rows.set(m[1], m[2].startsWith('`') ? m[2].slice(1, -1) : null)
	}
	return rows
}

const set = loadIconSet()
const placedIds = PAGES.flatMap(p => placedKeys(p).map(k => k.id))

describe('XL layout', () => {
	test('each page is 4 rows of 8 keys', () => {
		for (const page of PAGES) {
			expect(page.grid.length).toBe(ROWS)
			for (const row of page.grid) {
				expect(row.length).toBe(COLS)
				for (const id of row) if (id !== EMPTY) expect(() => keyFor(id), id).not.toThrow()
			}
		}
	})

	test('places every action of the catalog exactly once, with the command the catalog gives it', () => {
		const rows = catalogRows()
		expect(rows.size).toBe(60)
		const placedActions = placedIds.map(keyFor).filter(k => k.kind === 'action')
		expect(placedActions.length).toBe(60)
		expect(new Set(placedActions.map(a => a.id)).size).toBe(60)
		for (const a of placedActions) {
			expect(rows.has(a.name), `${a.name} is not a key of docs/stream-deck-actions.md`).toBe(true)
			expect(a.command, a.name).toBe(rows.get(a.name) ?? null)
		}
		expect(new Set(placedActions.map(a => a.name))).toEqual(new Set(rows.keys()))
	})

	test('every defined action is on a page', () => {
		const placed = new Set(placedIds)
		expect(ACTIONS.filter(a => !placed.has(a.id)).map(a => a.id)).toEqual([])
	})

	test('every page carries the same chrome: Home R1 C1; Snagit, Region, Scrolling, Lights, ⌘ R4 C1-C5; page keys R4 C7-C8', () => {
		expect(PAGES.length).toBe(3)
		for (const page of PAGES) {
			const g = page.grid
			expect(g[0][0], `page ${page.number}`).toBe('home')
			expect(g[3].slice(0, 5), `page ${page.number}`).toEqual(['snagit', 'snagit-region', 'snagit-scroll', 'lights', 'km'])
			const last = page.number === PAGES.length
			expect(g[3][7], `page ${page.number}`).toBe(last ? 'page-first' : 'page-next')
			if (page.number > 1) expect(g[3][6], `page ${page.number}`).toBe('page-prev')
			for (const c of CHROME) {
				const want = c.id(page.number, PAGES.length)
				if (want) expect(g[c.row][c.col], `page ${page.number} R${c.row + 1} C${c.col + 1}`).toBe(want)
			}
		}
	})

	test('system keys sit only where the chrome puts them', () => {
		for (const page of PAGES) for (const { row, col, key } of placedKeys(page)) {
			if (key.kind !== 'system') continue
			const slot = CHROME.find(c => c.row === row && c.col === col)
			expect(slot?.id(page.number, PAGES.length), `page ${page.number} R${row + 1} C${col + 1}`).toBe(key.id)
		}
	})

	test('page 1 holds 25 actions; page 3 holds exactly the colour themes, the fonts and the key theme', () => {
		const actionsOn = (n: number) => placedKeys(PAGES[n - 1]).filter(k => k.key.kind === 'action').map(k => k.id)
		expect(actionsOn(1).length).toBe(25)
		const page3 = actionsOn(3).sort()
		const expected = ACTIONS.filter(a => a.id.startsWith('color-') || a.id.startsWith('font-') || a.id === 'cycletheme').map(a => a.id).sort()
		expect(page3).toEqual(expected)
	})

	test('page 1 keeps the approved positions of rows 1 to 3', () => {
		// Approved 2026-11-27; the Snagit round moved Float and Open note into row 3 (C4, C8).
		const approved = [
			['home', 'playpause', 'startcountdown', 'reset', 'previoussection', 'scrollup', 'speedup', 'fontsizeup'],
			['voicetoggle', 'clock', 'countdownincrease', 'togglenavigation', 'nextsection', 'scrolldown', 'speeddown', 'fontsizedown'],
			['obsrecord', 'obsstream', 'countdowndecrease', 'detachwindow', 'prevspeedpreset', 'cyclespeedpreset', 'nextspeedpreset', 'openactivefile'],
		]
		expect(PAGES[0].grid.slice(0, 3)).toEqual(approved)
	})

	test('up/down pairs share a column, up above down', () => {
		const pairs: Array<[string, string]> = [
			['previoussection', 'nextsection'], ['scrollup', 'scrolldown'], ['speedup', 'speeddown'],
			['fontsizeup', 'fontsizedown'], ['countdownincrease', 'countdowndecrease'],
			['lineheightincrease', 'lineheightdecrease'], ['letterspacingup', 'letterspacingdown'],
			['paddingverticalincrease', 'paddingverticaldecrease'], ['paddinghorizontalincrease', 'paddinghorizontaldecrease'],
			['opacityup', 'opacitydown'],
		]
		const at = (id: string): { page: number; row: number; col: number } => {
			for (const page of PAGES) for (let r = 0; r < ROWS; r++) {
				const c = page.grid[r].indexOf(id)
				if (c >= 0) return { page: page.number, row: r, col: c }
			}
			throw new Error(`${id} not placed`)
		}
		for (const [up, down] of pairs) {
			const u = at(up), d = at(down)
			expect(d.page, up).toBe(u.page)
			expect(d.col, up).toBe(u.col)
			expect(d.row, up).toBeGreaterThan(u.row)
		}
	})

	test('two-state keys have two pictures, live keys one', () => {
		for (const a of ACTIONS) {
			const n = stateIcons(a).length
			if (['playback', 'follows', 'flips', 'viewMode'].includes(a.state)) expect(n, a.id).toBe(2)
			else expect(n, a.id).toBe(1)
		}
	})
})

describe('one symbol per action, on the deck', () => {
	test('every key whose action is in src/action-icons.ts draws that Lucide symbol (and badge)', () => {
		let shared = 0
		for (const a of ACTIONS) {
			const icon = a.command ? actionIcon(a.command) : undefined
			if (!a.command || !icon) {
				expect(a.icon.startsWith('tp-l-'), a.id).toBe(false)
				continue
			}
			shared++
			expect(a.icon, a.id).toBe(lucideIconId(a.command))
			const drawn = set.icons.get(a.icon)
			expect(drawn, a.id).toBeDefined()
			const inner = drawn && 'inner' in drawn ? drawn.inner : ''
			expect(inner, `${a.id} draws ${icon.lucide}`).toContain(lucideInner(icon.lucide))
			if ('badge' in icon) expect(inner, `${a.id} badge ${icon.badge}`).toContain(lucideInner(icon.badge))
			if (a.state === 'playback' && 'on' in icon) {
				const on = set.icons.get(lucideIconId(a.command, true))
				expect(on && 'inner' in on ? on.inner : '', `${a.id} state 1`).toContain(lucideInner(icon.on))
			}
		}
		expect(shared, 'every entry of ACTION_ICONS is a deck key').toBe(Object.keys(ACTION_ICONS).length)
	})

	test('a shared symbol keeps the colour role of the family picture it replaced', () => {
		for (const a of ACTIONS) {
			if (!a.icon.startsWith('tp-l-')) continue
			expect(set.icons.get(a.icon)?.color, a.id).toBe(set.icons.get(a.familyIcon)?.color)
		}
	})
})

describe('the deck draws what Obsidian draws', () => {
	const asarFile = '/Applications/Obsidian.app/Contents/Resources/obsidian.asar'
	// Path data drawn in a different order or direction, same picture (checked 2026-11-27).
	const SAME_PICTURE = new Set(['fold-horizontal', 'unfold-horizontal', 'unfold-vertical'])
	// lucide-static rounds the flip triangles; what tells the two flips apart is the dashed axis, so compare the axis.
	const AXIS_ONLY = new Set(['flip-horizontal-2', 'flip-vertical-2'])
	const axis = (paths: string[]): string[] => paths.filter(p => /^M[\d.]+ [\d.]+[vVhH]-?[\d.]+$/.test(p))

	test.skipIf(!existsSync(asarFile))('every shared Lucide name matches Obsidian\'s bundled drawing', () => {
		const asar = readFileSync(asarFile, 'latin1')
		const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
		const obsidianPaths = (name: string): string[] | null => {
			let at = asar.indexOf(`"${name}":[[`)
			if (at < 0) at = new RegExp(`[,{]${name}:\\[\\[`).exec(asar)?.index ?? -1
			if (at < 0) return null
			const seg = asar.slice(at, asar.indexOf(']]', at) + 2)
			return [...seg.matchAll(/\[6,"([^"]+)"/g)].map(m => norm(m[1])).sort()
		}
		const names = new Set<string>()
		for (const icon of Object.values(ACTION_ICONS)) for (const n of [icon.lucide, 'on' in icon ? icon.on : undefined, 'badge' in icon ? icon.badge : undefined]) if (n) names.add(n)
		for (const name of names) {
			if (SAME_PICTURE.has(name)) continue
			const theirs = obsidianPaths(name)
			expect(theirs, `${name} in Obsidian's bundle`).not.toBeNull()
			const ours = [...lucideInner(name).matchAll(/ d="([^"]+)"/g)].map(m => norm(m[1])).sort()
			const [a, b] = AXIS_ONLY.has(name) ? [axis(ours), axis(theirs ?? [])] : [ours, theirs ?? []]
			if (AXIS_ONLY.has(name)) expect(a.length, `${name} axis`).toBe(4)
			expect(a, `${name}: the deck draws a different picture than the toolbar`).toEqual(b)
		}
	})
})

describe('icons', () => {
	test('every picture the layout uses is defined in icons-data.js', () => {
		for (const p of pictures()) expect(set.icons.has(p.replace(/@on$/, '')), p).toBe(true)
	})

	test('every icon has its master SVG, key PNGs at 72 and 144, and action-list PNGs at 20 and 40', () => {
		for (const id of set.icons.keys()) {
			const master = path.join(ICON_DIR, `${id}.svg`)
			expect(existsSync(master), master).toBe(true)
			expect(canonicalSvg(readFileSync(master, 'utf8')), `${id}.svg is stale; run bun run icons:streamdeck`).toBe(canonicalSvg(set.build(set.icons.get(id)!)))
			expect(pngSize(path.join(ICON_DIR, 'png-72', `${id}.png`))).toEqual({ width: 72, height: 72 })
			expect(pngSize(path.join(ICON_DIR, 'png-144', `${id}.png`))).toEqual({ width: 144, height: 144 })
			expect(pngSize(path.join(LIST_DIR, `${id}.png`))).toEqual({ width: 20, height: 20 })
			expect(pngSize(path.join(LIST_DIR, `${id}@2x.png`))).toEqual({ width: 40, height: 40 })
		}
	})

	test('lit pictures exist at both key sizes', () => {
		for (const p of pictures().filter(x => x.endsWith('@on'))) {
			const id = `${p.slice(0, -3)}-on`
			expect(pngSize(path.join(ICON_DIR, 'png-72', `${id}.png`))).toEqual({ width: 72, height: 72 })
			expect(pngSize(path.join(ICON_DIR, 'png-144', `${id}.png`))).toEqual({ width: 144, height: 144 })
		}
	})

	test('action-list icons are white on transparent: no other colour, no background', () => {
		for (const icon of set.icons.values()) {
			const svg = actionListSvg(icon)
			const colours = new Set((svg.match(/#[0-9a-f]{6}\b/gi) ?? []).map(c => c.toUpperCase()))
			expect([...colours], icon.id).toEqual(['#FFFFFF'])
			expect(svg.includes('<rect width="72" height="72"'), icon.id).toBe(false)
		}
	})

	test('the lit state keeps the glyph and adds the ring and the dot', () => {
		const eyeline = set.icons.get('tp-toggle-eyeline')!
		const lit = onStateSvg(set, eyeline)
		expect(lit).toContain('stroke="#7c6cf6"')
		expect(lit).toContain('fill="#4ade80"')
		expect(lit).not.toContain('fill="#16161c"/>')
		const glyph = set.build(eyeline).replace(/<rect width="72" height="72"[^>]*\/>/, '').replace('</svg>', '')
		expect(lit).toContain(glyph.slice(glyph.indexOf('<g')))
	})

	test('page previews exist', () => {
		for (const name of ['streamdeck-xl-page-1', 'streamdeck-xl-page-2', 'streamdeck-xl-states']) {
			expect(existsSync(path.join(ICON_DIR, 'profile', `${name}.png`)), name).toBe(true)
		}
	})
})

describe('docs/stream-deck-profile.md', () => {
	test('the layout block is the one the script generates', () => {
		const doc = readFileSync(PROFILE_DOC, 'utf8')
		expect(spliceDoc(doc, layoutMarkdown()), 'run bun run icons:streamdeck').toBe(doc)
	})
})

describe('deck plugin manifest', () => {
	function fakePlugin(): string {
		const dir = mkdtempSync(path.join(os.tmpdir(), 'tp-deck-plugin-'))
		const actions = ACTIONS.map(a => ({
			Name: a.name, UUID: UUID_PREFIX + a.id, Icon: `imgs/actions/${a.folder}/${a.folder}`,
			States: stateIcons(a).map(() => ({ Image: `imgs/actions/${a.folder}/key` })),
		}))
		writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ Actions: actions }))
		return dir
	}

	test('a manifest with the 60 actions matches; a missing or renamed one is reported', () => {
		const dir = fakePlugin()
		try {
			const file = path.join(dir, 'manifest.json')
			expect(compareWithManifest(file)).toEqual([])
			const m = JSON.parse(readFileSync(file, 'utf8'))
			m.Actions = m.Actions.filter((a: { UUID: string }) => a.UUID !== `${UUID_PREFIX}clock`)
			m.Actions[0].Name = 'Renamed'
			writeFileSync(file, JSON.stringify(m))
			const problems = compareWithManifest(file)
			expect(problems.some(p => p.includes('clock'))).toBe(true)
			expect(problems.some(p => p.includes('Renamed'))).toBe(true)
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('the overlay copies the art, repoints the manifest and leaves live pictures alone', () => {
		const dir = fakePlugin()
		try {
			writePluginOverlay(dir, null)
			const m = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
			const entry = (id: string) => m.Actions.find((a: { UUID: string }) => a.UUID === UUID_PREFIX + id)
			expect(entry('toggleeyeline').Icon).toBe('imgs/themes/tplus/list/eyeline')
			expect(entry('toggleeyeline').States.map((s: { Image: string }) => s.Image)).toEqual(['imgs/themes/tplus/eyeline', 'imgs/themes/tplus/eyeline-on'])
			expect(entry('playpause').States.map((s: { Image: string }) => s.Image)).toEqual(['imgs/themes/tplus/playpause', 'imgs/themes/tplus/playpause-on'])
			expect(entry('voicetoggle').States[0].Image).toBe('imgs/actions/voice-toggle/key')
			expect(entry('clock').States[0].Image).toBe('imgs/actions/clock/key')
			expect(m.Profiles).toBeUndefined()
			expect(pngSize(path.join(dir, 'imgs/themes/tplus/eyeline-on@2x.png'))).toEqual({ width: 144, height: 144 })
			expect(pngSize(path.join(dir, 'imgs/themes/tplus/list/refresh-pinned@2x.png'))).toEqual({ width: 40, height: 40 })
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('the Profiles entry needs the exported profile next to the manifest', () => {
		const dir = fakePlugin()
		try {
			const name = 'profiles/Teleprompter Plus, Stream Deck XL'
			expect(() => writePluginOverlay(dir, name)).toThrow(/does not exist/)
			mkdirSync(path.join(dir, 'profiles'))
			writeFileSync(path.join(dir, `${name}.streamDeckProfile`), 'exported by the app')
			writePluginOverlay(dir, name)
			const m = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
			expect(m.Profiles).toEqual([{ Name: name, DeviceType: 2, DontAutoSwitchWhenInstalled: true, Readonly: false, AutoInstall: true }])
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('the overlay refuses the copy installed inside the Stream Deck app', () => {
		const installed = path.join(os.homedir(), 'Library/Application Support/com.elgato.StreamDeck/Plugins/com.americo.obsidian-teleprompter.sdPlugin')
		expect(() => writePluginOverlay(installed, null)).toThrow(/installed copy/)
	})
})
