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

// ===== MessageHandlerContext =====

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

// ===== Plugin Settings =====

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
  /** Override for console hotkey (empty string = use default Ctrl+J) */
  consoleHotkey: string;
  /** Hidden folders to never show */
  excludedFolders: string[];

  /**
   * Map of revealed hidden files (dotfiles) in the file explorer.
   * Key: Normalized path of the parent folder.
   * Value: Array of normalized paths of revealed files within that folder.
   */
  revealedFiles: Record<string, string[]>;
  /** Automatically reveal dotfiles when their extension is registered with Code Files */
  isAutoRevealRegisteredDotfile: boolean;
  /** Paths of files temporarily revealed for editing, cleaned up on close */
  temporaryRevealedPaths: string[];
  /** Persistent console height in pixels */
  consoleHeight: number;
  /** Command history per file context, saved across sessions */
  consoleHistories: Record<string, string[]>;
}

/** Typed suggestion for the CSS snippet picker — 'existing' for an existing snippet, 'new' to create one */
export type CssSuggestion = { kind: 'existing' | 'new'; name: string };

/** Menu item configuration for context menus. */
export type MenuItem = { title: string; icon: string; action: () => void };

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
 * Parameters used to initialize the Monaco editor iframe.
 * Sent via postMessage('init', ...) to the iframe.
 * @property {string} context - Unique identifier for this editor instance (file path or modal ID)
 * @property {string} lang - Monaco language ID
 * @property {string} theme - Resolved Monaco theme ID
 * @property {string} [themeData] - Theme data JSON string for custom themes
 * @property {boolean} folding - Enable code block folding
 * @property {boolean} lineNumbers - Show line numbers
 * @property {boolean} minimap - Show the minimap
 * @property {'on' | 'off'} wordWrap - Word wrap mode
 * @property {string} [editorConfig] - Merged editor configuration as JSON string
 * @property {HotkeyConfig} commandPaletteHotkey - Hotkey for opening the command palette
 * @property {HotkeyConfig} settingsHotkey - Hotkey for opening the plugin settings
 * @property {HotkeyConfig} deleteFileHotkey - Hotkey for deleting the current file
 * @property {boolean} noSemanticValidation - Advanced type checking for JS/TS
 * @property {boolean} noSyntaxValidation - Basic syntax error checking for JS/TS
 * @property {string} projectRootFolder - Vault-relative path for the project root
 * @property {boolean} [isUnregisteredExtension] - Whether the file extension is unregistered
 * @property {string} [background] - Background color for the iframe
 * @property {number} consoleHeight - Height of the integrated console
 */
export interface InitParams {
  /** Unique identifier for this editor instance (file path or modal ID) */
  context: string;
  /** Monaco language ID */
  lang: string;
  /** Resolved Monaco theme ID */
  theme: string;
  /** Theme data JSON string for custom themes */
  themeData?: string;
  /** Enable code block folding */
  folding: boolean;
  /** Show line numbers */
  lineNumbers: boolean;
  /** Show the minimap */
  minimap: boolean;
  /** Word wrap mode ('on' or 'off') */
  wordWrap: 'on' | 'off';
  /** Merged editor configuration (from .editorconfig or plugin settings) as JSON string */
  editorConfig?: string;
  /** Hotkey for opening the command palette */
  commandPaletteHotkey: HotkeyConfig;
  /** Hotkey for opening the plugin settings */
  settingsHotkey: HotkeyConfig;
  /** Hotkey for deleting the current file */
  deleteFileHotkey: HotkeyConfig;
  /** Hotkey for opening the console */
  consoleHotkey: HotkeyConfig;
  /** Basic syntax error checking for JS/TS (inverse of plugin settings) */
  noSyntaxValidation: boolean;
  /** Advanced type checking and IntelliSense for JS/TS (inverse of plugin settings) */
  noSemanticValidation: boolean;
  /** Vault-relative path for the project root */
  projectRootFolder: string;
  /** Whether the file extension is not registered as a code file */
  isUnregisteredExtension?: boolean;
  /** Background color for the iframe (usually 'transparent') */
  background?: string;
  /** Height of the integrated console in pixels */
  consoleHeight: number;
}

/**
 * Extended DataAdapter interface including internal Obsidian methods.
 * @property {function} reconcileFileInternal   - Internal method to reconcile a file change
 * @property {function} reconcileDeletion       - Internal method to reconcile a file deletion
 * @property {function} reconcileFolderCreation - Internal method to reconcile a folder creation
 * @property {function} reconcileFileChanged    - Internal method to reconcile a file modification
 * @property {function} listRecursive           - List all files and folders (including dotfiles)
 * @property {function} fs                      - Internal file system access (Mobile/Desktop abstraction)
 * @property {function} getFullRealPath         - Get the full physical path on disk
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
    stat(path: string): Promise<{ type: 'file' | 'folder'; size: number; mtime: number }>;
  };
  /** Get the full physical path on disk */
  getFullRealPath?(path: string): string;
}

/**
 * Represents a hidden item found during a file system scan.
 * @property {string} name     - The file or folder name (including the leading dot)
 * @property {string} path     - The normalized path relative to the vault root
 * @property {boolean} isFolder - Whether the item is a folder
 * @property {number} size     - File size in bytes
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
 * @property {string} folderPath - The normalized path of the folder
 * @property {HiddenItem[]} items - Array of hidden items in this folder
 * @property {Set<string>} initialRevealed - Set of paths that were initially revealed when the modal opened
 * @property {Set<string>} selected - Set of paths currently selected by the user
 * @property {Set<string>} selectedForRegistration - Set of paths selected for extension registration
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
 * Parameters for mountCodeEditor().
 *
 * The editor runs in an isolated iframe (blob URL) to avoid conflicts with Obsidian's DOM
 * and CSP constraints. All communication goes through postMessage; reads return a locally-cached
 * value kept in sync via 'change' events from the iframe.
 *
 * Why a blob URL? getResourcePath() appends a cache-busting timestamp that breaks relative
 * ./vs paths. file:// is blocked by Electron's CSP. The blob URL bypasses the parent CSP
 * for its own inline content and allows path rewriting at fetch time.
 *
 * @property {CodeFilesPlugin} plugin - The plugin instance
 * @property {string} language - Monaco language ID (e.g. 'typescript', 'javascript', 'markdown')
 * @property {string} initialValue - Initial content to display in the editor
 * @property {string} codeContext - Unique identifier for this editor instance (file path or modal ID), used to filter postMessage events
 * @property {HTMLElement} containerEl - The HTMLElement to append the editor iframe to
 * @property {function(): void} onChange - Optional callback invoked when the editor content changes
 * @property {function(): void} onSave - Optional callback invoked when the user presses Ctrl+S
 * @property {function(): void} onFormatDiff - Optional callback invoked when a format diff is available
 * @property {function(): void} onFormatDiffReverted - Optional callback invoked when all blocks are reverted
 * @property {function(ext: string): void} onOpenEditorConfig - Optional callback invoked when the user requests editor settings
 * @property {function(): void} onOpenThemePicker - Optional callback invoked when the user requests theme picker
 * @property {function(): void} onOpenRenameExtension - Optional callback invoked when the user requests Rename (Name/ext)
 * @property {boolean} autoFocus - Optional flag to disable automatic focus on editor ready (default: true)
 * @property {function(isVisible: boolean): void} onConsoleVisibilityChanged - Optional callback invoked when the console visibility changes
 * @property {boolean} initialConsoleOpen - Optional flag to indicate whether the console should be open on initialization
 */
export interface MountCodeEditorOptions {
  /** The plugin instance */
  plugin: CodeFilesPlugin;
  /** Monaco language ID (e.g. 'typescript', 'javascript', 'markdown') */
  language: string;
  /** Initial content to display in the editor */
  initialValue: string;
  /** Unique identifier for this editor instance (file path or modal ID), used to filter postMessage events */
  codeContext: string;
  /** The HTMLElement to append the editor iframe to */
  containerEl: HTMLElement;
  /** Optional callback invoked when the editor content changes */
  onChange?: () => void;
  /** Optional callback invoked when the user presses Ctrl+S */
  onSave?: () => void;
  /** Optional callback invoked when a format diff is available (after formatting) */
  onFormatDiff?: () => void;
  /** Optional callback invoked when all blocks are reverted */
  onFormatDiffReverted?: () => void;
  /** Optional callback invoked when the user requests editor settings */
  onOpenEditorConfig?: (ext: string) => void;
  /** Optional callback invoked when the user requests theme picker */
  onOpenThemePicker?: () => void;
  /** Optional callback invoked when the user requests Rename (Name/ext) */
  onOpenRenameExtension?: () => void;
  /** Optional flag to disable automatic focus on editor ready (default: true) */
  autoFocus?: boolean;
  /** Optional callback invoked when the console visibility changes */
  onConsoleVisibilityChanged?: (visible: boolean) => void;
  /** Whether the console should be open on initialization */
  initialConsoleOpen?: boolean;
}

/** Function signature for sending messages to the Monaco iframe */
export type SendFunction = <T extends object>(type: string, payload: T) => void;

/**
 * Public handle for a mounted editor instance.
 * Used by the plugin view (CodeEditorView) to control the editor from the outside
 * (e.g. changing theme, focusing, or setting value).
 *
 * @property {HTMLIFrameElement} iframe - The iframe element containing the Monaco editor
 * @property {SendFunction} send - Public API to send typed messages to the Monaco iframe
 * @property {function(): void} clear - Clears the editor content
 * @property {function(): string} getValue - Returns the current editor content
 * @property {function(value: string): void} setValue - Sets the editor content
 * @property {function(): void} destroy - Removes the iframe and cleans up listeners
 */
export interface CodeEditorHandle {
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
  send: SendFunction;
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
 * @property {string} id - Unique identifier for the action
 * @property {string} icon - Icon identifier (for header actions)
 * @property {string} title - Display title
 * @property {function(): void} action - Function to execute
 * @property {boolean} availableInHeader - Whether this action appears in the view header
 * @property {boolean} availableInContextMenu - Whether this action appears in Monaco's context menu
 * @property {string} contextMenuGroupId - Group ID for context menu organization (if availableInContextMenu)
 * @property {number} contextMenuOrder - Order within context menu group (if availableInContextMenu)
 * @property {number[]} keybindings - Keyboard shortcuts (if any)
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
 * @property {CodeFilesPlugin} plugin - The plugin instance
 * @property {CodeEditorHandle | null} codeEditor - Monaco editor control handle
 * @property {ItemView['addAction']} addAction - Bound ItemView.addAction
 * @property {WorkspaceLeaf} leaf - Workspace leaf containing this view
 * @property {boolean} noReturnAction - Whether to hide the return arrow
 * @property {HTMLElement | null} gearAction - Gear button element
 * @property {HTMLElement | null} themeAction - Theme picker button element
 * @property {HTMLElement | null} snippetFolderAction - Snippet folder button element
 * @property {HTMLElement | null} snippetToggleAction - Snippet toggle button element
 * @property {HTMLElement | null} returnAction - Return button element
 * @property {HTMLElement | null} diffAction - Diff button element
 * @property {NodeJS.Timeout | null} diffTimer - Controls how long the diff button stays visible
 * @property {(() => void) | null} unregisterSnippetHandler - Cleanup for the snippet event handler
 */
export interface HeaderActionsContext {
  /** The plugin instance */
  plugin: CodeFilesPlugin;
  /** The Monaco editor control handle */
  codeEditor: CodeEditorHandle | null;
  /** Bound ItemView.addAction — adds a button to the view header */
  addAction: ItemView['addAction'];

  /** The workspace leaf containing this view */
  leaf: WorkspaceLeaf;
  /** Whether to hide the return arrow (for command palette opens) */
  noReturnAction: boolean;
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
 *
 * @property {string} vsBase - Base URL for VS Code assets
 * @property {string} htmlUrl - URL for the HTML file
 * @property {string} bundleJsUrl - URL for the bundle JavaScript file
 * @property {string} configCssUrl - URL for the configuration CSS file
 * @property {string} prettierBase - Base URL for Prettier
 * @property {string} prettierMarkdownUrl - URL for Prettier Markdown
 * @property {string} prettierEstreeUrl - URL for Prettier Estree
 * @property {string} prettierTypescriptUrl - URL for Prettier Typescript
 * @property {string} prettierBabelUrl - URL for Prettier Babel
 * @property {string} prettierPostcssUrl - URL for Prettier Postcss
 * @property {string} prettierHtmlUrl - URL for Prettier Html
 * @property {string} prettierYamlUrl - URL for Prettier Yaml
 * @property {string} prettierGraphqlUrl - URL for Prettier Graphql
 * @property {string} mermaidFormatterUrl - URL for Mermaid Formatter
 * @property {string} clangFormatterUrl - URL for Clang Formatter
 * @property {string} clangWasmUrl - URL for Clang WASM
 * @property {string} ruffFormatterUrl - URL for Ruff Formatter
 * @property {string} ruffWasmUrl - URL for Ruff WASM
 * @property {string} gofmtFormatterUrl - URL for Gofmt Formatter
 * @property {string} gofmtWasmUrl - URL for Gofmt WASM
 */
export interface AssetUrls {
  /** Base URL for VS Code assets */
  vsBase: string;
  /** URL for the HTML file */
  htmlUrl: string;
  /** URL for the bundle JavaScript file */
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
 * Internal context object passed to the message handler builder for a Monaco iframe instance.
 * Used by the handler to react to iframe events and send follow-up messages (e.g. 'init' after 'ready').
 *
 * @property {HTMLIFrameElement} iframe - The iframe element containing the Monaco editor
 * @property {SendFunction} send - Internal function to send response messages to the iframe
 * @property {{ current: string }} valueRef - Reference to the current editor value
 * @property {string} codeContext - Unique context identifier for this editor instance
 * @property {CodeFilesPlugin} plugin - The plugin instance
 * @property {InitParams} initParams - Initialization parameters sent to the iframe
 * @property {(send: SendFunction) => Promise<void>} loadProjectFiles - Function to load project files
 * @property {boolean} autoFocus - Whether to auto-focus the editor after init
 * @property {function(): void} [onChange] - Callback for content changes
 * @property {function(): void} [onSave] - Callback for save actions (Ctrl+S)
 * @property {function(): void} [onFormatDiff] - Callback for format diff available
 * @property {function(): void} [onFormatDiffReverted] - Callback for format diff reverted
 * @property {function(ext: string): void} [onOpenEditorConfig] - Callback to open editor config modal
 * @property {function(): void} [onOpenThemePicker] - Callback to open theme picker modal
 * @property {function(): void} [onOpenRenameExtension] - Callback to open rename extension modal
 * @property {function(visible: boolean): void} [onConsoleVisibilityChanged] - Callback when console visibility changes
 * @property {boolean} [initialConsoleOpen] - Whether the console should be open
 */
export interface MessageHandlerContext {
  /** The iframe element containing the Monaco editor */
  iframe: HTMLIFrameElement;
  /** Internal function to send response messages to the iframe */
  send: SendFunction;
  /** Reference to the current editor value to avoid closure issues */
  valueRef: { current: string };
  /** Unique context identifier for this editor instance */
  codeContext: string;
  /** The plugin instance */
  plugin: CodeFilesPlugin;
  /** Initialization parameters sent to the iframe */
  initParams: InitParams;
  /** Function to load project files for intellisense and cross-file navigation */
  loadProjectFiles: (send: SendFunction) => Promise<void>;
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
  /** Callback when console visibility changes */
  onConsoleVisibilityChanged?: (visible: boolean) => void;
  /** Whether the console should be open on initialization */
  initialConsoleOpen?: boolean;
}
