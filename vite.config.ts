import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
    rollupOptions: {
      external: ['obsidian', 'ws', 'electron', 'fs', 'path', 'os', 'child_process', 'crypto'],
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
