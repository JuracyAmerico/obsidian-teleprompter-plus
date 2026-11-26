/**
 * Reads and writes the take log file (see take-log.ts for what is in it).
 *
 * Every change is a read-modify-write of one small file, queued one after another, so two takes
 * finishing together (two windows, or a section and the whole script at the same instant) cannot
 * overwrite each other. A failed write is reported to the caller and never breaks a rehearsal.
 */

import { appendTake, parseTakeLog, renameTakeNote, serializeTakeLog, type TakeLogEntry } from './take-log'

/** The part of Obsidian's DataAdapter the store uses: vault-relative paths, text files. */
export interface TakeFileAdapter {
	exists(path: string): Promise<boolean>
	read(path: string): Promise<string>
	write(path: string, data: string): Promise<void>
}

export class TakeStore {
	private queue: Promise<unknown> = Promise.resolve()

	constructor(
		private readonly adapter: TakeFileAdapter,
		private readonly path: string,
	) {}

	/** Every readable take; an absent or unreadable file is an empty log. */
	async load(): Promise<TakeLogEntry[]> {
		try {
			if (!(await this.adapter.exists(this.path))) return []
			return parseTakeLog(await this.adapter.read(this.path))
		} catch {
			return []
		}
	}

	/** Append one take. Resolves true when it was written, false for a duplicate. Rejects when the write fails. */
	record(entry: TakeLogEntry): Promise<boolean> {
		return this.enqueue(async () => {
			const before = await this.load()
			const after = appendTake(before, entry)
			if (after.length === before.length && after.every((item, i) => item === before[i])) return false
			await this.adapter.write(this.path, serializeTakeLog(after))
			return true
		})
	}

	/** Takes follow their note to its new path. Resolves true when the file changed. */
	renameNote(oldPath: string, newPath: string): Promise<boolean> {
		return this.enqueue(async () => {
			const renamed = renameTakeNote(await this.load(), oldPath, newPath)
			if (!renamed) return false
			await this.adapter.write(this.path, serializeTakeLog(renamed))
			return true
		})
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task)
		// The queue goes on after a failure; the caller still sees it.
		this.queue = run.catch(() => undefined)
		return run
	}
}
