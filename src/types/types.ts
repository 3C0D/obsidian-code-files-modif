/**
 * @fileoverview Type definitions for obsidian-code-files.
 *
 * Documentation convention used throughout this file:
 * - `@property` tags on the interface JSDoc: visible when hovering the interface type itself
 *   (e.g. when first constructing an object or reading a function signature).
 * - Inline `/** ... *\/` on each property: visible when hovering `context.myProp` in consuming code.
 *
 * Both are intentional and complementary
 */
import type { DataAdapterEx } from 'obsidian-typings';
import type { ItemView, WorkspaceLeaf } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';

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
 * @property iframe   - The iframe DOM element
 * @property send     - Send a typed command to the iframe (theme, options, content...)
 * @property getValue - Get current content (local cache, no postMessage)
 * @property setValue - Set content and sync to iframe
 * @property clear    - Clear content
 * @property destroy  - Remove iframe, revoke blob URL, detach message listener
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

/** Menu item configuration for context menus. */
export type MenuItems = { title: string; icon: string; action: () => void };

/**
 * Tool definition for actions that can appear in multiple locations.
 * @property id - Unique identifier for the action
 * @property icon - Icon identifier (for header actions)
 * @property title - Display title
 * @property action - Function to execute
 * @property availableInHeader - Whether this action appears in the view header
 * @property availableInContextMenu - Whether this action appears in Monaco's context menu
 * @property contextMenuGroupId - Group ID for context menu organization (if availableInContextMenu)
 * @property contextMenuOrder - Order within context menu group (if availableInContextMenu)
 * @property keybindings - Keyboard shortcuts (if any)
 */
export interface ToolDefinition {
	/** Unique identifier for the action */
	id: string;
	/** Icon identifier for header actions */
	icon: string;
	/** Display title */
	title: string;
	/** Function to execute */
	action: () => void;
	/** Whether this action appears in the view header */
	availableInHeader: boolean;
	/** Whether this action appears in Monaco's context menu */
	availableInContextMenu: boolean;
	/** Group ID for context menu organization */
	contextMenuGroupId?: string;
	/** Order within context menu group */
	contextMenuOrder?: number;
	/** Keyboard shortcuts */
	keybindings?: number[];
}

/**
 * Hotkey configuration object.
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
 * @property reconcileFileInternal   - Internal method to reconcile a file change
 * @property reconcileDeletion       - Internal method to reconcile a file deletion
 * @property reconcileFolderCreation - Internal method to reconcile a folder creation
 * @property reconcileFileChanged    - Internal method to reconcile a file modification
 * @property listRecursive           - List all files and folders (including dotfiles)
 * @property fs                      - Internal file system access (Mobile/Desktop abstraction)
 * @property getFullRealPath         - Get the full physical path on disk
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

/**
 * Suggestion for file selection modals and for hidden files in the file explorer.
 */
export type FileSuggestion = Pick<HiddenItem, 'name' | 'path' | 'size'>;

/**
 * Encapsulates the state for a folder section in the reveal hidden files modal.
 *
 * @property folderPath - The normalized path of the folder
 * @property items - Array of hidden items in this folder
 * @property initialRevealed - Set of paths that were initially revealed when the modal opened
 * @property selected - Set of paths currently selected by the user
 * @property selectedForRegistration - Set of paths selected for extension registration
 */
export interface FolderSection {
	/** The normalized path of the folder */
	folderPath: string;
	/** Array of hidden items in this folder */
	items: HiddenItem[];
	/** Set of paths that were initially revealed when the modal opened */
	initialRevealed: Set<string>;
	/** Set of paths currently selected by the user */
	selected: Set<string>;
	/** Set of paths selected for extension registration */
	selectedForRegistration: Set<string>;
}

/**
 * Context for header actions in the code editor view.
 * @property plugin - The plugin instance
 * @property codeEditor - Monaco editor control handle
 * @property addAction - Bound ItemView.addAction, adds a button to the view header
 * @property onForceSave - Triggers a force save (bypasses autoSave guard)
 * @property onShowDiff - Shows the diff action button
 * @property onHideDiff - Hides the diff action button
 * @property leaf - Workspace leaf containing this view
 * @property gearAction - Gear button element, null when not mounted
 * @property themeAction - Theme picker button element, null when not mounted
 * @property snippetFolderAction - Snippet folder button element, null when not mounted
 * @property snippetToggleAction - Snippet toggle button element, null when not mounted
 * @property returnAction - Return button element, null when not mounted
 * @property diffAction - Diff button element, null when not mounted
 * @property diffTimer - Controls how long the diff button stays visible
 * @property unregisterSnippetHandler - Cleanup for the active snippet event handler
 */
export interface HeaderActionsContext {
	/** The plugin instance */
	plugin: CodeFilesPlugin;
	/** The Monaco editor control handle */
	codeEditor: CodeEditorInstance;
	/** Bound ItemView.addAction — adds a button to the view header */
	addAction: ItemView['addAction'];
	/** Called to show the diff action button */
	onShowDiff: () => void;
	/** Called to hide the diff action button */
	onHideDiff: () => void;
	/** The workspace leaf containing this view */
	leaf: WorkspaceLeaf;
	// Mutable action button elements — null when not mounted
	/** Gear/settings action button element */
	gearAction: HTMLElement | null;
	/** Theme picker action button element */
	themeAction: HTMLElement | null;
	/** Snippet folder action button element */
	snippetFolderAction: HTMLElement | null;
	/** Snippet toggle action button element */
	snippetToggleAction: HTMLElement | null;
	/** Return/back action button element */
	returnAction: HTMLElement | null;
	/** Diff view action button element */
	diffAction: HTMLElement | null;
	/** Timer controlling how long the diff button stays visible */
	diffTimer: NodeJS.Timeout | null;
	/** Cleanup function to unregister the active snippet event handler */
	unregisterSnippetHandler: (() => void) | null;
	/** Called to open the editor config modal */
	onOpenEditorConfig: (ext: string) => void;
	/** Called to open the theme picker modal */
	onOpenThemePicker: () => void;
}

/**
 * Asset URLs for Monaco editor components and formatters.
 */
export interface AssetUrls {
	vsBase: string;
	htmlUrl: string;
	bundleJsUrl: string;
	configCssUrl: string;
	prettierBase: string;
	prettierMarkdownUrl: string;
	prettierEstreeUrl: string;
	prettierTypescriptUrl: string;
	prettierBabelUrl: string;
	prettierPostcssUrl: string;
	prettierHtmlUrl: string;
	prettierYamlUrl: string;
	prettierGraphqlUrl: string;
	mermaidFormatterUrl: string;
	clangFormatterUrl: string;
	clangWasmUrl: string;
	ruffFormatterUrl: string;
	ruffWasmUrl: string;
	gofmtFormatterUrl: string;
	gofmtWasmUrl: string;
}

/**
 * Context object passed to the message handler builder for a Monaco iframe instance.
 */
export interface MessageHandlerContext {
	/** The iframe element containing the Monaco editor */
	iframe: HTMLIFrameElement;
	/** Function to send messages to the iframe */
	send: (type: string, payload: Record<string, unknown>) => void;
	/** Reference to the current editor value to avoid closure issues */
	valueRef: { current: string };
	/** Unique context identifier for this editor instance */
	codeContext: string;
	/** The plugin instance */
	plugin: CodeFilesPlugin;
	/** Initialization parameters sent to the iframe */
	initParams: Record<string, unknown>;
	/** Function to load project files for IntelliSense */
	loadProjectFiles: (
		send: (type: string, payload: Record<string, unknown>) => void
	) => Promise<void>;
	/** Whether to auto-focus the editor after init */
	autoFocus: boolean;
	/** Callback for content changes */
	onChange?: () => void;
	/** Callback for save actions (Ctrl+S) */
	onSave?: () => void;
	/** Callback for format diff available */
	onFormatDiff?: () => void;
	/** Callback for format diff reverted */
	onFormatDiffReverted?: () => void;
	/** Callback to open editor config modal */
	onOpenEditorConfig?: (ext: string) => void;
	/** Callback to open theme picker modal */
	onOpenThemePicker?: () => void;
	/** Callback to open rename extension modal */
	onOpenRenameExtension?: () => void;
}
