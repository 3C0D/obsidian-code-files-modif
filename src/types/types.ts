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
	/** Project root folder (vault-relative path) for inter-file navigation and imports resolution */
	projectRootFolder: string;
	/** Custom color for the project root folder highlight — empty string uses CSS default (--color-green) */
	projectRootFolderColor: string;
	/** Last selected extension in the settings tab Editor Config section */
	lastSelectedConfigExtension: string;
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
    "insertSpaces": false,

    // --- On Save / On Type ---
    "formatOnSave": true,
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
		jsonc: `{
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
		yml: `{
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
    // "tabSize": 4,
    "insertSpaces": true,
}`,
		cpp: `{
    // C++ typically uses 4-space or tab indentation
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

	return templates[ext] || DEFAULT_EXTENSION_CONFIG;
}

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
	extraExtensions: [],
	projectRootFolder: '',
	projectRootFolderColor: '',
	lastSelectedConfigExtension: ''
};

/** Obsidian view type identifier for the Monaco editor */
export const viewType = 'code-editor';

/** Typed suggestion for the CSS snippet picker — 'existing' for an existing snippet, 'new' to create one */
export type CssSuggestion = { kind: 'existing' | 'new'; name: string };

/**
 * Control handle for a Monaco editor embedded in an iframe (blob URL).
 * Returned by mountCodeEditor() and used by CodeEditorView, FenceEditModal, and EditorSettingsModal
 * to communicate with the isolated Monaco instance via postMessage.
 *
 * The iframe is isolated from Obsidian's scope; all writes and lifecycle ops go through postMessage,
 * reads return a locally-cached value kept in sync via 'change' events.
 *
 * @property iframe    - The iframe DOM element
 * @property send      - Send a typed command to the iframe (theme, options, content...)
 * @property getValue  - Get current content (local cache, no postMessage)
 * @property setValue  - Set content and sync to iframe
 * @property clear     - Clear content
 * @property destroy   - Remove iframe, revoke blob URL, detach message listener
 */
export interface CodeEditorInstance {
	/** The iframe element containing the Monaco editor */
	iframe: HTMLIFrameElement;
	/**
	 * Sends a typed postMessage to the Monaco iframe.
	 * '*' is intentional: the iframe is a blob: URL with no stable origin to target.
	 *
	 * @param type - Message type identifier (e.g. 'init', 'change-value', 'change-theme').
	 * @param payload - Data to send alongside the message. Spread into the message object,
	 *                  so the iframe receives { type, ...payload }.
	 */
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

export type MenuItems = { title: string; icon: string; action: () => void };

// ===== Monaco HTML Configuration Constants =====
// These values are used in TypeScript code (not in the HTML iframe)
// For HTML iframe config, see src/types/monacoHtml.js

/** Duration (ms) the diff button stays visible in tab header after formatting */
export const DIFF_BUTTON_DISPLAY_DURATION = 10000;
