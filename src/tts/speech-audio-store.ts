/**
 * Persistent store for ElevenLabs sentence audio, in IndexedDB (desktop and the mobile app both
 * have it). It sits behind the engine's in-memory Map: a sentence read once is kept across engine
 * instances, floating-window opens, plugin reloads and voice changes, so the same script rehearsed
 * tomorrow costs no credits and no waiting.
 *
 * Two object stores: `meta` holds {key, size, lastUsed} so eviction can run without loading any
 * audio; `audio` holds {key, bytes}. When the total passes the cap the least recently used entries
 * go first. Every failure (no IndexedDB, quota, a damaged record) is a miss, never an error: the
 * engine falls back to the network, so the cache can only ever save work.
 */

export const DB_NAME = 'teleprompter-plus-speech-audio'
const DB_VERSION = 1
export const AUDIO = 'audio'
export const META = 'meta'

export const DEFAULT_AUDIO_CACHE_MB = 200
const BYTES_PER_MB = 1024 * 1024

/** What the engine needs from a persistent audio store. */
export interface SpeechAudioStore {
	/** The stored bytes, or null for a missing, damaged or unreadable entry. Never rejects. */
	get(key: string): Promise<ArrayBuffer | null>
	/** Keeps the bytes and evicts the least recently used past the cap. Never rejects. */
	put(key: string, bytes: ArrayBuffer): Promise<void>
	/** Removes every stored clip. Never rejects. */
	clear(): Promise<void>
	/** Sets the cap in bytes. Takes effect at the next put. */
	setMaxBytes(maxBytes: number): void
	/** Bytes and clips held right now; zeros when the store cannot be read. */
	usage(): Promise<{ bytes: number; entries: number }>
}

interface MetaRecord {
	key: string
	size: number
	lastUsed: number
}

interface AudioRecord {
	key: string
	bytes: unknown
}

export function megabytesToBytes(megabytes: number): number {
	if (!Number.isFinite(megabytes) || megabytes < 0) return DEFAULT_AUDIO_CACHE_MB * BYTES_PER_MB
	return Math.floor(megabytes * BYTES_PER_MB)
}

/** The request's result, typed by the caller: IndexedDB hands records back untyped. */
function requestResult<T>(request: IDBRequest): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result as T)
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
	})
}

function transactionDone(tx: IDBTransaction): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
		tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
	})
}

function isBytes(value: unknown): value is ArrayBuffer {
	// Not instanceof: a buffer can come from another realm than this window's.
	return typeof (value as { byteLength?: unknown } | null)?.byteLength === 'number'
		&& typeof (value as { slice?: unknown }).slice === 'function'
}

export class IndexedDbSpeechAudioStore implements SpeechAudioStore {
	private maxBytes: number
	private db: Promise<IDBDatabase | null> | null = null
	/** Operations run one after another: eviction reads totals that a parallel put would change. */
	private queue: Promise<unknown> = Promise.resolve()
	private clock = 0

	constructor(
		private readonly factory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB,
		maxMegabytes = DEFAULT_AUDIO_CACHE_MB,
		private readonly now: () => number = Date.now
	) {
		this.maxBytes = megabytesToBytes(maxMegabytes)
	}

	setMaxBytes(maxBytes: number): void {
		this.maxBytes = Number.isFinite(maxBytes) && maxBytes >= 0 ? Math.floor(maxBytes) : DEFAULT_AUDIO_CACHE_MB * BYTES_PER_MB
	}

	get(key: string): Promise<ArrayBuffer | null> {
		return this.enqueue(async () => {
			const db = await this.open()
			if (!db) return null
			const read = db.transaction([AUDIO, META], 'readonly')
			const done = transactionDone(read)
			const audioRequest = requestResult<AudioRecord | undefined>(read.objectStore(AUDIO).get(key))
			const metaRequest = requestResult<MetaRecord | undefined>(read.objectStore(META).get(key))
			const [audio, meta] = await Promise.all([audioRequest, metaRequest, done]).then(([a, m]) => [a, m] as const)
			if (!audio && !meta) return null
			if (!audio || !meta || !isBytes(audio.bytes) || audio.bytes.byteLength === 0 || audio.bytes.byteLength !== meta.size) {
				await this.remove(db, key)
				return null
			}
			// A read counts as use: what is rehearsed daily stays, what is left alone ages out.
			const write = db.transaction([META], 'readwrite')
			write.objectStore(META).put({ key, size: meta.size, lastUsed: this.tick() })
			await transactionDone(write)
			return audio.bytes
		}, null)
	}

	put(key: string, bytes: ArrayBuffer): Promise<void> {
		return this.enqueue(async () => {
			const db = await this.open()
			if (!db || !isBytes(bytes) || bytes.byteLength === 0) return
			if (bytes.byteLength > this.maxBytes) return
			const write = db.transaction([AUDIO, META], 'readwrite')
			write.objectStore(AUDIO).put({ key, bytes })
			write.objectStore(META).put({ key, size: bytes.byteLength, lastUsed: this.tick() })
			await transactionDone(write)
			await this.evict(db, key)
		}, undefined)
	}

	clear(): Promise<void> {
		return this.enqueue(async () => {
			const db = await this.open()
			if (!db) return
			const write = db.transaction([AUDIO, META], 'readwrite')
			write.objectStore(AUDIO).clear()
			write.objectStore(META).clear()
			await transactionDone(write)
		}, undefined)
	}

	usage(): Promise<{ bytes: number; entries: number }> {
		return this.enqueue(async () => {
			const db = await this.open()
			if (!db) return { bytes: 0, entries: 0 }
			const metas = await this.allMeta(db)
			return { bytes: metas.reduce((sum, m) => sum + m.size, 0), entries: metas.length }
		}, { bytes: 0, entries: 0 })
	}

	// ===== Private =====

	/** Strictly increasing, so two uses in the same millisecond still have an order. */
	private tick(): number {
		this.clock = Math.max(this.clock + 1, this.now())
		return this.clock
	}

	private enqueue<T>(job: () => Promise<T>, fallback: T): Promise<T> {
		const run = this.queue.then(job, job).catch((): T => fallback)
		this.queue = run
		return run
	}

	private open(): Promise<IDBDatabase | null> {
		if (!this.factory) return Promise.resolve(null)
		this.db ??= new Promise<IDBDatabase | null>((resolve) => {
			try {
				const request = this.factory!.open(DB_NAME, DB_VERSION)
				request.onupgradeneeded = () => {
					const db = request.result
					if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO, { keyPath: 'key' })
					if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
				}
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => resolve(null)
				request.onblocked = () => resolve(null)
			} catch {
				resolve(null)
			}
		})
		return this.db
	}

	private async allMeta(db: IDBDatabase): Promise<MetaRecord[]> {
		const read = db.transaction([META], 'readonly')
		const records = await requestResult<MetaRecord[]>(read.objectStore(META).getAll())
		return records.filter(m => m && typeof m.key === 'string' && Number.isFinite(m.size) && Number.isFinite(m.lastUsed))
	}

	private async remove(db: IDBDatabase, ...keys: string[]): Promise<void> {
		const write = db.transaction([AUDIO, META], 'readwrite')
		for (const key of keys) {
			write.objectStore(AUDIO).delete(key)
			write.objectStore(META).delete(key)
		}
		await transactionDone(write)
	}

	/** Drops the least recently used until the total fits. The entry just written goes last. */
	private async evict(db: IDBDatabase, justWritten: string): Promise<void> {
		const metas = await this.allMeta(db)
		let total = metas.reduce((sum, m) => sum + m.size, 0)
		if (total <= this.maxBytes) return
		const oldestFirst = metas
			.filter(m => m.key !== justWritten)
			.sort((a, b) => a.lastUsed - b.lastUsed)
		const doomed: string[] = []
		for (const meta of oldestFirst) {
			if (total <= this.maxBytes) break
			doomed.push(meta.key)
			total -= meta.size
		}
		if (doomed.length > 0) await this.remove(db, ...doomed)
	}
}

let shared: SpeechAudioStore | null = null

/**
 * The one store every engine instance shares, so a new engine finds what the last one saved.
 * Null where there is no IndexedDB at all: the engine then skips the store and its extra waiting.
 */
export function sharedSpeechAudioStore(): SpeechAudioStore | null {
	if (typeof indexedDB === 'undefined') return null
	shared ??= new IndexedDbSpeechAudioStore()
	return shared
}
