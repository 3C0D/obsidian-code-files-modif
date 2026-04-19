# Monaco Editor Reference Sheet

> Based on `monaco-editor` npm package (Microsoft). The editor that powers VS Code.
> API entry point: `monaco.editor` (namespace), `IStandaloneCodeEditor` (editor instance).

---

## Table of Contents

- [Monaco Editor Reference Sheet](#monaco-editor-reference-sheet)
	- [Table of Contents](#table-of-contents)
	- [1. Create an editor](#1-create-an-editor)
	- [2. IEditorOptions — Display](#2-ieditoroptions--display)
	- [3. IEditorOptions — Cursor](#3-ieditoroptions--cursor)
	- [4. IEditorOptions — Editing behavior](#4-ieditoroptions--editing-behavior)
	- [5. IEditorOptions — IntelliSense](#5-ieditoroptions--intellisense)
		- [Registering a SignatureHelpProvider (required for custom languages)](#registering-a-signaturehelpprovider-required-for-custom-languages)
	- [6. Diff editor](#6-diff-editor)
	- [7. Default keyboard shortcuts](#7-default-keyboard-shortcuts)
	- [8. Custom keybindings](#8-custom-keybindings)
	- [9. Actions (with label + context menu)](#9-actions-with-label--context-menu)
	- [10. Models (multi-file)](#10-models-multi-file)
	- [11. Decorations](#11-decorations)
	- [12. Markers (errors / warnings)](#12-markers-errors--warnings)
	- [13. Language providers](#13-language-providers)
	- [14. Custom language with Monarch](#14-custom-language-with-monarch)
	- [15. Textmate grammars](#15-textmate-grammars)
	- [16. Useful events](#16-useful-events)
	- [17. What Monaco cannot do out of the box](#17-what-monaco-cannot-do-out-of-the-box)

---

## 1. Create an editor

```ts
import * as monaco from 'monaco-editor';

const editor = monaco.editor.create(
  document.getElementById('container')!,
  {
    value: '// start typing...',
    language: 'typescript',
    theme: 'vs-dark',
  }
);

// Always dispose when done (clears model listeners, DOM references, workers)
editor.dispose();
```

---

## 2. IEditorOptions — Display

```ts
editor.updateOptions({
  theme: 'vs' | 'vs-dark' | 'hc-black',

  fontSize: 14,
  fontFamily: 'Fira Code, monospace',
  // Requires a font with ligature support (e.g. Fira Code, Cascadia Mono) 
  fontLigatures: true,
  lineHeight: 22,

  // 'on' | 'off' | 'relative' | ((lineNumber: number) => string)
  // Use a function for fully custom line number rendering
  lineNumbers: 'on',

  // Margin between line numbers and editor content; used for breakpoint icons etc.
  glyphMargin: true,

  folding: true,
  // 'mouseover': fold arrows only visible on hover; 'always': always visible
  showFoldingControls: 'mouseover',

  minimap: {
    enabled: true,
    side: 'right',        // 'right' | 'left'
    renderCharacters: false,
    maxColumn: 120,
  },

  // 'off' | 'on' | 'wordWrapColumn' | 'bounded'
  // 'wordWrapColumn': wraps at wordWrapColumn chars
  // 'bounded': wraps at min(viewport width, wordWrapColumn)
  wordWrap: 'off',
  wordWrapColumn: 120,

  // How wrapped lines are indented relative to their parent line
  // 'none' | 'same' | 'indent' | 'deepIndent'
  wrappingIndent: 'same',

  // 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  renderWhitespace: 'none',

  // Vertical guide lines at specific columns
  rulers: [80, 120],

  bracketPairColorization: { enabled: true },

  occurrencesHighlight: 'singleFile',
});
```

---

## 3. IEditorOptions — Cursor

```ts
editor.updateOptions({
  cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin',

  // Animation style of the blinking cursor
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid',

  // Animates cursor movement between positions (like VS Code)
  cursorSmoothCaretAnimation: 'on' | 'off' | 'explicit',

  // Minimum number of lines always visible above/below the cursor when scrolling
  cursorSurroundingLines: 3,

  // Smooth scroll animation when the editor scrolls to a position programmatically
  smoothScrolling: true,

  // Allows scrolling past the last line (useful to keep last line centered)
  scrollBeyondLastLine: true,
});
```

---

## 4. IEditorOptions — Editing behavior

```ts
editor.updateOptions({
  readOnly: false,

  // Automatically recomputes layout when the container DOM element is resized.
  // Should be true in modals or tab-based UIs where the editor starts hidden.
  automaticLayout: true,

  tabSize: 2,
  insertSpaces: true,

  // When true, overrides tabSize and insertSpaces by analyzing the file content.
  // Set to false if you want to enforce your own config unconditionally.
  detectIndentation: false,

  formatOnPaste: true,
  formatOnType: false,  // requires a registered formatter for the language

  // 'none' | 'keep' | 'brackets' | 'advanced' | 'full'
  // 'advanced': indent/dedent based on language bracket rules
  // 'full': like 'advanced' but also reformats on type — requires a formatter
  autoIndent: 'advanced',

  // Hold Alt (or Ctrl) to place additional cursors
  multiCursorModifier: 'alt' | 'ctrlCmd',

  // Selects columns when dragging with mouse (rectangular selection)
  columnSelection: false,
});
```

---

## 5. IEditorOptions — IntelliSense

```ts
editor.updateOptions({
  // Where snippets appear in the suggestion list relative to other items
  // 'top' | 'bottom' | 'inline' | 'none'
  snippetSuggestions: 'inline',

  // Show suggestions while typing (can be boolean or fine-grained object)
  quickSuggestions: {
    other: 'on',
    comments: 'off',
    strings: 'off',
  },

  // Trigger suggestions automatically on language-specific characters (e.g. '.' in JS)
  suggestOnTriggerCharacters: true,

  // Whether pressing Enter accepts the highlighted suggestion
  acceptSuggestionOnEnter: 'smart', // 'on' | 'off' | 'smart'

  // Tab completion: cycle through suggestions with Tab
  tabCompletion: 'on',

  // Signature help: the popup showing function parameters as you type
  // Only works if a SignatureHelpProvider is registered for the language.
  // JS/TS get this for free via the built-in TypeScript worker.
  parameterHints: {
    enabled: true,
    // If true, pressing the trigger key again cycles through overloads
    cycle: false,
  },

  // Delay before hover tooltip appears (ms)
  hover: {
    enabled: true,
    delay: 300,
    sticky: true, // tooltip stays open when you move the mouse into it
  },
});
```

### Registering a SignatureHelpProvider (required for custom languages)

```ts
// parameterHints does nothing unless this is registered for your language.
monaco.languages.registerSignatureHelpProvider('mylang', {
  signatureHelpTriggerCharacters: ['(', ','],
  provideSignatureHelp: (model, position) => ({
    value: {
      signatures: [{
        label: 'myFunc(a: string, b: number): void',
        documentation: 'Does something useful.',
        parameters: [
          { label: 'a: string', documentation: 'First arg' },
          { label: 'b: number', documentation: 'Second arg' },
        ],
      }],
      activeSignature: 0,
      activeParameter: 0, // highlights the correct parameter based on cursor position
    },
    dispose: () => {},
  }),
});
```

---

## 6. Diff editor

```ts
const diffEditor = monaco.editor.createDiffEditor(container, {
  renderSideBySide: true,     // false = inline diff
  ignoreTrimWhitespace: true, // ignores leading/trailing whitespace changes
  originalEditable: false,    // make the left pane read-only
});

diffEditor.setModel({
  original: monaco.editor.createModel(oldContent, 'typescript'),
  modified: monaco.editor.createModel(newContent, 'typescript'),
});
```

---

## 7. Default keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Space` | Trigger IntelliSense suggestions |
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+/` | Toggle line comment |
| `Shift+Alt+A` | Toggle block comment |
| `Alt+↑ / Alt+↓` | Move line up / down |
| `Shift+Alt+↑ / ↓` | Duplicate line up / down |
| `Ctrl+D` | Select next occurrence of selection |
| `Ctrl+Shift+L` | Select all occurrences |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find and replace |
| `Ctrl+G` | Go to line |
| `F12` | Go to Definition |
| `Shift+F12` | Find all References |
| `F2` | Rename symbol |
| `Shift+Alt+F` | Format document |
| `Ctrl+Z / Ctrl+Y` | Undo / Redo |
| `Alt+Click` | Add cursor at clicked position |
| `Ctrl+Alt+↑ / ↓` | Add cursor above / below |

---

## 8. Custom keybindings

```ts
// Add a keybinding — works as Ctrl+S on Windows/Linux, Cmd+S on macOS
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
  console.log('save triggered');
});

// Remove a built-in keybinding by passing null as the handler.
// Useful to prevent Monaco from intercepting browser/Obsidian shortcuts.
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, null!);

// Combine modifiers
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
  () => { /* format */ }
);
```

---

## 9. Actions (with label + context menu)

```ts
// More powerful than addCommand: appears in the Command Palette and right-click menu
editor.addAction({
  id: 'save-file',             // unique ID, used to trigger it programmatically
  label: 'Save File',          // shown in Command Palette and context menu
  keybindings: [
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
  ],
  // The group that appears in the right-click context menu
  contextMenuGroupId: 'navigation',
  contextMenuOrder: 1.5,       // lower = higher in the group
  run: (ed) => {
    // ed is the editor instance
    const value = ed.getValue();
    console.log('saving:', value);
  },
});

// Trigger an action programmatically (built-in or custom)
editor.trigger('source', 'editor.action.formatDocument', {});
editor.trigger('source', 'save-file', {});
```

---

## 10. Models (multi-file)

```ts
// A model is the data layer (content + language + URI).
// An editor is just a view — you can swap models without recreating the editor.

const model = monaco.editor.createModel(
  content,
  'typescript',
  monaco.Uri.parse('file:///src/main.ts') // URI is used by providers to resolve imports
);

editor.setModel(model);

// Save and restore view state (cursor, scroll, folding) when switching files
const savedState = editor.saveViewState();
editor.setModel(otherModel);
editor.restoreViewState(savedState);

// Retrieve a model by URI (useful in providers to resolve cross-file references)
const existing = monaco.editor.getModel(monaco.Uri.parse('file:///src/other.ts'));

model.getValue();             // get full content as string
model.setValue('new content');
model.getLineCount();
model.getLineContent(1);

// Programmatic edits — these go through the undo stack
model.pushEditOperations([], [{
  range: new monaco.Range(1, 1, 1, 5),
  text: 'hello',
}], () => null);

model.dispose(); // always dispose models you no longer need
```

---

## 11. Decorations

```ts
// Decorations are visual overlays: background colors, icons in the gutter, etc.
// They do NOT affect the text content.

const collection = editor.createDecorationsCollection([
  {
    range: new monaco.Range(2, 1, 2, 1), // line 2, whole line
    options: {
      isWholeLine: true,
      className: 'my-line-highlight',         // CSS class on the line content
      glyphMarginClassName: 'my-glyph-icon',  // CSS class in the glyph margin
      overviewRuler: {
        color: '#ff0000',
        position: monaco.editor.OverviewRulerLane.Left,
      },
    },
  },
]);

// Update decorations later
collection.set([/* new decoration list */]);

// Remove all decorations in this collection
collection.clear();
```

---

## 12. Markers (errors / warnings)

```ts
// Markers are the red/yellow underlines. They appear in the Problems panel
// and as squiggles in the editor. Unlike decorations, they carry semantic meaning.

monaco.editor.setModelMarkers(model, 'my-linter', [
  {
    severity: monaco.MarkerSeverity.Error,   // Error | Warning | Info | Hint
    message: 'Unexpected token',
    startLineNumber: 3,
    startColumn: 5,
    endLineNumber: 3,
    endColumn: 12,
    // Optional: links the marker to a diagnostic code (shown as a link in the tooltip)
    code: { value: 'E001', target: monaco.Uri.parse('https://my-docs/E001') },
  },
]);

// Clear markers for a given owner
monaco.editor.setModelMarkers(model, 'my-linter', []);
```

---

## 13. Language providers

All providers are registered globally on the `monaco.languages` namespace and apply to all editors sharing models of the given language.

```ts
// --- Completion ---
monaco.languages.registerCompletionItemProvider('mylang', {
  triggerCharacters: ['.'],
  provideCompletionItems: (model, position) => {
    const word = model.getWordUntilPosition(position);
    return {
      suggestions: [{
        label: 'myFunction',
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: 'myFunction(${1:arg})',
        // InsertAsSnippet enables tab stops ($1, $2...) in insertText
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: 'Does something.',
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        },
      }],
    };
  },
});

// --- Hover ---
monaco.languages.registerHoverProvider('mylang', {
  provideHover: (model, position) => ({
    contents: [
      { value: '**myFunction**' },   // Markdown is supported
      { value: 'Does something.' },
    ],
  }),
});

// --- Go to Definition ---
monaco.languages.registerDefinitionProvider('mylang', {
  provideDefinition: (model, position) => ({
    uri: monaco.Uri.parse('file:///src/other.ts'),
    range: new monaco.Range(10, 1, 10, 20),
  }),
});

// --- Code actions (lightbulb / quick fix) ---
monaco.languages.registerCodeActionProvider('mylang', {
  provideCodeActions: (model, range, context) => ({
    actions: [{
      title: 'Fix this issue',
      kind: 'quickfix',
      edit: {
        edits: [{
          resource: model.uri,
          textEdit: { range, text: 'fixed text' },
        }],
      },
    }],
    dispose: () => {},
  }),
});
```

---

## 14. Custom language with Monarch

Monarch is Monaco's built-in tokenizer. It uses regex rules — simpler than Textmate grammars but sufficient for most custom DSLs.

```ts
monaco.languages.register({ id: 'mylang' });

// Monarch tokenizer: each rule is [regex, token_type]
// Token types map to CSS classes: e.g. 'keyword' → 'mtk...' class
monaco.languages.setMonarchTokensProvider('mylang', {
  keywords: ['if', 'else', 'return', 'function'],

  tokenizer: {
    root: [
      // Keywords — check against the list above
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@default': 'identifier',
        },
      }],

      // Strings
      [/".*?"/, 'string'],
      [/'.*?'/, 'string'],

      // Numbers
      [/\d+(\.\d+)?/, 'number'],

      // Line comments
      [/\/\/.*$/, 'comment'],

      // Whitespace (ignored visually but needed to advance the tokenizer)
      [/\s+/, 'white'],
    ],
  },
});

// Register bracket configuration for auto-close and bracket matching
monaco.languages.setLanguageConfiguration('mylang', {
  brackets: [['(', ')'], ['{', '}'], ['[', ']']],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
});
```

---

## 15. Textmate grammars

Monaco's native tokenizer is Monarch. Textmate grammars (`.tmLanguage`, `.tmLanguage.json`) are **not supported natively**.

To use them, you need:

```
monaco-editor + vscode-oniguruma + vscode-textmate + monaco-tm
```

| Package | Role |
|---------|------|
| `vscode-oniguruma` | Compiles Oniguruma (Textmate's regex engine) to WASM |
| `vscode-textmate` | Parses `.tmLanguage` grammars |
| `monaco-tm` | Bridges vscode-textmate output to Monaco's token provider API |

**In practice:** this adds a WASM file to your bundle and non-trivial setup. For simple custom languages in Obsidian plugins, writing a Monarch tokenizer is far easier (a few dozen lines). Only consider Textmate if you need an exact match with an existing VS Code language extension.

---

## 16. Useful events

```ts
// Content changed — fires on every keystroke / programmatic edit
editor.onDidChangeModelContent((e) => {
  // e.changes: list of { range, text, rangeLength }
});

// Cursor moved
editor.onDidChangeCursorPosition((e) => {
  console.log(e.position); // { lineNumber, column }
});

// Selection changed
editor.onDidChangeCursorSelection((e) => {
  console.log(e.selection); // { startLineNumber, startColumn, endLineNumber, endColumn }
});

// Editor gained / lost focus
editor.onDidFocusEditorWidget(() => { /* ... */ });
editor.onDidBlurEditorWidget(() => { /* ... */ });

// Model swapped (e.g. after setModel())
editor.onDidChangeModel((e) => {
  // e.oldModelUrl, e.newModelUrl
});

// Scroll position changed
editor.onDidScrollChange((e) => {
  // e.scrollTop, e.scrollLeft, e.scrollHeight, e.scrollWidth
});
```

---

## 17. What Monaco cannot do out of the box

| Feature | Workaround |
|---------|------------|
| **VS Code extensions** (`.vsix`) | Not supported. Monaco is the engine, not the full host. |
| **Language Server Protocol (LSP)** | Use `monaco-languageclient` + a WebSocket/web worker LSP server. |
| **Textmate grammars** | See [section 15](#15-textmate-grammars). |
| **Git integration** | Out of scope — VS Code layers this on top of Monaco. |
| **Integrated terminal** | Out of scope. |
| **Vim / Emacs keybindings** | Use `@codingame/monaco-editor-wrapper` which exposes `updateEditorKeybindingsMode`. |
