/**
 * Settings persistence and editor config management.
 * Handles loading/saving plugin settings with deep merge for editorConfigs.
 * Provides parseEditorConfig (strips comments and trailing commas from JSONC)
 * and buildMergedConfig (cascades default → global → language → extension).
 */
import type CodeFilesPlugin from '../main.ts';
import { DEFAULT_SETTINGS, DEFAULT_EDITOR_CONFIG, DEFAULT_EXTENSION_CONFIG } from '../types/index.ts';
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
 * @returns `true` if saved, `false` if the JSON is invalid or the value is unchanged
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
  const globalCfg = safeParse(plugin.settings.editorConfigs['*'], DEFAULT_EDITOR_CONFIG);

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

/**
 * Returns a language-specific config template with commented suggestions.
 * Used when creating a new per-extension config to provide helpful defaults.
 *
 * If the extension maps to a different Monaco language (e.g., clangformat → yaml),
 * returns the template for that language as a fallback.
 *
 * @param ext - File extension WITHOUT the leading dot (e.g. 'ts', 'md', 'json')
 * @returns A JSON string with commented suggestions for this extension
 */
export function getExtensionConfigTemplate(ext: string): string {
  if (!ext) return DEFAULT_EXTENSION_CONFIG;
  const templates: Record<string, string> = {
    md: `{
    // Markdown-specific options
    // "printWidth": 80,  // Line length for wrapping prose
    // "proseWrap": "always",  // "always" | "never" | "preserve" - how to wrap prose
    // "tabSize": 2,
}`,
    json: `{
    // JSON uses 2-space indentation (Prettier override)
    "tabSize": 2,
    "insertSpaces": true,
    // "printWidth": 80,
}`,
    yaml: `{
    // YAML uses 2-space indentation (standard)
    "tabSize": 2,
    "insertSpaces": true,
    // "printWidth": 80,
}`,
    js: `{
    // JavaScript options
    // "tabSize": 2,
    // "printWidth": 100,
    // "formatOnSave": true,
}`,
    jsx: `{
    // JSX options
    // "tabSize": 2,
    // "printWidth": 100,
    // "formatOnSave": true,
}`,
    ts: `{
    // TypeScript options
    // "tabSize": 2,
    // "printWidth": 100,
    // "formatOnSave": true,
}`,
    tsx: `{
    // TSX options
    // "tabSize": 2,
    // "printWidth": 100,
    // "formatOnSave": true,
}`,
    css: `{
    // CSS options
    // "tabSize": 2,
    // "printWidth": 80,
}`,
    scss: `{
    // SCSS options
    // "tabSize": 2,
    // "printWidth": 80,
}`,
    less: `{
    // Less options
    // "tabSize": 2,
    // "printWidth": 80,
}`,
    html: `{
    // HTML options
    // "tabSize": 2,
    // "printWidth": 100,
}`,
    graphql: `{
    // GraphQL options
    // "tabSize": 2,
    // "printWidth": 80,
}`,
    mmd: `{
    // Mermaid diagram options
    // "tabSize": 2,
    // "formatOnSave": true,
}`,
    py: `{
    // Python uses 4-space indentation (PEP 8)
    // Ruff formatter is integrated
    // "tabSize": 4,
    "insertSpaces": true,
    "printWidth": 88,  // Ruff default line length
}`,
    go: `{
    // Go uses tabs (gofmt standard)
    // gofmt formatter is integrated
    "insertSpaces": false,
    // "printWidth": 100,
}`,
    rs: `{
    // Rust uses 4-space indentation (rustfmt default)
    // "tabSize": 4,
    "insertSpaces": true,
    // "printWidth": 100,
}`,
    c: `{
    // C typically uses 4-space or tab indentation
    // clang-format formatter is integrated
    // "tabSize": 4,
    "insertSpaces": true,
}`,
    cpp: `{
    // C++ typically uses 4-space or tab indentation
    // clang-format formatter is integrated
    // "tabSize": 4,
    "insertSpaces": true,
}`,
    java: `{
    // Java typically uses 4-space indentation
    // "tabSize": 4,
    "insertSpaces": true,
}`,
    cs: `{
    // C# typically uses 4-space indentation
    // "tabSize": 4,
    "insertSpaces": true,
}`,
    php: `{
    // PHP typically uses 4-space indentation (PSR-2)
    // "tabSize": 4,
    "insertSpaces": true,
}`
  };

  // If extension has a template, use it
  if (templates[ext]) return templates[ext];

  // Otherwise, check if extension maps to a different language and use that template
  const language = staticMap[ext] ?? 'plaintext';
  if (language !== ext && language !== 'plaintext' && templates[language]) {
    return templates[language];
  }

  return DEFAULT_EXTENSION_CONFIG;
}
