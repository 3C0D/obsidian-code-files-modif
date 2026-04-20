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
	/** Maximum file size in MB for opening in Monaco (default: 10) */
	maxFileSize: number;
	/** Project root folder (vault-relative path) for inter-file navigation and imports resolution */
	projectRootFolder: string;
	/** Custom color for the project root folder highlight — empty string uses CSS default (--color-green) */
	projectRootFolderColor: string;
	/** Last selected extension in the settings tab Editor Config section */
	lastSelectedConfigExtension: string;
	/** Override for command palette hotkey (empty string = use Obsidian default) */
	commandPaletteHotkeyOverride: string;
	/** Override for settings hotkey (empty string = use Obsidian default) */
	settingsHotkeyOverride: string;
	/** Override for delete file hotkey (empty string = use Obsidian default) */
	deleteFileHotkeyOverride: string;
}

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

export interface HotkeyConfig {
	modifiers: string[];
	key: string;
}
