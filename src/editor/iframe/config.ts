// Monaco Editor HTML Configuration
// Re-exports from variables.ts for convenience.
// This module provides an indirection layer between the iframe bundle
// and variables.ts, allowing dynamic configuration updates from the parent window
// without exposing the full variables.ts API to the iframe scope.

export {
	DIFF_EDITOR_OPTIONS,
	FORMAT_CHANGE_TIMEOUT,
	PRETTIER_PROSE_WRAP,
	PRETTIER_PRINT_WIDTH,
	PRETTIER_TAB_WIDTH,
	PRETTIER_USE_TABS,
	setPrettierProseWrap,
	setPrettierPrintWidth,
	setPrettierTabWidth,
	setPrettierUseTabs
} from './types/variables.js';
