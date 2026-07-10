import path from 'node:path'

export const PACKAGED_PLUGIN_ROOT = ['build', 'obsidian-plugin'] as const
export const RUNTIME_DEPENDENCIES = ['ws'] as const
export const PLUGIN_ID = 'teleprompter-plus'

export interface RuntimeDependencyPaths {
	name: string
	sourceDir: string
	targetDir: string
}

export interface PackagedPluginLayout {
	pluginDir: string
	manifestSource: string
	mainSource: string
	stylesSource: string
	runtimeDependencies: RuntimeDependencyPaths[]
}

export function getPackagedPluginLayout(repoRoot: string, pluginId = PLUGIN_ID): PackagedPluginLayout {
	const pluginDir = path.join(repoRoot, ...PACKAGED_PLUGIN_ROOT, pluginId)

	return {
		pluginDir,
		manifestSource: path.join(repoRoot, 'manifest.json'),
		mainSource: path.join(repoRoot, 'dist', 'main.js'),
		stylesSource: path.join(repoRoot, 'dist', 'styles.css'),
		runtimeDependencies: RUNTIME_DEPENDENCIES.map((name) => ({
			name,
			sourceDir: path.join(repoRoot, 'node_modules', name),
			targetDir: path.join(pluginDir, 'node_modules', name),
		})),
	}
}
