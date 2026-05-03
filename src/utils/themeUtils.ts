import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import type { CodeEditorHandle } from '../types/index.ts';
import manifest from '../../manifest.json' with { type: 'json' };
import { BUILTIN_THEMES } from '../types/index.ts';

let _themes: string[] = [];

export const getThemes = (): string[] => _themes;

/**
 * Resolves theme parameters for Monaco.
 * - For built-in themes (vs, vs-dark, etc.), returns only the sanitized theme name.
 * - For custom themes, fetches the theme JSON from the plugin folder and returns both
 *   the sanitized name and the JSON string in `themeData`.
 *
 * @param plugin
 * @param theme  - Theme identifier as configured in plugin settings.
 * @returns Object with:
 *          - `theme`: sanitized theme name ready for Monaco.
 *          - `themeData?`: JSON-stringified theme (only for custom themes)
 */
export const resolveThemeParams = async (
	plugin: CodeFilesPlugin,
	theme: string
): Promise<{ theme: string; themeData?: string }> => {
	const pluginBase = normalizePath(
		`${plugin.app.vault.configDir}/plugins/${manifest.id}`
	);
	const resolvedTheme =
		theme === 'default'
			? document.body.classList.contains('theme-dark')
				? 'vs-dark'
				: 'vs'
			: theme;
	// Sanitized theme name. Only alphanumeric and dashes allowed
	const safeThemeId = resolvedTheme.replace(/[^a-z0-9\-]/gi, '-');
	let themeData: string | undefined;
	if (!BUILTIN_THEMES.includes(theme)) {
		try {
			const themePath = normalizePath(`${pluginBase}/monaco-themes/${theme}.json`);
			const url = plugin.app.vault.adapter.getResourcePath(themePath);
			// Timestamp is appended to the URL by getResourcePath, but it doesn't affect the fetch since it's just a cache buster. The theme JSON is fetched and passed as a string to the iframe, which will parse it and register the theme with Monaco.
			themeData = JSON.stringify(await (await fetch(url)).json());
		} catch (e) {
			console.warn(`code-files: theme "${theme}" not found`, e);
		}
	}
	return { theme: safeThemeId, themeData };
};

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
	codeEditor: CodeEditorHandle | undefined
): () => void {
	const handler = async (): Promise<void> => {
		if (plugin.settings.theme === 'default') {
			const params = await resolveThemeParams(plugin, 'default');
			codeEditor?.send('change-theme', params);
		}
	};
	plugin.app.workspace.on('css-change', handler);
	return () => plugin.app.workspace.off('css-change', handler);
}
