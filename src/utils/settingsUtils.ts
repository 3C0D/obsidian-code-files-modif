/**
 * Settings persistence and editor config management.
 * Handles loading/saving plugin settings with deep merge for editorConfigs.
 * Provides parseEditorConfig (strips comments and trailing commas from JSONC)
 * and buildMergedConfig (cascades default → global → language → extension).
 */
import type CodeFilesPlugin from '../main.ts';
import {
	DEFAULT_SETTINGS,
	DEFAULT_EDITOR_CONFIG,
	DEFAULT_EXTENSION_CONFIG
} from '../types/variables.ts';
import { staticMap } from '../utils/getLanguage.ts';

/**
 * Parses JSONC (JSON with Comments) by stripping comments and trailing commas.
 *
 * This is an internal utility used by saveEditorConfig() and buildMergedConfig()
 * to validate and parse raw editor config strings from Monaco.
 *
 * Handles:
 * - Single-line comments (`// ...`)
 * - Multi-line block comments (`/* ... * /`)
 * - Trailing commas before closing brackets/braces
 *
 * @param str - Raw JSONC string (may contain comments and trailing commas)
 * @returns Parsed JavaScript object
 * @throws {SyntaxError} If the JSON is invalid after stripping comments
 *
 * @internal
 */
export function parseEditorConfig(str: string): unknown {
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
 * @param key - File extension WITHOUT the leading dot (e.g. 'ts', 'md'), or '*' for global config
 * @param value - The raw JSONC string from the editor (may contain comments and trailing commas)
 * @returns `true` if the JSON is valid and was saved, `false` if the JSON is invalid
 */
export function saveEditorConfig(
	plugin: CodeFilesPlugin,
	key: string,
	value: string
): boolean {
	const defaultForKey = key === '*' ? DEFAULT_EDITOR_CONFIG : DEFAULT_EXTENSION_CONFIG;
	try {
		parseEditorConfig(value);
		const previous = plugin.settings.editorConfigs[key];
		// Early exit if nothing changed (trimming both sides for accurate comparison)
		if (previous?.trim() === value.trim()) return false;
		// Delete global override if value matches default (comparing parsed objects)
		if (
			key === '*' &&
			JSON.stringify(parseEditorConfig(value)) ===
				JSON.stringify(parseEditorConfig(defaultForKey))
		) {
			if (!('*' in plugin.settings.editorConfigs)) return false;
			// Back to default: no need to persist
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
 * + language fallback + per-extension override) as a JSON string.
 *
 * This is the single source of truth for the
 * cascade: default → global → language → extension.
 *
 * Example: for `.clangformat` (ext='clangformat', language='yaml'):
 * 1. Start with global config (*)
 * 2. Apply yaml config if it exists (language fallback)
 * 3. Apply clangformat config if it exists (extension override)
 */
export function buildMergedConfig(plugin: CodeFilesPlugin, ext: string): string {
	let globalCfg: Record<string, unknown>;
	try {
		globalCfg = parseEditorConfig(
			plugin.settings.editorConfigs['*'] ?? DEFAULT_EDITOR_CONFIG
		) as Record<string, unknown>;
	} catch {
		// Fallback to default if persistent config is corrupted
		globalCfg = parseEditorConfig(DEFAULT_EDITOR_CONFIG) as Record<string, unknown>;
	}

	if (!ext) return JSON.stringify(globalCfg);

	// Get the Monaco language for this extension
	const language = staticMap[ext] ?? 'plaintext';

	// Apply language config as fallback (if extension maps to a different language)
	const languageCfg =
		language !== ext && language !== 'plaintext'
			? (parseEditorConfig(
					plugin.settings.editorConfigs[language] ?? '{}'
				) as Record<string, unknown>)
			: {};

	// Apply extension-specific config (highest priority)
	const extCfg = parseEditorConfig(
		plugin.settings.editorConfigs[ext] ?? '{}'
	) as Record<string, unknown>;

	return JSON.stringify({ ...globalCfg, ...languageCfg, ...extCfg });
}
