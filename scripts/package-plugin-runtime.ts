import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPackagedPluginLayout } from '../src/plugin-package'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const layout = getPackagedPluginLayout(repoRoot)

for (const requiredFile of [layout.manifestSource, layout.mainSource, layout.stylesSource]) {
	if (!existsSync(requiredFile)) {
		throw new Error(`Required build artifact missing: ${requiredFile}`)
	}
}

for (const runtimeDep of layout.runtimeDependencies) {
	if (!existsSync(runtimeDep.sourceDir)) {
		throw new Error(`Runtime dependency missing: ${runtimeDep.sourceDir}`)
	}
}

rmSync(layout.pluginDir, { recursive: true, force: true })
mkdirSync(path.join(layout.pluginDir, 'node_modules'), { recursive: true })

cpSync(layout.manifestSource, path.join(layout.pluginDir, 'manifest.json'))
cpSync(layout.mainSource, path.join(layout.pluginDir, 'main.js'))
cpSync(layout.stylesSource, path.join(layout.pluginDir, 'styles.css'))

for (const runtimeDep of layout.runtimeDependencies) {
	cpSync(runtimeDep.sourceDir, runtimeDep.targetDir, { recursive: true })
}

console.log(`Packaged plugin at ${layout.pluginDir}`)
