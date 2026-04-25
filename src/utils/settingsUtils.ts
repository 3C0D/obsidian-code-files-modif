/**
 * Settings persistence and editor config management.
 * Handles loading/saving plugin settings with deep merge for editorConfigs.
 * Provides parseEditorConfig (strips comments and trailing commas from JSONC)
 * and buildMergedConfig (cascades default → global → language → extension).
 */
import type CodeFilesPlugin from '../main.ts';
import { DEFAULT_SETTINGS, DEFAULT_EDITOR_CONFIG } from '../types/variables.ts';
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
 * @internal - has a JS duplicate injected into the Monaco iframe (mountCodeEditor.ts).
 * Keep both in sync if regex patterns change.
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
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the settings are loaded.
 * @internal
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

/**
 * Saves the current settings to disk.
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the settings are saved.
 * @internal
 */
export async function saveSettings(plugin: CodeFilesPlugin): Promise<void> {
	await plugin.saveData(plugin.settings);
}

/**
 * Saves a raw editor config string for the given key.
 *
 * @param plugin - The plugin instance.
 * @param key - File extension WITHOUT the leading dot (e.g. 'ts', 'md'), or '*' for global config
 * @param value - The raw JSONC string from the editor (may contain comments and trailing commas)
 * @returns `true` if the JSON is valid and was saved, `false` if the JSON is invalid
 */
export function saveEditorConfig(
	plugin: CodeFilesPlugin,
	key: string,
	value: string
): boolean {
	try {
		// Validate only — throws if JSON is invalid, value is stored as-is with its comments
		parseEditorConfig(value);

		const previous = plugin.settings.editorConfigs[key];
		// Early exit if nothing changed (comparing raw strings including comments)
		if (previous?.trim() === value.trim()) return false;

		// Persist as-is (with comments) and let the caller broadcast
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
 * Internally parses JSONC strings into objects (stripping comments) to merge them,
 * then re-serializes to a clean JSON string ready for postMessage consumption.
 *
 * Example: for `.clangformat` (ext='clangformat', language='yaml'):
 * 1. Start with global config (*)
 * 2. Apply yaml config if it exists (language fallback)
 * 3. Apply clangformat config if it exists (extension override)
 *
 * @param plugin - The plugin instance.
 * @param ext - The file extension (e.g. 'ts', 'md'), or '*' for global config
 * @returns The merged JSON string.
 */
export function buildMergedConfig(plugin: CodeFilesPlugin, ext: string): string {
	// Parse a stored JSONC config string, falling back to an empty object if missing or corrupted
	const safeParse = (
		raw: string | undefined,
		fallback: string = '{}'
	): Record<string, unknown> => {
		try {
			return parseEditorConfig(raw ?? fallback) as Record<string, unknown>;
		} catch {
			return {};
		}
	};

	// Global config (*) — fallback to DEFAULT_EDITOR_CONFIG if missing or corrupted
	const globalCfg = safeParse(
		plugin.settings.editorConfigs['*'],
		DEFAULT_EDITOR_CONFIG
	);

	// No extension (e.g. extensionless files like LICENSE/README, or extensionless internal context) — global config only
	if (!ext) return JSON.stringify(globalCfg);

	// Get the Monaco language for this extension
	const language = staticMap[ext] ?? 'plaintext';

	// Apply language config as fallback (if extension maps to a different language, e.g. jsonc → json)
	const languageCfg =
		language !== ext &&
		language !== 'plaintext' &&
		plugin.settings.editorConfigs[language]
			? safeParse(plugin.settings.editorConfigs[language])
			: {};

	// Apply extension-specific config (highest priority)
	const extCfg = safeParse(plugin.settings.editorConfigs[ext]);

	return JSON.stringify({ ...globalCfg, ...languageCfg, ...extCfg });
}
