// Stands in for `utf-8-validate`, an optional native add-on of `ws` that is not bundled; see
// bufferutil.cjs beside it. `ws` uses Node's buffer.isUtf8 when present and its own JavaScript
// when this require throws.
throw new Error('utf-8-validate is not bundled; ws uses its JavaScript fallback')
