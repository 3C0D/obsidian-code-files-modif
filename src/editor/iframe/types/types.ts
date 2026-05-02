// Globals injected by <script> tags before monacoBundle.js
// Monaco is loaded by AMD loader, Prettier by standalone scripts

/** Configuration options for Prettier code formatting. */
export interface PrettierOptions {
	parser: string;
	plugins: unknown[];
	printWidth?: number;
	tabWidth?: number;
	useTabs?: boolean;
	proseWrap?: string;
}

// Mirrors HotkeyConfig from src/types/types.ts — duplicated because the iframe bundle
// cannot import from the main plugin scope.
export interface HotkeyConfig {
	key: string;
	modifiers: string[];
}

export interface ProjectFile {
	path: string;
	content: string;
}

/** Parameters used to initialize the Monaco editor iframe. */
export interface InitParams {
	context: string;
	lang?: string;
	theme?: string;
	themeData?: string;
	folding?: boolean;
	lineNumbers?: boolean;
	minimap?: boolean;
	wordWrap?: string;
	editorConfig?: string;
	commandPaletteHotkey?: HotkeyConfig | null;
	settingsHotkey?: HotkeyConfig | null;
	deleteFileHotkey?: HotkeyConfig | null;
	noSemanticValidation?: boolean;
	noSyntaxValidation?: boolean;
	projectRootFolder?: string;
	isUnregisteredExtension?: boolean;
}

/**
 * Editor configuration object that can be extended with custom properties.
 * The `[key: string]: unknown` allows for JSONC extensibility.
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
