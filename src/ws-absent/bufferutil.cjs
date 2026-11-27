// Stands in for `bufferutil`, an optional native add-on of `ws` that is not bundled. `ws` requires
// it inside try/catch and uses its own JavaScript when the require throws, so this module throws.
// Without it the bundler put an empty object in its place, and on Obsidian's Node 24 (no
// http.websocketMask) every message of 32 bytes or more crashed the remote server.
// One file per add-on: a bundled module runs once, and a second require of the same file would
// get its empty exports instead of the throw.
throw new Error('bufferutil is not bundled; ws uses its JavaScript fallback')
