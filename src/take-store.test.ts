import { describe, expect, test } from 'bun:test'
import { TakeStore, type TakeFileAdapter } from './take-store'
import { parseTakeLog, type TakeLogEntry } from './take-log'

/** An in-memory file with an optional delay, so concurrent writes can interleave if the store lets them. */
function memoryFile(initial: string | null = null, delayMs = 0) {
	let content = initial
	const wait = () => new Promise(resolve => setTimeout(resolve, delayMs))
	const adapter: TakeFileAdapter = {
		async exists() { await wait(); return content !== null },
		async read() { await wait(); if (content === null) throw new Error('missing'); return content },
		async write(_path, data) { await wait(); content = data },
	}
	return { adapter, text: () => content }
}

const entry = (section: string, minute: number): TakeLogEntry => ({
	notePath: 'Script.md',
	kind: 'section',
	section,
	durationSeconds: 60 + minute,
	targetSeconds: 60,
	date: new Date(Date.UTC(2026, 10, 26, 14, minute)).toISOString(),
})

describe('TakeStore', () => {
	test('creates the file on the first take and appends after it', async () => {
		const file = memoryFile()
		const store = new TakeStore(file.adapter, 'plugin/takes.json')
		expect(await store.load()).toEqual([])
		expect(await store.record(entry('A', 0))).toBe(true)
		expect(await store.record(entry('B', 1))).toBe(true)
		expect(parseTakeLog(file.text()).map(take => take.section)).toEqual(['A', 'B'])
	})

	test('takes recorded at the same moment are all kept: writes are queued, not raced', async () => {
		const file = memoryFile(null, 5)
		const store = new TakeStore(file.adapter, 'takes.json')
		await Promise.all([store.record(entry('A', 0)), store.record(entry('B', 1)), store.record(entry('C', 2))])
		expect(parseTakeLog(file.text()).map(take => take.section)).toEqual(['A', 'B', 'C'])
	})

	test('a duplicate is not written', async () => {
		const file = memoryFile()
		const store = new TakeStore(file.adapter, 'takes.json')
		await store.record(entry('A', 0))
		const before = file.text()
		expect(await store.record(entry('A', 0))).toBe(false)
		expect(file.text()).toBe(before)
	})

	test('a corrupt file reads as empty, and the next take starts a clean log', async () => {
		const file = memoryFile('{ not json')
		const store = new TakeStore(file.adapter, 'takes.json')
		expect(await store.load()).toEqual([])
		await store.record(entry('A', 0))
		expect(parseTakeLog(file.text()).length).toBe(1)
	})

	test('a failed write rejects for the caller and does not stop the queue', async () => {
		const file = memoryFile()
		let fail = true
		const adapter: TakeFileAdapter = {
			...file.adapter,
			async write(path, data) {
				if (fail) { fail = false; throw new Error('disk full') }
				await file.adapter.write(path, data)
			},
		}
		const store = new TakeStore(adapter, 'takes.json')
		let rejected = false
		await store.record(entry('A', 0)).catch(() => { rejected = true })
		expect(rejected).toBe(true)
		expect(await store.record(entry('B', 1))).toBe(true)
		expect(parseTakeLog(file.text()).map(take => take.section)).toEqual(['B'])
	})

	test('renaming a note moves its takes; nothing to move leaves the file alone', async () => {
		const file = memoryFile()
		const store = new TakeStore(file.adapter, 'takes.json')
		await store.record(entry('A', 0))
		expect(await store.renameNote('Script.md', 'Renamed.md')).toBe(true)
		expect(parseTakeLog(file.text())[0].notePath).toBe('Renamed.md')
		expect(await store.renameNote('Nope.md', 'Other.md')).toBe(false)
	})
})
