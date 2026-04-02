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
	/** Per-extension formatter config as JSON strings, keyed by extension (e.g. 'json', 'ts') */
	formatterConfigs: Record<string, string>;
}

/** Default Monaco formatter options applied when no per-extension config exists */
const DEFAULT_FORMATTER_CONFIG = JSON.stringify(
	{
		tabSize: 2,
		insertSpaces: true,
		formatOnSave: false,
		formatOnType: false
	},
	null,
	2
);

export { DEFAULT_FORMATTER_CONFIG };

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
	formatterConfigs: {}
};

/** Obsidian view type identifier for the Monaco editor */
export const viewType = 'code-editor';

/** Typed suggestion to avoid encoding intent in a display string */
export type CssSuggestion = { kind: 'existing' | 'new'; name: string };

export interface CodeEditorInstance {
	iframe: HTMLIFrameElement;
	/** Sends a typed postMessage to the Monaco iframe */
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
