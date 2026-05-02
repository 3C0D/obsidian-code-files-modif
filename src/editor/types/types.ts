import type { ItemView, WorkspaceLeaf } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';

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
 * Context for header actions in the code editor view.
 * @property plugin - The plugin instance
 * @property codeEditor - Monaco editor control handle
 * @property addAction - Bound ItemView.addAction, adds a button to the view header

 * @property leaf - Workspace leaf containing this view
 * @property noReturnAction - Whether to hide the return arrow (for command palette opens)
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
	codeEditor: CodeEditorInstance | null;
	/** Bound ItemView.addAction — adds a button to the view header */
	addAction: ItemView['addAction'];

	/** The workspace leaf containing this view */
	leaf: WorkspaceLeaf;
	/** Whether to hide the return arrow (for command palette opens) */
	noReturnAction: boolean;
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

declare global {
	interface Window {
		initMonacoApp: () => void;
	}
}
