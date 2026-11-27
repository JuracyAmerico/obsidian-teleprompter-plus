import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CONTROL_ICONS, type ActionIcon } from './action-icons'
import { parseParts, pathShape, solidRoles, solidifySvg, type IconPart } from './solid-icon'

const lucideDir = path.resolve(import.meta.dir, '../node_modules/lucide-static/icons')
const lucideParts = (name: string): IconPart[] =>
	parseParts(/<svg[^>]*>([\s\S]*?)<\/svg>/.exec(readFileSync(path.join(lucideDir, `${name}.svg`), 'utf8'))?.[1].trim() ?? '')
const roles = (name: string) => solidRoles(lucideParts(name))

describe('pathShape', () => {
	test('an open run of straight segments is no area, with absolute end points', () => {
		expect(pathShape('M12 17v5')).toEqual({ points: [[12, 17], [12, 22]], area: false })
		expect(pathShape('m16 15-3-3 3-3')).toEqual({ points: [[16, 15], [13, 12], [16, 9]], area: false })
	})

	test('an arc, a curve, a close or a return to the start makes an area', () => {
		expect(pathShape('M3 7V5a2 2 0 0 1 2-2h2').area).toBe(true)
		expect(pathShape('M2 2h4v4z').area).toBe(true)
		expect(pathShape('m3 7 5 5-5 5V7').area).toBe(true)
		expect(pathShape('M2 2C3 3 4 4 5 5').points).toEqual([[2, 2], [5, 5]])
	})

	test('a line drawn out and back is no area', () => {
		expect(pathShape('M2 2h4h-4').area).toBe(false)
	})

	test('a command it does not know, or a wrong count of numbers, is an error', () => {
		expect(() => pathShape('M2 2 B4 4')).toThrow('not understood')
		expect(() => pathShape('M2 2 L3')).toThrow('has 1 numbers')
	})
})

describe('solidRoles on the toggles drawn solid', () => {
	test('pin: the head is filled, the needle below it stays a stroke', () => {
		expect(roles('pin')).toEqual(['stroke', 'fill'])
	})

	test('coffee: the cup is filled, the steam above it stays', () => {
		expect(roles('coffee')).toEqual(['stroke', 'stroke', 'fill', 'stroke'])
	})

	test('circle-pause: the disc is filled, the bars are cut out of it', () => {
		expect(roles('circle-pause')).toEqual(['fill', 'cut', 'cut'])
	})

	test('map: the sheet is filled, the folds are cut out of it', () => {
		expect(roles('map')).toEqual(['fill', 'cut', 'cut'])
	})

	test('flips: the triangles are filled, the dashed axis between them stays', () => {
		for (const name of ['flip-horizontal-2', 'flip-vertical-2']) {
			expect(roles(name).filter(r => r === 'fill').length, name).toBe(2)
			expect(roles(name).filter(r => r === 'stroke').length, name).toBe(4)
		}
	})

	test('every control drawn solid has something to fill', () => {
		for (const [key, icon] of Object.entries(CONTROL_ICONS as Record<string, ActionIcon>)) {
			if (!icon.onSolid || !icon.on) continue
			expect(roles(icon.on), key).toContain('fill')
		}
	})

	test('an element it does not know is an error, not a silent outline', () => {
		expect(() => solidRoles([{ tag: 'g', attrs: {} }])).toThrow('<g>')
	})
})

describe('parseParts', () => {
	test('reads self-closing elements and their attributes', () => {
		expect(parseParts('<circle cx="12" cy="12" r="10" /> <line x1="10" x2="10" y1="15" y2="9" />')).toEqual([
			{ tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
			{ tag: 'line', attrs: { x1: '10', x2: '10', y1: '15', y2: '9' } },
		])
	})

	test('refuses markup that is not a flat list of elements', () => {
		expect(() => parseParts('<g><path d="M1 1h2"/></g>')).toThrow('flat list')
	})
})

/** The few DOM calls solidifySvg makes, over plain objects. */
function fakeSvg(parts: IconPart[]) {
	const children = parts.map(p => {
		const attrs = new Map(Object.entries(p.attrs))
		return {
			tagName: p.tag.toUpperCase(),
			get attributes() { return [...attrs].map(([name, value]) => ({ name, value })) },
			setAttribute(name: string, value: string) { attrs.set(name, value) },
			attrs,
		}
	})
	return { svg: { children } as unknown as Element, children }
}

describe('solidifySvg (the toolbar)', () => {
	test('fills areas with the icon colour and cuts inner strokes in the given colour', () => {
		const { svg, children } = fakeSvg(lucideParts('circle-pause'))
		solidifySvg(svg, 'var(--interactive-accent)')
		expect(children[0].attrs.get('fill')).toBe('currentColor')
		expect(children[1].attrs.get('style')).toBe('stroke: var(--interactive-accent)')
		expect(children[2].attrs.get('style')).toBe('stroke: var(--interactive-accent)')
	})

	test('leaves a plain stroke alone', () => {
		const { svg, children } = fakeSvg(lucideParts('pin'))
		solidifySvg(svg, 'red')
		expect(children[0].attrs.has('fill')).toBe(false)
		expect(children[0].attrs.has('style')).toBe(false)
		expect(children[1].attrs.get('fill')).toBe('currentColor')
	})
})

describe('the toolbar solidifies what Obsidian draws', () => {
	const asarFile = '/Applications/Obsidian.app/Contents/Resources/obsidian.asar'

	/** Obsidian's bundled Lucide, element by element: [6,d] path, [1,cx,cy,r] circle, [0,x1,y1,x2,y2] line, [5,x,y,w,h,rx] rect. */
	function obsidianParts(asar: string, name: string): IconPart[] | null {
		let at = asar.indexOf(`"${name}":[[`)
		if (at < 0) at = new RegExp(`[,{]${name}:\\[\\[`).exec(asar)?.index ?? -1
		if (at < 0) return null
		const seg = asar.slice(asar.indexOf('[[', at) + 1, asar.indexOf(']]', at) + 1)
		return [...seg.matchAll(/\[(\d),([^\]]*)\]/g)].map(([, kind, body]): IconPart => {
			const v = body.split(',').map(s => s.replace(/"/g, ''))
			switch (kind) {
				case '6': return { tag: 'path', attrs: { d: v.join(',') } }
				case '1': return { tag: 'circle', attrs: { cx: v[0], cy: v[1], r: v[2] } }
				case '0': return { tag: 'line', attrs: { x1: v[0], y1: v[1], x2: v[2], y2: v[3] } }
				case '5': return { tag: 'rect', attrs: { x: v[0], y: v[1], width: v[2], height: v[3], rx: v[4] ?? '0' } }
				default: throw new Error(`${name}: Obsidian element kind ${kind} not read by this test`)
			}
		})
	}

	test.skipIf(!existsSync(asarFile))('every solid "on" symbol gets the same roles from Obsidian\'s drawing as from lucide-static', () => {
		const asar = readFileSync(asarFile, 'latin1')
		// Obsidian draws flip-horizontal-2 the way lucide-static draws flip-vertical-2 (scripts/streamdeck-profile.ts).
		const SWAPPED: Record<string, string> = { 'flip-horizontal-2': 'flip-vertical-2', 'flip-vertical-2': 'flip-horizontal-2' }
		for (const icon of Object.values(CONTROL_ICONS as Record<string, ActionIcon>)) {
			if (!icon.onSolid || !icon.on) continue
			const theirs = obsidianParts(asar, icon.on)
			expect(theirs, `${icon.on} in Obsidian's bundle`).not.toBeNull()
			const count = (r: string[]) => ({ fill: r.filter(x => x === 'fill').length, cut: r.filter(x => x === 'cut').length })
			expect(count(solidRoles(theirs ?? [])), icon.on).toEqual(count(roles(SWAPPED[icon.on] ?? icon.on)))
		}
	})
})
