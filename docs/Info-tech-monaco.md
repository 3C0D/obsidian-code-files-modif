# Monaco Editor Reference Sheet

> Based on `monaco-editor` npm package (Microsoft). The editor that powers VS Code.
> API entry point: `monaco.editor` (namespace), `IStandaloneCodeEditor` (editor instance).

---

## Table of Contents

- [Monaco Editor Reference Sheet](#monaco-editor-reference-sheet)
	- [Table of Contents](#table-of-contents)
- [1. Create an editor](#1-create-an-editor)
- [2. IEditorOptions — Display](#2-ieditoroptions--display)
- [3. IEditorOptions — Editing behavior](#3-ieditoroptions--editing-behavior)
- [4. Diff editor](#4-diff-editor)
- [5. Default keyboard shortcuts](#5-default-keyboard-shortcuts)
- [6. Custom keybindings](#6-custom-keybindings)
- [7. Actions (with label + context menu)](#7-actions-with-label--context-menu)
- [8. Models (multi-file)](#8-models-multi-file)
- [9. Textmate grammars](#9-textmate-grammars)
- [10. Useful events](#10-useful-events)
- [11. What Monaco cannot do out of the box](#11-what-monaco-cannot-do-out-of-the-box)

---

## 1. Create an editor

Creates a Monaco Editor instance in a DOM container.

`const editor = monaco.editor.create` in `src/editor/iframe/init.ts:216` with options like `value`, `language`, `theme`.

Always call `editor.dispose()` when done (clears model listeners, DOM references, workers).

---

## 2. IEditorOptions — Display

Options to control the visual appearance of the editor (theme, font, minimap, etc.).

`editor.updateOptions` in `src/editor/iframe/init.ts:97` with options like `theme: 'vs' | 'vs-dark' | 'hc-black'`, `fontSize: 14`, `fontFamily: 'Fira Code'`, `fontLigatures: requires ligature font`, `lineHeight: 22`, `lineNumbers: 'on'`, `glyphMargin: true`, `folding: true`, `showFoldingControls: 'mouseover'`, `minimap: { enabled: true, side: 'right', renderCharacters: false, maxColumn: 120 }`, `wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded'`, `wordWrapColumn: 120`, `wrappingIndent: 'same'`, `renderWhitespace: 'none'`, `rulers: [80, 120]`, `bracketPairColorization: { enabled: true }`, `occurrencesHighlight: 'singleFile'`.

---

## 3. IEditorOptions — Editing behavior

Options to control editing behavior (indentation, formatting, selections, etc.).

`editor.updateOptions` in `src/editor/iframe/init.ts:75-92` with options like `readOnly: false`, `automaticLayout: true`, `tabSize: 2`, `insertSpaces: true`, `detectIndentation: false`, `formatOnPaste: true`, `formatOnType: false`, `autoIndent: 'advanced'`, `multiCursorModifier: 'alt' | 'ctrlCmd'`, `columnSelection: false`.

---

## 4. Diff editor

Creates a diff editor to compare two versions of code.

`monaco.editor.createDiffEditor` in `src/editor/iframe/diff.ts:439-440` with options like `renderSideBySide: true`, `ignoreTrimWhitespace: true`, `originalEditable: false`. Then `diffEditor.setModel` with `original` and `modified` models.

---

## 5. Default keyboard shortcuts

Default keyboard shortcuts in Monaco Editor.

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

## 6. Custom keybindings

Add or remove custom keyboard shortcuts for editor actions.

`editor.addCommand` in `src/editor/iframe/actions.ts:82` with key combinations like `monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS` to add or remove keybindings. Pass `null` as handler to remove built-in bindings.

---

## 7. Actions (with label + context menu)

Add custom actions that appear in the Command Palette and right-click context menu.

`editor.addAction` in `src/editor/iframe/actions.ts:67-186` with `id`, `label`, `keybindings`, `contextMenuGroupId`, `contextMenuOrder`, `run`. Trigger with `editor.trigger('source', 'actionId')`.

---

## 8. Models (multi-file)

Manage text models for multi-file editing (content, language, URI).

`monaco.editor.createModel` in `src/editor/iframe/init.ts:212` with content, language, URI. `editor.setModel(model)`, `editor.saveViewState()`/`restoreViewState(state)`. `model.getValue()`, `setValue()`, `pushEditOperations()`. `monaco.editor.getModel(uri)` by URI.

---

## 9. Textmate grammars

Using Textmate grammars for syntax highlighting (not natively supported, requires additional packages).

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

## 10. Useful events

Event listeners for editor state changes (content, cursor, focus, etc.).

`editor.onDidChangeModelContent` in `src/editor/iframe/init.ts:112,292` for content changes, `onDidChangeCursorPosition` for cursor moves, `onDidChangeCursorSelection` for selections, `onDidFocusEditorWidget`/`onDidBlurEditorWidget` for focus, `onDidChangeModel` for model swaps, `onDidScrollChange` for scrolling.

---

## 11. What Monaco cannot do out of the box

Features not available in Monaco by default.

| Feature | Workaround |
|---------|------------|
| **VS Code extensions** (`.vsix`) | Not supported. Monaco is the engine, not the full host. |
| **Language Server Protocol (LSP)** | Use `monaco-languageclient` + a WebSocket/web worker LSP server. |
| **Textmate grammars** | See [section 15](#15-textmate-grammars). |
| **Git integration** | Out of scope — VS Code layers this on top of Monaco. |
| **Integrated terminal** | Out of scope. |
| **Vim / Emacs keybindings** | Use `@codingame/monaco-editor-wrapper` which exposes `updateEditorKeybindingsMode`. |
