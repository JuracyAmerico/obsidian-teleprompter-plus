import type * as Ws from 'ws'

/** The bundled `ws` package, required on first call; see load-ws.cjs. */
declare function loadBundledWs(): typeof Ws
export = loadBundledWs
