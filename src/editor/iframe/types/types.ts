// Globals injected by <script> tags before monacoBundle.js
// Monaco is loaded by AMD loader, Prettier by standalone scripts

/** Flattens intersected types into a single object shape for readable IDE tooltips. */

/** Configuration options for Prettier code formatting.
 *
 * @property {string} parser - Prettier parser to use
 * @property {unknown[]} plugins - Prettier plugins to load
 * @property {number} [printWidth] - Line width (default: 80)
 * @property {number} [tabSize] - Tab width
 * @property {boolean} [useTabs] - Use tabs instead of spaces
 * @property {string} [proseWrap] - Prose wrap mode
 */
export interface PrettierOptions {
  parser: string;
  plugins: unknown[];
  printWidth?: number;
  tabWidth?: number;
  useTabs?: boolean;
  proseWrap?: string;
}

/** Mirrors HotkeyConfig from src/types/types.ts.
 *
 * @property {string} key - The main key (e.g. 'a')
 * @property {string[]} modifiers - Array of modifier keys (e.g. ['Mod', 'Shift'])
 */
export interface HotkeyConfig {
  key: string;
  modifiers: string[];
}

/** Represents a project file for IntelliSense.
 *
 * @property {string} path - Vault-relative path
 * @property {string} content - File content
 */
export interface ProjectFile {
  path: string;
  content: string;
}

/** Parameters used to initialize the Monaco editor iframe.
 *
 * @property {string} context - Unique identifier for this editor instance (file path or modal ID)
 * @property {string} [lang] - Monaco language ID
 * @property {string} [theme] - Resolved Monaco theme ID
 * @property {string} [themeData] - Theme data JSON string for custom themes
 * @property {boolean} [folding] - Enable code block folding
 * @property {boolean} [lineNumbers] - Show line numbers
 * @property {boolean} [minimap] - Show the minimap
 * @property {'on' | 'off'} [wordWrap] - Word wrap mode
 * @property {string} [editorConfig] - Merged editor configuration as JSON string
 * @property {HotkeyConfig | null} [commandPaletteHotkey] - Hotkey for opening the command palette
 * @property {HotkeyConfig | null} [settingsHotkey] - Hotkey for opening the plugin settings
 * @property {HotkeyConfig | null} [deleteFileHotkey] - Hotkey for deleting the current file
 * @property {boolean} [noSemanticValidation] - Advanced type checking for JS/TS
 * @property {boolean} [noSyntaxValidation] - Basic syntax error checking for JS/TS
 * @property {string} [projectRootFolder] - Vault-relative path for the project root
 * @property {boolean} [isUnregisteredExtension] - Whether the file extension is unregistered
 * @property {string} [background] - Background color for the iframe
 * @property {number} [consoleHeight] - Height of the integrated console
 */
export interface InitParams {
  /** Unique identifier for this editor instance (file path or modal ID) */
  context: string;
  /** Monaco language ID */
  lang?: string;
  /** Resolved Monaco theme ID */
  theme?: string;
  /** Theme data JSON string for custom themes */
  themeData?: string;
  /** Enable code block folding */
  folding?: boolean;
  /** Show line numbers */
  lineNumbers?: boolean;
  /** Show the minimap */
  minimap?: boolean;
  /** Word wrap mode ('on' or 'off') */
  wordWrap?: 'on' | 'off';
  /** Merged editor configuration (from .editorconfig or plugin settings) as JSON string */
  editorConfig?: string;
  /** Hotkey for opening the command palette */
  commandPaletteHotkey?: HotkeyConfig | null;
  /** Hotkey for opening the plugin settings */
  settingsHotkey?: HotkeyConfig | null;
  /** Hotkey for deleting the current file */
  deleteFileHotkey?: HotkeyConfig | null;
  /** Advanced type checking and IntelliSense for JS/TS (inverse of plugin settings) */
  noSemanticValidation?: boolean;
  /** Basic syntax error checking for JS/TS (inverse of plugin settings) */
  noSyntaxValidation?: boolean;
  /** Vault-relative path for the project root */
  projectRootFolder?: string;
  /** Whether the file extension is not registered as a code file */
  isUnregisteredExtension?: boolean;
  /** Background color for the iframe (usually 'transparent') */
  background?: string;
  /** Height of the integrated console in pixels */
  consoleHeight?: number;
}

/**
 * Editor configuration object that can be extended with custom properties.
 * The `[key: string]: unknown` allows for JSONC extensibility.
 *
 * @property {number} [tabSize] - Tab size (default: 4)
 * @property {boolean} [insertSpaces] - Use spaces instead of tabs (default: true)
 * @property {boolean} [formatOnSave] - Format code on save (default: true)
 * @property {number} [printWidth] - Line width for formatting (default: 120)
 * @property {string} [proseWrap] - Prose wrap mode (default: 'preserve')
 * @property {unknown} [key] - Additional configuration properties (index signature)
 */
export interface EditorConfig {
  tabSize?: number;
  insertSpaces?: boolean;
  formatOnSave?: boolean;
  printWidth?: number;
  proseWrap?: string;
  [key: string]: unknown;
}

// Use global declarations to avoid "unused" errors
declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const monaco: typeof import('monaco-editor');
  const prettier: {
    format(source: string, options: PrettierOptions): Promise<string>;
  };
  const prettierPlugins: {
    markdown: unknown;
    estree: unknown;
    typescript: unknown;
    babel: unknown;
    postcss: unknown;
    html: unknown;
    yaml: unknown;
    graphql: unknown;
  };

  interface Window {
    _initialized?: boolean;
    _pendingProjectFiles?: ProjectFile[] | null;
    mermaidFormatter?: {
      formatMermaid(source: string): string;
      formatMarkdownMermaidBlocks(source: string): string;
    };
    clangFormatter?: {
      init(wasmUrl: string): Promise<void>;
      format(source: string): string;
    };
    ruffFormatter?: {
      init(wasmUrl: string): Promise<void>;
      format(source: string, filename: null, options: object): string;
    };
    gofmtFormatter?: {
      init(wasmUrl: string): Promise<void>;
      format(source: string): string;
    };
    __CLANG_WASM_URL__?: string;
    __RUFF_WASM_URL__?: string;
    __GOFMT_WASM_URL__?: string;
  }
}
