import { staticMap } from '../utils/getLanguage.ts';
import type { MyPluginSettings } from './types.ts';

/**
 * Default Monaco editor options applied when no per-extension config exists.
 *
 * Convention:
 * - Uncommented = values we explicitly chose (may differ from Monaco's own defaults)
 * - Commented = uncommenting will override the default behavior
 */
export const DEFAULT_EDITOR_CONFIG = `{
    // Options here override global settings for this extension (like VSCode workspace settings).
    // --- Indentation ---
    "tabSize": 4,
    "insertSpaces": false,

    // --- On Save / On Type ---
    "formatOnSave": false,
    "formatOnType": false,
    "trimAutoWhitespace": true,
    "trimTrailingWhitespace": true,

    // --- Formatting ---
    "printWidth": 100,  // Line length for Prettier formatters

    // --- Display ---
    "renderWhitespace": "selection", // "none" | "boundary" | "selection" | "all"
    // "folding": false,
    // "lineNumbers": "off",
    // "minimap": { "enabled": false },
    // "wordWrap": "on",  // "on" | "off"

    // --- Optional ---
    // "rulers": [80, 120],  // Visual guides for line length (all languages)
    // "fontSize": 14,
    // "bracketPairColorization.enabled": true,
}`;

/** Extensions that Obsidian handles natively — excluded by default when allExtensions is on */
export const OBSIDIAN_NATIVE_EXTENSIONS = [
	'md',
	'canvas',
	'pdf',
	'png',
	'jpg',
	'jpeg',
	'gif',
	'bmp',
	'svg',
	'webp',
	'mp3',
	'wav',
	'm4a',
	'ogg',
	'3gp',
	'flac',
	'mp4',
	'webm',
	'ogv',
	'mov',
	'mkv',
	'base'
];

/** Plugin default settings applied on first install */
export const DEFAULT_SETTINGS: MyPluginSettings = {
	extensions: [
		'ts',
		'tsx',
		'js',
		'jsx',
		'py',
		'json',
		'jsonc',
		'css',
		'html',
		'sh',
		'yaml',
		'sql',
		'php',
		'cs',
		'java',
		'go',
		'rs',
		'cpp',
		'c'
	],
	semanticValidation: true,
	syntaxValidation: true,
	theme: 'default',
	recentThemes: [],
	autoSave: false,
	editorBrightness: 1,
	wordWrap: 'off',
	folding: true,
	lineNumbers: true,
	minimap: true,
	editorConfigs: { '*': DEFAULT_EDITOR_CONFIG },
	allExtensions: false,
	excludedExtensions: [...OBSIDIAN_NATIVE_EXTENSIONS],
	extraExtensions: [],
	maxFileSize: 10,
	projectRootFolder: '',
	lastSelectedConfigExtension: '',
	commandPaletteHotkeyOverride: '',
	settingsHotkeyOverride: '',
	deleteFileHotkeyOverride: '',
	excludedFolders: ['.git', 'node_modules', '.trash'],
	revealedFiles: {},
	autoRevealRegisteredDotfiles: true,
	temporaryRevealedPaths: []
};

/**
 * Extensions that have integrated formatters.
 * These are the only extensions that should appear in the Editor Config extension selector.
 *
 * Formatters:
 * - Prettier: js, jsx, ts, tsx, css, scss, less, html, json, jsonc, yaml, yml, graphql, md
 * - Mermaid: mmd
 * - Ruff: py
 * - gofmt: go
 * - clang-format: c, cpp, cc, cxx, h, hpp
 */
export const FORMATTABLE_EXTENSIONS = [
	// Prettier-supported
	'js',
	'jsx',
	'cjs',
	'mjs',
	'es6',
	'ts',
	'tsx',
	'cts',
	'mts',
	'css',
	'scss',
	'less',
	'html',
	'htm',
	'json',
	'jsonc',
	'yaml',
	'yml',
	'graphql',
	'gql',
	'md',
	'mdx',
	'markdown',
	// Mermaid
	'mmd',
	'mermaid',
	// Python (Ruff)
	'py',
	// Go (gofmt)
	'go',
	// C/C++ (clang-format)
	'c',
	'cpp',
	'cc',
	'cxx',
	'h',
	'hpp',
	'hh',
	'hxx'
];

/** Default per-extension config — empty override, only add what differs from global */
export const DEFAULT_EXTENSION_CONFIG = `{
    // Override global config for this extension only.
    // Example:
    // "tabSize": 2,
    // "printWidth": 80,
    // "trimTrailingWhitespace": false,
}`;

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

/** Built-in Monaco themes that don't require external JSON files */
export const BUILTIN_THEMES = ['vs', 'vs-dark', 'hc-black', 'hc-light', 'default'];

/** Extensions to exclude from file lists (binary executables, archives, and files that can't be opened as text) */
export const EXCLUDED_EXTENSIONS = [
	// Executables and libraries
	'exe',
	'dll',
	'so',
	'dylib',
	'app',
	'dmg',
	'msi',
	// Archives
	'zip',
	'rar',
	'7z',
	'tar',
	'gz',
	'bz2',
	'xz',
	// Database files
	'db',
	'sqlite',
	'mdb',
	// Office binary formats
	'doc',
	'xls',
	'ppt',
	// Fonts
	'ttf',
	'otf',
	'woff',
	'woff2',
	'eot'
];
