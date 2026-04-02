export interface MyPluginSettings {
	extensions: string[];
	folding: boolean;
	lineNumbers: boolean;
	minimap: boolean;
	semanticValidation: boolean;
	syntaxValidation: boolean;
	theme: string;
	overwriteBg: boolean;
	showRibbonIcon: boolean;
	/** Per-extension formatter config as JSON strings, keyed by extension (e.g. 'json', 'ts') */
	formatterConfigs: Record<string, string>;
}

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

export const viewType = 'code-editor';

// Typed suggestion to avoid encoding intent in a display string
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
