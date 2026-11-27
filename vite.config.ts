import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { builtinModules } from 'node:module'
import path from 'path'

/**
 * Node's own modules stay runtime requires: Obsidian's desktop app provides them, the phone has none.
 * `ws` (the remote server) is bundled and reaches them only when the server starts (src/load-ws.cjs).
 */
// Bun's builtinModules also lists its own modules and its built-in `ws` and `undici`; this config
// must give the same list under Node (`vite build`) and Bun (`bun test` imports it).
const NOT_NODE = new Set(['ws', 'undici'])
const nodeOwn = builtinModules.filter((name) => !name.startsWith('bun') && !NOT_NODE.has(name.replace(/^node:/, '')))
export const NODE_BUILTINS = [...new Set([...nodeOwn, ...nodeOwn.map((name) => (name.startsWith('node:') ? name : `node:${name}`))])]

/**
 * `ws` is bundled into main.js, from its Node entry. Its package.json sends a browser build to a
 * browser-flavoured bundler like Vite, a stub that throws "ws does not work in the browser", so the
 * alias names index.js. The release ships only main.js, styles.css and manifest.json, so a `ws`
 * left external is missing on every directory install and the remote server never starts.
 */
export const WS_NODE_ENTRY = path.resolve(__dirname, 'node_modules/ws/index.js')

/** The optional native add-ons `ws` tries inside try/catch; each resolves to its own module that throws. */
export const WS_OPTIONAL_ADDONS = ['bufferutil', 'utf-8-validate'] as const
export const wsAbsentStub = (name: string): string => path.resolve(__dirname, 'src/ws-absent', `${name}.cjs`)

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: /^ws$/, replacement: WS_NODE_ENTRY },
      ...WS_OPTIONAL_ADDONS.map((name) => ({ find: new RegExp(`^${name}$`), replacement: wsAbsentStub(name) })),
    ],
  },
  // Test-only phone diagnostics (src/platform/phone-log.ts); off in every normal build
  define: {
    __TP_PHONE_LOG__: JSON.stringify(process.env.TP_PHONE_LOG === '1'),
  },
  esbuild: {
    pure: ['console.log'],
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, './src/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    commonjsOptions: {
      // Vite's default (/node_modules/) plus the source files written in CommonJS.
      include: [/node_modules/, /src[\\/]load-ws\.cjs$/, /src[\\/]ws-absent[\\/][\w-]+\.cjs$/],
      // Every bundled CommonJS module runs on its first require, not when main.js loads.
      strictRequires: true,
      // Node modules required inside bundled CommonJS stay plain require calls in place, so they
      // run lazily with the module that needs them instead of being hoisted to the top of main.js.
      ignore: NODE_BUILTINS,
    },
    rollupOptions: {
      external: ['obsidian', 'electron', ...NODE_BUILTINS],
      output: {
        globals: {
          obsidian: 'obsidian',
        },
        assetFileNames: 'styles.css',
        // Inline everything into single main.js for Obsidian compatibility
        inlineDynamicImports: true,
      },
    },
    outDir: 'dist',
    emptyOutDir: false,
    // An inline map doubles main.js (about 8 MB) and every phone downloads it; set TP_SOURCEMAP=1 to debug.
    sourcemap: process.env.TP_SOURCEMAP ? 'inline' : false,
  },
})
