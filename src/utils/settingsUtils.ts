/**
 * Settings persistence and editor config management.
 * Handles loading/saving plugin settings with deep merge for editorConfigs.
 * Provides parseEditorConfig (strips comments and trailing commas from JSONC)
 * and buildMergedConfig (cascades default → global → per-extension).
 */
import type CodeFilesPlugin from '../main.ts';
import {
	DEFAULT_SETTINGS,
	DEFAULT_EDITOR_CONFIG,
	DEFAULT_EXTENSION_CONFIG
} from '../types/types.ts';

/**
 * Parses a JSON string that may contain JavaScript-style comments and trailing commas.
 *
 * Handles:
 * - Single-line comments (`// ...`)
 * - Multi-line block comments (`/* ... * /`)
 * - Trailing commas before closing brackets/braces
 */
function parseEditorConfig(str: string): unknown {
	return JSON.parse(
		str
			.replace(/\/\/[^\n]*/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/,(\s*[}\]])/g, '$1')
	);
}

/**
 * Merges persisted data on top of DEFAULT_SETTINGS.
 * `editorConfigs` needs a manual deep merge:
 * a plain spread would overwrite the entire object,
 * losing `DEFAULT_EDITOR_CONFIG['*']` if the saved
 * data has no `'*'` key.
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
}

export async function saveSettings(plugin: CodeFilesPlugin): Promise<void> {
	await plugin.saveData(plugin.settings);
}

/**
 * Saves a raw editor config string for the given key.
 * Deletes the override if it matches the default for that key.
 * 
 * @param plugin - The plugin instance
 * @param key - `'*'` for the global config, or a file extension (e.g. `'ts'`, `'md'`) for a per-extension override
 * @param value - The raw JSONC string from the editor (may contain comments and trailing commas)
 * @returns `true` if the JSON is valid and was saved, `false` if the JSON is invalid
 */
export function applyEditorConfig(
	plugin: CodeFilesPlugin,
	key: string,
	value: string
): boolean {
	const defaultForKey = key === '*' ? DEFAULT_EDITOR_CONFIG : DEFAULT_EXTENSION_CONFIG;
	try {
		parseEditorConfig(value);
		const previous = plugin.settings.editorConfigs[key];
		// Early exit if nothing changed
		if (previous?.trim() === value) return false;
		// Delete override if value matches default
		if (key !== '*' && value === defaultForKey.trim()) {
			if (!(key in plugin.settings.editorConfigs)) return false;
			// Back to default: no need to persist, buildMergedConfig falls back to DEFAULT_EXTENSION_CONFIG
			delete plugin.settings.editorConfigs[key];
			return true;
		}
		// Changed and non-default: persist and let the caller broadcast
		plugin.settings.editorConfigs[key] = value;
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns the merged editor config (global `*`
 * + per-extension override) as a JSON string.
 *
 * This is the single source of truth for the
 * cascade: default → global → extension.
 */
export function buildMergedConfig(plugin: CodeFilesPlugin, ext: string): string {
	const globalCfg = parseEditorConfig(
		plugin.settings.editorConfigs['*'] ?? DEFAULT_EDITOR_CONFIG
	) as Record<string, unknown>;
	const extCfg = ext
		? (parseEditorConfig(plugin.settings.editorConfigs[ext] ?? '{}') as Record<
				string,
				unknown
			>)
		: {};
	return JSON.stringify({ ...globalCfg, ...extCfg });
}
