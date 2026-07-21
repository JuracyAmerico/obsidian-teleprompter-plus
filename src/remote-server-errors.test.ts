import { describe, expect, test } from 'bun:test'
import {
	REMOTE_SERVER_MODULE_LOAD_ERROR_PREFIX,
	describeRemoteServerStartFailure,
	isRemoteServerModuleLoadError,
} from './remote-server-errors'

describe('isRemoteServerModuleLoadError', () => {
	test('recognizes the loader-prefixed error', () => {
		expect(isRemoteServerModuleLoadError(new Error(`${REMOTE_SERVER_MODULE_LOAD_ERROR_PREFIX}: Could not load ws module`))).toBe(true)
	})

	test('ignores unrelated errors', () => {
		expect(isRemoteServerModuleLoadError(new Error('listen EADDRINUSE: address already in use 127.0.0.1:8765'))).toBe(false)
	})
})

describe('describeRemoteServerStartFailure', () => {
	test('explains port conflicts', () => {
		expect(describeRemoteServerStartFailure(new Error('listen EADDRINUSE: address already in use 127.0.0.1:8765'), 8765, '127.0.0.1'))
			.toBe('Port 8765 is already in use. Close the other app or choose a different port.')
	})

	test('explains stale or invalid host bindings', () => {
		expect(describeRemoteServerStartFailure(new Error('listen EADDRNOTAVAIL: address not available 192.168.1.77:8765'), 8765, '192.168.1.77'))
			.toBe('Host 192.168.1.77 is not available on this machine right now. Use 127.0.0.1 for local-only access or 0.0.0.0 for phone access on your LAN.')
	})

	test('explains missing websocket module loads', () => {
		expect(describeRemoteServerStartFailure(new Error(`${REMOTE_SERVER_MODULE_LOAD_ERROR_PREFIX}: Could not load ws module using any strategy`), 8765, '127.0.0.1'))
			.toBe('The remote server could not load its WebSocket module. Rebuild and redeploy the plugin so `ws` is available in the installed plugin folder.')
	})

	test('falls back to a concise generic message', () => {
		expect(describeRemoteServerStartFailure(new Error('boom'), 8765, '127.0.0.1'))
			.toBe('Failed to start remote server. Check Developer Console for the exact error.')
	})
})
