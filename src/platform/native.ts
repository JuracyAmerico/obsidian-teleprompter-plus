/**
 * The one door to Node and Electron. On Obsidian mobile there is no Node: `require` returns
 * undefined for these names on iOS and may throw elsewhere, so a static import would stop the
 * whole plugin from loading. Every native module is fetched here, at the moment it is used,
 * and comes back null wherever it does not exist.
 */
import type * as ChildProcessModule from 'child_process'
import type * as FsModule from 'fs'
import type * as OsModule from 'os'
import type * as PathModule from 'path'

declare const require: undefined | ((name: string) => unknown)

export function nativeModule<T>(name: string): T | null {
	if (typeof require !== 'function') return null
	try {
		const loaded = require(name) as T | undefined
		return loaded ?? null
	} catch {
		return null
	}
}

/** True only where Node is really there, so desktop-only features can step aside without trying. */
export function hasNode(): boolean {
	return nativeModule<typeof FsModule>('fs') !== null
}

function required<T>(name: string): T {
	const loaded = nativeModule<T>(name)
	if (!loaded) throw new Error(`${name} is not available on this device`)
	return loaded
}

/** For code that only runs on the desktop: throws a clear error instead of a TypeError on mobile. */
export const childProcess = (): typeof ChildProcessModule => required('child_process')
export const fs = (): typeof FsModule => required('fs')
export const os = (): typeof OsModule => required('os')
export const path = (): typeof PathModule => required('path')
