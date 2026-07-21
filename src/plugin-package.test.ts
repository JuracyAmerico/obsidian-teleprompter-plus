import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import {
	getPackagedPluginLayout,
	PACKAGED_PLUGIN_ROOT,
	PLUGIN_ID,
	RUNTIME_DEPENDENCIES,
} from './plugin-package'

describe('plugin packaging layout', () => {
	test('stages a self-contained Obsidian plugin folder', () => {
		const repoRoot = '/repo'
		const layout = getPackagedPluginLayout(repoRoot)

		expect(layout.pluginDir).toBe(path.join(repoRoot, ...PACKAGED_PLUGIN_ROOT, PLUGIN_ID))
		expect(layout.manifestSource).toBe(path.join(repoRoot, 'manifest.json'))
		expect(layout.mainSource).toBe(path.join(repoRoot, 'dist', 'main.js'))
		expect(layout.stylesSource).toBe(path.join(repoRoot, 'dist', 'styles.css'))
		expect(layout.runtimeDependencies.map((dep) => dep.name)).toEqual([...RUNTIME_DEPENDENCIES])
		expect(layout.runtimeDependencies[0]).toEqual({
			name: 'ws',
			sourceDir: path.join(repoRoot, 'node_modules', 'ws'),
			targetDir: path.join(repoRoot, ...PACKAGED_PLUGIN_ROOT, PLUGIN_ID, 'node_modules', 'ws'),
		})
	})
})
