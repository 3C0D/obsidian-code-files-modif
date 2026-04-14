// Monaco Editor HTML Configuration Variables
// Centralized configuration for customizable values used in monacoEditor.html

// ===== Diff Modal Configuration =====

// Monaco Diff Editor Options
var DIFF_EDITOR_OPTIONS = {
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
var FORMAT_CHANGE_TIMEOUT = 3000;

// ===== Prettier Configuration =====

// Prose wrap mode: 'always', 'never', or 'preserve'
var PRETTIER_PROSE_WRAP = 'always';

// Maximum line width for Prettier formatting
var PRETTIER_PRINT_WIDTH = 80;

// Tab width for Prettier formatting (synced with Monaco tabSize)
var PRETTIER_TAB_WIDTH = 4;

// Use tabs instead of spaces (synced with Monaco insertSpaces)
var PRETTIER_USE_TABS = false;
