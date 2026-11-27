import { describe, expect, test } from 'bun:test'
import { ensureWebSocketServerClass } from './websocket-server'
import { REMOTE_SERVER_MODULE_LOAD_ERROR_PREFIX } from './remote-server-errors'

describe('ensureWebSocketServerClass', () => {
	test('throws a startup error when the ws module cannot be loaded', () => {
		expect(() => ensureWebSocketServerClass(
			() => ({
				WebSocketServer: null,
				loaded: false,
				error: 'Could not load the bundled ws module: boom',
			}),
			() => ({ platform: 'test' }),
		)).toThrow(`${REMOTE_SERVER_MODULE_LOAD_ERROR_PREFIX}: Could not load the bundled ws module: boom`)
	})

	test('returns the constructor when the module loads', () => {
		class FakeServer {
			on(_event: string, _handler: (..._args: unknown[]) => void): void {}
			close(_callback?: () => void): void {}
		}

		expect(ensureWebSocketServerClass(
			() => ({
				WebSocketServer: FakeServer,
				loaded: true,
			}),
			() => ({ platform: 'test' }),
		)).toBe(FakeServer)
	})
})
