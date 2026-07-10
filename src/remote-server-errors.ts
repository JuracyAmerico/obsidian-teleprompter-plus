export const REMOTE_SERVER_MODULE_LOAD_ERROR_PREFIX = 'REMOTE_SERVER_WS_UNAVAILABLE'

export function isRemoteServerModuleLoadError(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith(`${REMOTE_SERVER_MODULE_LOAD_ERROR_PREFIX}:`)
}

export function describeRemoteServerStartFailure(
	error: unknown,
	port: number,
	host: string,
): string {
	const message = error instanceof Error ? error.message : String(error)

	if (message.includes('EADDRINUSE')) {
		return `Port ${port} is already in use. Close the other app or choose a different port.`
	}

	if (message.includes('EADDRNOTAVAIL')) {
		return `Host ${host} is not available on this machine right now. Use 127.0.0.1 for local-only access or 0.0.0.0 for phone access on your LAN.`
	}

	if (message.includes('EACCES')) {
		return `Obsidian does not have permission to bind ${host}:${port}. Try a port above 1024 or check your firewall permissions.`
	}

	if (isRemoteServerModuleLoadError(error)) {
		return 'The remote server could not load its WebSocket module. Rebuild and redeploy the plugin so `ws` is available in the installed plugin folder.'
	}

	return 'Failed to start remote server. Check Developer Console for the exact error.'
}
