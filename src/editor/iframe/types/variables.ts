/**
 * Runtime constants and Prettier configuration for the iframe bundle.
 * Prettier variables are mutable to allow live updates from the parent window via applyEditorConfig().
 */

// ===== Diff Modal Configuration =====

/** Monaco Diff Editor Options */
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

/** Timeout (ms) to wait for format changes before giving up */
export const FORMAT_CHANGE_TIMEOUT = 3000;

// ===== Format Configuration =====

/** Prose wrap mode: 'always', 'never', or 'preserve' */
export let DEFAULT_PROSE_WRAP = 'always';

/** Maximum line width for formatting */
export let DEFAULT_PRINT_WIDTH = 80;

/** Tab width for formatting (synced with Monaco tabSize) */
export let DEFAULT_TAB_WIDTH = 4;

/** Use tabs instead of spaces (synced with Monaco insertSpaces) */
export let DEFAULT_USE_TABS = false;

/** Runtime setters — called from applyEditorConfig() when the parent sends updated config. */
export function setFormatProseWrap(value: string): void {
  DEFAULT_PROSE_WRAP = value;
}

export function setFormatPrintWidth(value: number): void {
  DEFAULT_PRINT_WIDTH = value;
}

export function setFormatTabWidth(value: number): void {
  DEFAULT_TAB_WIDTH = value;
}

export function setFormatUseTabs(value: boolean): void {
  DEFAULT_USE_TABS = value;
}
