// Monaco Editor Iframe Variables
// Centralized variables and configuration constants for the iframe bundle

// ===== Diff Modal Configuration =====

// Monaco Diff Editor Options
export const DIFF_EDITOR_OPTIONS = {
	// readOnly: false allows pushEditOperations (for revertBlock)
	// domReadOnly: true blocks keyboard input but keeps programmatic edits
	readOnly: false,
	domReadOnly: true,

	// Show side-by-side comparison (true) or inline diff (false)
	renderSideBySide: true,

	// Automatically adjust layout when container size changes
	automaticLayout: true,

	// Show whitespace changes (spaces, tabs, line breaks)
	// Set to true to ignore whitespace-only changes
	ignoreTrimWhitespace: false,

	// Allow resizing the split between original and modified
	enableSplitViewResizing: true
};

// Timeout (ms) to wait for format changes before giving up
export const FORMAT_CHANGE_TIMEOUT = 3000;

// ===== Prettier Configuration =====

// Prose wrap mode: 'always', 'never', or 'preserve'
export let PRETTIER_PROSE_WRAP = 'always';

// Maximum line width for Prettier formatting
export let PRETTIER_PRINT_WIDTH = 80;

// Tab width for Prettier formatting (synced with Monaco tabSize)
export let PRETTIER_TAB_WIDTH = 4;

// Use tabs instead of spaces (synced with Monaco insertSpaces)
export let PRETTIER_USE_TABS = false;

// Setters for runtime updates
export function setPrettierProseWrap(value: string): void {
	PRETTIER_PROSE_WRAP = value;
}

export function setPrettierPrintWidth(value: number): void {
	PRETTIER_PRINT_WIDTH = value;
}

export function setPrettierTabWidth(value: number): void {
	PRETTIER_TAB_WIDTH = value;
}

export function setPrettierUseTabs(value: boolean): void {
	PRETTIER_USE_TABS = value;
}