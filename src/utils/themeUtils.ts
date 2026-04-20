import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { resolveThemeParams } from '../editor/mountCodeEditor.ts';
import type { CodeEditorInstance } from '../types/types.ts';

let _themes: string[] = [];

export const getThemes = (): string[] => _themes;

/**
 * Loads available Monaco themes from the plugin's bundled theme list.
 * Populates the internal `_themes` array with theme names on first call.
 *
 * @param plugin
 * @returns A Promise that resolves when themes have been loaded (or failed).
 */
export async function loadThemes(plugin: CodeFilesPlugin): Promise<void> {
	if (_themes.length > 0) return;
	try {
		const pluginBase = normalizePath(
			`${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`
		);
		const themelistPath = normalizePath(`${pluginBase}/monaco-themes/themelist.json`);
		const themelistUrl = plugin.app.vault.adapter.getResourcePath(themelistPath);
		const themelist = await (await fetch(themelistUrl)).json();
		_themes = Object.values(themelist);
	} catch (e) {
		console.warn('code-files: failed to load themelist', e);
		_themes = [];
	}
}

/** Registers a listener that updates Monaco's theme when Obsidian switches dark/light mode.
 *  Only active when theme is set to 'default'. Returns a cleanup function to unregister.
 *
 * @param plugin
 * @param codeEditor
 * @returns () => void - function to unregister the event listener
 * */
export function registerThemeChangeHandler(
	plugin: CodeFilesPlugin,
	codeEditor: CodeEditorInstance
): () => void {
	const handler = async (): Promise<void> => {
		if (plugin.settings.theme === 'default') {
			const params = await resolveThemeParams(plugin, 'default');
			codeEditor.send('change-theme', params);
		}
	};
	plugin.app.workspace.on('css-change', handler);
	return () => plugin.app.workspace.off('css-change', handler);
}
