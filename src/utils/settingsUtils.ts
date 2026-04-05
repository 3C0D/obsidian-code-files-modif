import type CodeFilesPlugin from '../main.ts';
import { DEFAULT_SETTINGS, DEFAULT_EDITOR_CONFIG } from '../types.ts';

/**
 * Merges persisted data on top of DEFAULT_SETTINGS.
 * `editorConfigs` needs a manual deep merge: a plain spread would overwrite the entire object,
 * losing `DEFAULT_EDITOR_CONFIG['*']` if the saved data has no `'*'` key.
 */
export async function loadSettings(plugin: CodeFilesPlugin): Promise<void> {
	const loaded = await plugin.loadData();
	plugin.settings = {
		...DEFAULT_SETTINGS,
		...loaded,
		editorConfigs: {
			'*': DEFAULT_EDITOR_CONFIG,
			...(loaded?.editorConfigs ?? {})
		}
	};
	if (!plugin.settings.extraExtensions) {
		plugin.settings.extraExtensions = [];
	}
}

export async function saveSettings(plugin: CodeFilesPlugin): Promise<void> {
	await plugin.saveData(plugin.settings);
}
