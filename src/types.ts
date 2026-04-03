export interface MyPluginSettings {
	/** File extensions registered with Obsidian to open in Monaco */
	extensions: string[];
	/** Allows collapsing/expanding code blocks for better navigation */
	folding: boolean;
	lineNumbers: boolean;
	minimap: boolean;
	/** Advanced type checking and IntelliSense features for JS/TS */
	semanticValidation: boolean;
	/** Basic syntax error checking for JS/TS */
	syntaxValidation: boolean;
	/** Monaco editor theme — 'default' follows Obsidian's dark/light mode */
	theme: string;
	/** Use Obsidian's background color instead of the editor theme's */
	overwriteBg: boolean;
	/** Show the ribbon icon to create a new code file */
	showRibbonIcon: boolean;
	/** Last 5 recently used themes, most recent first */
	recentThemes: string[];
	/** If false, Obsidian's auto-save is blocked in Monaco views — only Ctrl+S saves */
	autoSave: boolean;
	/** Word wrap mode for the Monaco editor */
	wordWrap: 'on' | 'off';
	/** Per-extension formatter config as JSON strings, keyed by extension (e.g. 'json', 'ts') */
	formatterConfigs: Record<string, string>;
	/** When true, all Monaco-supported extensions are registered (minus excludedExtensions) */
	allExtensions: boolean;
	/** Extensions excluded from auto-registration when allExtensions is true */
	excludedExtensions: string[];
}

/** Default Monaco formatter options applied when no per-extension config exists */
const DEFAULT_FORMATTER_CONFIG = JSON.stringify(
	{
		tabSize: 4,
		insertSpaces: true,
		formatOnSave: true,
		formatOnType: false
	},
	null,
	2
);
export { DEFAULT_FORMATTER_CONFIG };

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
	extensions: ['ts', 'tsx', 'js', 'jsx', 'py'],
	folding: true,
	lineNumbers: true,
	minimap: true,
	semanticValidation: true,
	syntaxValidation: true,
	theme: 'default',
	overwriteBg: true,
	showRibbonIcon: true,
	recentThemes: [],
	autoSave: false,
	wordWrap: 'off',
	formatterConfigs: {},
	allExtensions: false,
	excludedExtensions: [...OBSIDIAN_NATIVE_EXTENSIONS]
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
