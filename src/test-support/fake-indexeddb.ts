/**
 * A small in-memory IndexedDB for tests: just the surface the speech audio store uses
 * (open with an upgrade step, transactions over named stores, get / put / delete / clear / getAll
 * on keyPath stores). Records are structured-cloned in and out, as the real thing does, and every
 * callback fires on a later tick. `corrupt` and `peek` let a test reach behind the store.
 */

type Row = Record<string, unknown>

class FakeRequest<T> {
	result!: T
	error: Error | null = null
	onsuccess: (() => void) | null = null
	onerror: (() => void) | null = null
}

class FakeObjectStore {
	constructor(
		private readonly rows: Map<string, Row>,
		private readonly keyPath: string,
		private readonly tx: FakeTransaction
	) {}

	get(key: string): FakeRequest<Row | undefined> {
		return this.tx.run(() => {
			const row = this.rows.get(key)
			return row === undefined ? undefined : structuredClone(row)
		})
	}

	getAll(): FakeRequest<Row[]> {
		return this.tx.run(() => [...this.rows.values()].map(row => structuredClone(row)))
	}

	put(row: Row): FakeRequest<string> {
		return this.tx.run(() => {
			const key = row[this.keyPath] as string
			this.rows.set(key, structuredClone(row))
			return key
		})
	}

	delete(key: string): FakeRequest<undefined> {
		return this.tx.run(() => {
			this.rows.delete(key)
			return undefined
		})
	}

	clear(): FakeRequest<undefined> {
		return this.tx.run(() => {
			this.rows.clear()
			return undefined
		})
	}
}

class FakeTransaction {
	oncomplete: (() => void) | null = null
	onerror: (() => void) | null = null
	onabort: (() => void) | null = null
	error: Error | null = null
	private pending = 0

	constructor(private readonly db: FakeDatabase, private readonly names: string[]) {
		// A transaction with no request still completes.
		this.settleSoon()
	}

	objectStore(name: string): FakeObjectStore {
		if (!this.names.includes(name)) throw new Error(`store ${name} is not in this transaction`)
		const store = this.db.stores.get(name)
		if (!store) throw new Error(`no store ${name}`)
		return new FakeObjectStore(store.rows, store.keyPath, this)
	}

	run<T>(work: () => T): FakeRequest<T> {
		const request = new FakeRequest<T>()
		this.pending++
		setTimeout(() => {
			try {
				request.result = work()
				request.onsuccess?.()
			} catch (err) {
				request.error = err instanceof Error ? err : new Error(String(err))
				request.onerror?.()
			}
			this.pending--
			this.settleSoon()
		}, 0)
		return request
	}

	private settleSoon(): void {
		setTimeout(() => {
			if (this.pending === 0) this.oncomplete?.()
		}, 0)
	}
}

class FakeDatabase {
	stores = new Map<string, { rows: Map<string, Row>; keyPath: string }>()
	objectStoreNames = { contains: (name: string) => this.stores.has(name) }

	createObjectStore(name: string, options: { keyPath: string }): void {
		this.stores.set(name, { rows: new Map(), keyPath: options.keyPath })
	}

	transaction(names: string[], _mode: string): FakeTransaction {
		return new FakeTransaction(this, names)
	}
}

class FakeOpenRequest {
	result!: FakeDatabase
	error: Error | null = null
	onupgradeneeded: (() => void) | null = null
	onsuccess: (() => void) | null = null
	onerror: (() => void) | null = null
	onblocked: (() => void) | null = null
}

/** One browser profile's IndexedDB: databases outlive every connection opened on them. */
export class FakeIndexedDB {
	private databases = new Map<string, FakeDatabase>()
	/** Opens fail while this is set, as in a private window with storage blocked. */
	failOpen = false

	open(name: string, _version?: number): FakeOpenRequest {
		const request = new FakeOpenRequest()
		setTimeout(() => {
			if (this.failOpen) {
				request.error = new Error('storage blocked')
				request.onerror?.()
				return
			}
			let db = this.databases.get(name)
			const fresh = !db
			if (!db) {
				db = new FakeDatabase()
				this.databases.set(name, db)
			}
			request.result = db
			if (fresh) request.onupgradeneeded?.()
			request.onsuccess?.()
		}, 0)
		return request
	}

	/** The raw rows of one store, for assertions. */
	peek(database: string, store: string): Map<string, Row> {
		const rows = this.databases.get(database)?.stores.get(store)?.rows
		if (!rows) throw new Error(`no ${database}/${store}`)
		return rows
	}
}

export function fakeIndexedDbFactory(fake: FakeIndexedDB): IDBFactory {
	return fake as unknown as IDBFactory
}
