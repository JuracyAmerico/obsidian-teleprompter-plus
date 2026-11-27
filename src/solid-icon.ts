/**
 * The solid form of a Lucide symbol, the picture a toggle shows while it is on: its areas filled,
 * the strokes that sit inside an area cut out of it, every other stroke left as it is. One rule for
 * every surface: the Stream Deck generator applies it to the lucide-static drawing, the toolbar to
 * the drawing Obsidian renders, so a pinned pin is the same solid pin on the deck and in the toolbar.
 */

/** One element of a Lucide drawing: its tag and the attributes that place it. */
export interface IconPart {
	readonly tag: string
	readonly attrs: Readonly<Record<string, string>>
}

/** What the solid form does with a part: fill it, cut it out of the fill, or stroke it as before. */
export type PartRole = 'fill' | 'cut' | 'stroke'

interface Box { x0: number; y0: number; x1: number; y1: number }

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

/** Numbers a path command takes before it repeats (implicit repeats are the same command). */
const ARITY: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 }

export interface PathShape {
	/** End point of every segment, in absolute units. */
	points: Array<[number, number]>
	/** Encloses an area: it has a curve, or it is closed (a `z`, or its last segment ends where it began). */
	area: boolean
}

const corner = (x: number, y: number): string => `${+x.toFixed(2)},${+y.toFixed(2)}`

/** The end points of a path and whether it encloses an area (an open run of straight segments does not). */
export function pathShape(d: string): PathShape {
	const points: Array<[number, number]> = []
	let curved = false, closed = false
	let x = 0, y = 0, startX = 0, startY = 0
	let corners = new Set<string>()
	const commands = d.match(/[a-df-z][^a-df-z]*/gi) ?? []
	for (const chunk of commands) {
		const letter = chunk[0]
		const lower = letter.toLowerCase()
		const relative = letter === lower
		const arity = ARITY[lower]
		if (arity === undefined) throw new Error(`path command "${letter}" is not understood: ${d}`)
		if (lower === 'z') {
			closed = true
			x = startX; y = startY
			continue
		}
		if (!'mlhv'.includes(lower)) curved = true
		const nums = (chunk.slice(1).match(NUMBER) ?? []).map(Number)
		if (nums.length === 0 || nums.length % arity !== 0) throw new Error(`path command "${letter}" has ${nums.length} numbers: ${d}`)
		for (let i = 0; i < nums.length; i += arity) {
			const group = nums.slice(i, i + arity)
			if (lower === 'h') x = (relative ? x : 0) + group[0]
			else if (lower === 'v') y = (relative ? y : 0) + group[0]
			else {
				const ex = group[arity - 2], ey = group[arity - 1]
				x = (relative ? x : 0) + ex
				y = (relative ? y : 0) + ey
			}
			points.push([x, y])
			// A moveto's later pairs are linetos; only the first pair starts a subpath.
			if (lower === 'm' && i === 0) {
				startX = x; startY = y; corners = new Set([corner(x, y)])
				continue
			}
			corners.add(corner(x, y))
			// Back at the start after visiting two other points encloses an area, `z` or not (Obsidian's flip triangles).
			if (corners.size >= 3 && Math.abs(x - startX) < 0.01 && Math.abs(y - startY) < 0.01) closed = true
		}
	}
	return { points, area: curved || closed }
}

const num = (attrs: Readonly<Record<string, string>>, key: string): number => Number(attrs[key] ?? 0)

/** The part's end points (corners for a box shape) and whether it encloses an area. */
function geometry(part: IconPart): { points: Array<[number, number]>; area: boolean } {
	const a = part.attrs
	switch (part.tag) {
		case 'circle': {
			const cx = num(a, 'cx'), cy = num(a, 'cy'), r = num(a, 'r')
			return { points: [[cx - r, cy - r], [cx + r, cy + r]], area: true }
		}
		case 'ellipse': {
			const cx = num(a, 'cx'), cy = num(a, 'cy'), rx = num(a, 'rx'), ry = num(a, 'ry')
			return { points: [[cx - rx, cy - ry], [cx + rx, cy + ry]], area: true }
		}
		case 'rect': {
			const x = num(a, 'x'), y = num(a, 'y')
			return { points: [[x, y], [x + num(a, 'width'), y + num(a, 'height')]], area: true }
		}
		case 'line':
			return { points: [[num(a, 'x1'), num(a, 'y1')], [num(a, 'x2'), num(a, 'y2')]], area: false }
		case 'polygon':
		case 'polyline': {
			const n = (a.points?.match(NUMBER) ?? []).map(Number)
			const points: Array<[number, number]> = []
			for (let i = 0; i + 1 < n.length; i += 2) points.push([n[i], n[i + 1]])
			return { points, area: part.tag === 'polygon' }
		}
		case 'path':
			return pathShape(a.d ?? '')
		default:
			throw new Error(`icon part <${part.tag}> is not understood`)
	}
}

function box(points: ReadonlyArray<[number, number]>): Box {
	const xs = points.map(p => p[0]), ys = points.map(p => p[1])
	return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** How far a stroke may poke past an area's box and still count as inside it (round caps, rounding). */
const SLACK = 1

/**
 * The role of each part in the solid form. An area (a circle, rect, polygon, closed or curved path)
 * is filled. A stroke (a line, polyline or open straight path) whose every end lies inside an
 * area's box is cut out of that area (the bars of circle-pause, the folds of a map). Every other
 * stroke stays as it is (the needle of a pin, the steam over a cup).
 */
export function solidRoles(parts: readonly IconPart[]): PartRole[] {
	const shapes = parts.map(geometry)
	const areas = shapes.filter(s => s.area && s.points.length > 0).map(s => box(s.points))
	return shapes.map((s) => {
		if (s.area) return 'fill'
		const inside = areas.some(b => s.points.length > 0 && s.points.every(([px, py]) =>
			px >= b.x0 - SLACK && px <= b.x1 + SLACK && py >= b.y0 - SLACK && py <= b.y1 + SLACK))
		return inside ? 'cut' : 'stroke'
	})
}

/**
 * Turns a rendered icon (an `<svg>` whose children are the drawing, as Obsidian's setIcon makes
 * it) into its solid form, in place: areas take the icon colour, cut strokes take `cutColor`, the
 * colour behind the icon. Throws, leaving the icon unchanged, on an element it does not understand.
 */
export function solidifySvg(svg: Element, cutColor: string): void {
	const elements = Array.from(svg.children)
	const roles = solidRoles(elements.map(el => ({
		tag: el.tagName.toLowerCase(),
		attrs: Object.fromEntries(Array.from(el.attributes, a => [a.name, a.value])),
	})))
	elements.forEach((el, i) => {
		if (roles[i] === 'fill') el.setAttribute('fill', 'currentColor')
		else if (roles[i] === 'cut') el.setAttribute('style', `stroke: ${cutColor}`)
	})
}

/** The parts of an SVG fragment of self-closing elements, as lucide-static writes them. */
export function parseParts(inner: string): IconPart[] {
	const parts: IconPart[] = []
	const re = /<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*\/>/g
	let m: RegExpExecArray | null
	let consumed = ''
	while ((m = re.exec(inner))) {
		const attrs: Record<string, string> = {}
		for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2]
		parts.push({ tag: m[1], attrs })
		consumed += m[0]
	}
	if (consumed.replace(/\s+/g, '') !== inner.replace(/\s+/g, '')) throw new Error(`not a flat list of self-closing elements: ${inner}`)
	return parts
}
