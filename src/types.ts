export interface MyPluginSettings {
	/** File extensions registered with Obsidian to open in Monaco */
	extensions: string[];
	/** Advanced type checking and IntelliSense features for JS/TS */
	semanticValidation: boolean;
	/** Basic syntax error checking for JS/TS */
	syntaxValidation: boolean;
	/** Monaco editor theme — 'default' follows Obsidian's dark/light mode */
	theme: string;
	/** Show the ribbon icon to create a new code file */
	showRibbonIcon: boolean;
	/** Last 5 recently used themes, most recent first */
	recentThemes: string[];
	/** If false, Obsidian's auto-save is blocked in Monaco views — only Ctrl+S saves */
	autoSave: boolean;
	/** Monaco editor brightness filter (0.2 – 2.0, default 1) */
	editorBrightness: number;
	/** Word wrap mode for the Monaco editor */
	wordWrap: 'on' | 'off';
	/** Enable code block folding in the editor */
	folding: boolean;
	/** Show line numbers in the editor */
	lineNumbers: boolean;
	/** Show the minimap on the right side */
	minimap: boolean;

	/** Per-extension editor config as JSON strings, keyed by extension (e.g. 'json', 'ts') */
	editorConfigs: Record<string, string>;
	/** When true, all Monaco-supported extensions are registered (minus excludedExtensions) */
	allExtensions: boolean;
	/** Extensions excluded from auto-registration when allExtensions is true */
	excludedExtensions: string[];
	/** Extra extensions added manually while allExtensions is true */
	extraExtensions: string[];
}

export function parseEditorConfig(str: string): unknown {
	return JSON.parse(
		str
			.replace(/\/\/[^\n]*/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/,(\s*[}\]])/g, '$1')
	);
}

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
    "insertSpaces": true,

    // --- On Save / On Type ---
    "formatOnSave": true,
    "formatOnType": false,
    "trimAutoWhitespace": true,

    // --- Display (decommenting disables) ---
    // "folding": false,
    // "lineNumbers": "off",
    // "minimap": { "enabled": false },
    // "wordWrap": "on",

    // --- Optional ---
    // "rulers": [80, 120],
    // "renderWhitespace": "selection", // "none" | "boundary" | "selection" | "all"
    // "fontSize": 14,
    // "bracketPairColorization.enabled": true,
}`;

/** Default per-extension config — empty override, only add what differs from global */
export const DEFAULT_EXTENSION_CONFIG = `{
    // Override global config for this extension only.
    // Example:
    // "tabSize": 2,
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
	theme: 'tomorrow-night',
	showRibbonIcon: true,
	recentThemes: [],
	autoSave: false,
	editorBrightness: 1,
	wordWrap: 'off',
	folding: true,
	lineNumbers: true,
	minimap: true,
	editorConfigs: { '*': DEFAULT_EDITOR_CONFIG },
	allExtensions: true,
	excludedExtensions: [...OBSIDIAN_NATIVE_EXTENSIONS],
	extraExtensions: []
};

/** Obsidian view type identifier for the Monaco editor */
export const viewType = 'code-editor';

/** Typed suggestion for the CSS snippet picker — 'existing' for an existing snippet, 'new' to create one */
export type CssSuggestion = { kind: 'existing' | 'new'; name: string };

export interface CodeEditorInstance {
	/** The iframe element containing the Monaco editor */
	iframe: HTMLIFrameElement;
	/** Sends a postMessage instruction from Obsidian to the Monaco iframe (e.g. change theme, update options, set content) */
	send: (type: string, payload: Record<string, unknown>) => void;
	/** Clears the editor content */
	clear: () => void;
	/** Returns the current editor content */
	getValue: () => string;
	/** Sets the editor content */
	setValue: (newValue: string) => void;
	/** Removes the iframe, revokes the blob URL, and cleans up the message listener */
	destroy: () => void;
}
