import type { MyPluginSettings } from './types.ts';

// ===== Editor Configuration =====

/**
 * Default Monaco editor options applied when no per-extension config exists.
 *
 * Convention:
 * - Uncommented = values we explicitly chose (may differ from Monaco's own defaults)
 * - Commented = uncommenting will override the default behavior
 */
export const DEFAULT_EDITOR_CONFIG = `{
    // Options here override global settings for this extension (like VSCode workspace settings).
    // --- Indentation ---
    "tabSize": 4,
    "insertSpaces": false,

    // --- On Save / On Type ---
    "formatOnSave": false,
    "formatOnType": false,
    "trimAutoWhitespace": true,
    "trimTrailingWhitespace": true,

    // --- Formatting ---
    "printWidth": 100,  // Line length for Prettier formatters

    // --- Display ---
    "renderWhitespace": "selection", // "none" | "boundary" | "selection" | "all"
    // "folding": false,
    // "lineNumbers": "off",
    // "minimap": { "enabled": false },
    // "wordWrap": "on",  // "on" | "off"

    // --- Optional ---
    // "rulers": [80, 120],  // Visual guides for line length (all languages)
    // "fontSize": 14,
    // "bracketPairColorization.enabled": true,
}`;

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
  extensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'json',
    'jsonc',
    'css',
    'html',
    'sh',
    'yaml',
    'sql',
    'php',
    'cs',
    'java',
    'go',
    'rs',
    'cpp',
    'c'
  ],
  semanticValidation: true,
  syntaxValidation: true,
  theme: 'default',
  recentThemes: [],
  autoSave: false,
  editorBrightness: 1,
  wordWrap: 'off',
  folding: true,
  lineNumbers: true,
  minimap: true,
  editorConfigs: { '*': DEFAULT_EDITOR_CONFIG },
  allExtensions: false,
  excludedExtensions: [...OBSIDIAN_NATIVE_EXTENSIONS],
  extraExtensions: [],
  maxFileSize: 10,
  projectRootFolder: '',
  lastSelectedConfigExtension: '',
  commandPaletteHotkeyOverride: '',
  settingsHotkeyOverride: '',
  deleteFileHotkeyOverride: '',
  consoleHotkey: '',
  excludedFolders: ['.git', 'node_modules', '.trash'],
  revealedItems: {},
  isAutoRevealRegisteredDotfile: true,
  temporaryRevealedPaths: [],
  consoleHeight: 200,
  consoleHistories: {}
};

// ===== Formatter Extensions =====

/**
 * Extensions that have integrated formatters.
 * These are the only extensions that should appear in the Editor Config extension selector.
 *
 * Formatters:
 * - Prettier: js, jsx, ts, tsx, css, scss, less, html, json, jsonc, yaml, yml, graphql, md
 * - Mermaid: mmd
 * - Ruff: py
 * - gofmt: go
 * - clang-format: c, cpp, cc, cxx, h, hpp
 */
export const FORMATTABLE_EXTENSIONS = [
  // Prettier-supported
  'js',
  'jsx',
  'cjs',
  'mjs',
  'es6',
  'ts',
  'tsx',
  'cts',
  'mts',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'graphql',
  'gql',
  'md',
  'mdx',
  'markdown',
  // Mermaid
  'mmd',
  'mermaid',
  // Python (Ruff)
  'py',
  // Go (gofmt)
  'go',
  // C/C++ (clang-format)
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'hh',
  'hxx'
];

/** Default per-extension config — empty override, only add what differs from global */
export const DEFAULT_EXTENSION_CONFIG = `{
    // Override global config for this extension only.
    // Example:
    // "tabSize": 2,
    // "printWidth": 80,
    // "trimTrailingWhitespace": false,
}`;


/** Built-in Monaco themes that don't require external JSON files */
export const BUILTIN_THEMES = ['vs', 'vs-dark', 'hc-black', 'hc-light', 'default'];

/** Extensions to exclude from file lists (binary executables, archives, and files that can't be opened as text) */
export const EXCLUDED_EXTENSIONS = [
  // Executables and libraries
  'exe',
  'dll',
  'so',
  'dylib',
  'app',
  'dmg',
  'msi',
  // Archives
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'xz',
  // Database files
  'db',
  'sqlite',
  'mdb',
  // Office binary formats
  'doc',
  'xls',
  'ppt',
  // Fonts
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot'
];

// ===== Misc Constants =====

/** Obsidian view type identifier for the Monaco editor */
export const viewType = 'code-editor';

/** Duration (ms) the diff button stays visible in tab header after formatting */
export const DIFF_BUTTON_DISPLAY_DURATION = 10000;
