/**
 * Discriminated union type for all messages sent from the Monaco iframe to the parent window.
 * This replaces unsafe `as` casts with proper type narrowing.
 */
export type IframeMessage =
  // Special message without context (handled before context validation)
  | { type: 'ready' }
  // Used for explorer-shortcuts relay
  | { type: 'keydown-relay'; key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
  | { type: 'keyup-relay'; key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

  // Messages with context (validated against codeContext)
  | { type: 'open-formatter-config'; context: string }
  | { type: 'open-theme-picker'; context: string }
  | { type: 'open-settings'; context: string }
  | { type: 'delete-file'; context: string }
  | { type: 'open-obsidian-palette'; context: string }
  | { type: 'open-rename-extension'; context: string }
  | { type: 'return-to-default-view'; context: string }
  | { type: 'format-diff-available'; context: string }
  | { type: 'format-diff-reverted'; context: string }
  | { type: 'change'; context: string; value: string }
  | { type: 'save-document'; context: string }
  | { type: 'word-wrap-toggled'; context: string; wordWrap: 'on' | 'off' }
  | {
      type: 'open-file';
      context: string;
      path: string;
      position: { lineNumber: number; column: number } | null;
    }
  | { type: 'toggle-console'; context: string }
  | { type: 'toggle-shell'; context: string }
  | { type: 'run-command'; context: string; cmd: string }
  | { type: 'console-height-changed'; context: string; height: number }
  | { type: 'console-visibility-changed'; context: string; visible: boolean }
  | { type: 'send-stdin'; context: string; text: string }
  | { type: 'send-stdin-eof'; context: string }
  | { type: 'console-notify'; context: string; text: string }
  | { type: 'stop-command'; context: string };
