/**
 * Runtime stand-in for the `obsidian` module in unit tests. The real package ships only type
 * declarations, so any test that loads code importing a value from it must mock the module.
 * `mock.module` is process-wide in bun, so every test shares this one complete stub: a partial
 * mock in one file would break the import of another.
 */
class Stub {}

export const obsidianStub = {
	apiVersion: '1.0.0',
	Platform: { isMacOS: true },
	requestUrl: async () => ({}),
	addIcon: () => {},
	setIcon: () => {},
	sanitizeHTMLToDom: () => document,
	ItemView: Stub,
	MarkdownView: Stub,
	Modal: Stub,
	Notice: Stub,
	Plugin: Stub,
	PluginSettingTab: Stub,
	Setting: Stub,
	TFile: Stub,
	WorkspaceLeaf: Stub,
}
