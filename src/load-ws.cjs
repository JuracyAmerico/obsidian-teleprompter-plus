// The `ws` package, bundled into main.js and evaluated only when the remote server starts.
//
// A CommonJS file on purpose: Vite's CommonJS plugin wraps every bundled CommonJS module in a
// function that runs on its first require, so `ws` and the Node modules it needs (http, net,
// crypto, zlib…) are not touched while the plugin loads, which keeps main.js loadable where
// those modules do not exist. vite.config.ts points `ws` at its Node entry and leaves the Node
// modules as runtime requires. An ES import of `ws` would run all of it when main.js loads.
module.exports = function loadBundledWs() {
	return require('ws')
}
