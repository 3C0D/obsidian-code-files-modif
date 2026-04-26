import type { DataAdapterEx } from 'obsidian-typings';

export interface MyPluginSettings {
	/** File extensions registered with Obsidian to open in Monaco */
	extensions: string[];
	/** Advanced type checking and IntelliSense features for JS/TS */
	semanticValidation: boolean;
	/** Basic syntax error checking for JS/TS */
	syntaxValidation: boolean;
	/** Monaco editor theme — 'default' follows Obsidian's dark/light mode */
	theme: string;
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
	/** Last selected extension in the settings tab Editor Config section */
	lastSelectedConfigExtension: string;
	/** Override for command palette hotkey (empty string = use Obsidian default) */
	commandPaletteHotkeyOverride: string;
	/** Override for settings hotkey (empty string = use Obsidian default) */
	settingsHotkeyOverride: string;
	/** Override for delete file hotkey (empty string = use Obsidian default) */
	deleteFileHotkeyOverride: string;
	/** Hidden folders to never show */
	excludedFolders: string[];
	/**
	 * Map of revealed hidden files (dotfiles) in the file explorer.
	 * Key: Normalized path of the parent folder.
	 * Value: Array of normalized paths of revealed files within that folder.
	 */
	revealedFiles: Record<string, string[]>;
	/** Automatically reveal dotfiles when their extension is registered with Code Files */
	autoRevealRegisteredDotfiles: boolean;
	/** Paths of files temporarily revealed for editing, cleaned up on close */
	temporaryRevealedPaths: string[];
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

/**
 * Hotkey configuration object.
 *
 * @property modifiers - Array of modifier keys (e.g. ['Mod', 'Shift'])
 * @property key - The main key (e.g. 'a')
 */
export interface HotkeyConfig {
	/** Array of modifier keys (e.g. ['Mod', 'Shift']) */
	modifiers: string[];
	/** The main key (e.g. 'a') */
	key: string;
}

/**
 * Extended DataAdapter interface including internal Obsidian methods.
 *
 * @property reconcileFileInternal    - Internal Obsidian method to reconcile a file change
 * @property reconcileDeletion        - Internal Obsidian method to reconcile a file deletion
 * @property reconcileFolderCreation  - Internal Obsidian method to reconcile a folder creation
 * @property reconcileFileChanged     - Internal Obsidian method to reconcile a file modification
 * @property listRecursive            - Internal method to list all files and folders (including dotfiles)
 * @property fs                       - Internal file system access (Mobile/Desktop abstraction)
 * @property getFullRealPath          - Get the full physical path on disk
 */
export interface DataAdapterWithInternal extends Omit<
	DataAdapterEx,
	'listRecursive' | 'getFullRealPath'
> {
	/** Internal Obsidian method to reconcile a file change */
	reconcileFileInternal?(realPath: string, normalizedPath: string): Promise<void>;
	/** Internal Obsidian method to reconcile a file deletion */
	reconcileDeletion(realPath: string, normalizedPath: string): Promise<void>;
	/** Internal Obsidian method to reconcile a folder creation */
	reconcileFolderCreation(realPath: string, normalizedPath: string): Promise<void>;
	/** Internal Obsidian method to reconcile a file modification */
	reconcileFileChanged?(
		realPath: string,
		normalizedPath: string,
		stat: { type: 'file' | 'folder'; size: number; mtime: number }
	): Promise<void>;
	/** Internal method to list all files and folders (including dotfiles) */
	listRecursive?(path: string): Promise<{ files: string[]; folders: string[] }>;
	/** Internal file system access (Mobile/Desktop abstraction) */
	fs?: {
		/** Stat a file or folder using internal fs */
		stat(
			path: string
		): Promise<{ type: 'file' | 'folder'; size: number; mtime: number }>;
	};
	/** Get the full physical path on disk */
	getFullRealPath?(path: string): string;
}

/**
 * Represents a hidden item found during a file system scan.
 *
 * @property name     - The file or folder name (including the leading dot)
 * @property path     - The normalized path relative to the vault root
 * @property isFolder - Whether the item is a folder
 * @property size     - File size in bytes
 */
export interface HiddenItem {
	/** The file or folder name (including the leading dot) */
	name: string;
	/** The normalized path relative to the vault root */
	path: string;
	/** Whether the item is a folder */
	isFolder: boolean;
	/** File size in bytes */
	size: number;
}

export interface HiddenFileSuggestion {
	name: string;
	path: string;
	size: number;
}
