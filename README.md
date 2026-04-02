# Code Files — Obsidian Plugin

Open and edit code files directly in Obsidian using a full Monaco Editor (the same editor as VS Code), with syntax highlighting, folding, line numbers, minimap, and validation.

## Features

- **Monaco Editor** — full VS Code editor embedded in Obsidian, loaded locally (no external dependency)
- **Syntax highlighting** — automatic language detection from file extension, covering all Monaco-supported languages
- **Custom themes** — 50+ themes (Dracula, Monokai, Nord, etc.) with live preview
- **Create code files** — ribbon icon or right-click in the explorer to create a new file with a chosen extension
- **Edit CSS snippets** — open and edit Obsidian CSS snippets directly from the command palette
- **Edit code blocks** — open any code fence in a full Monaco modal from the editor context menu
- **Dynamic extension management** — add or remove file extensions at runtime, no restart needed
- **Rename extension** — right-click any registered file to rename its extension on the fly
- **Formatter config** — per-extension formatting rules (tabSize, insertSpaces, formatOnSave, formatOnType)
- **Word wrap** — toggle with `Alt+Z` or from the editor context menu
- **Manual save** — `Ctrl+S` saves explicitly; with formatOnSave enabled, formats before saving
- **Save indicator** — when Auto Save is off, a small circle appears next to the file extension in the tab title: empty = no unsaved changes, filled white = unsaved changes pending

## Usage

### Opening a file

Files with registered extensions open automatically in Monaco. You can also:
- Use the command **"Open current file in Monaco Editor"**
- Right-click any file → **"Open in Monaco Editor"** (if the extension is registered)

### Creating a file

- Click the ribbon icon (JSON file icon)
- Right-click a folder in the explorer → **"Create Code File"**
- Command palette → **"Create new Code File"**

A modal opens with a filename input, an extension dropdown, and a **+** button to add a new extension on the fly.

### Editing a code block

Place your cursor inside a code fence and use:
- Right-click → **"Edit Code Block in Monaco Editor"**
- Command palette → **"Open current code block in Monaco Editor"**

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save (formats first if formatOnSave is enabled). With Auto Save off, this is the only way to persist changes. |
| `Alt+Z` | Toggle word wrap |
| `F1` | Monaco command palette (all editor actions) |

### Editor settings (gear icon ⚙ in tab header)

Click the gear icon on any code file tab to open the editor settings modal:
- **Top section** — toggles for AutoSave, WordWrap, Folding, Line Numbers, Minimap, Semantic Validation, Syntax Validation
- **Bottom section** — formatter config JSON for the current file's extension (tabSize, insertSpaces, formatOnSave, formatOnType)

Command palette → **"Edit CSS Snippet"** — opens a search modal to choose an existing snippet or create a new one.

### Editor context menu (right-click inside Monaco)

| Action | Description |
|---|---|
| **Rename Extension** | Rename the file's extension on the fly |
| **Change Theme** | Pick a theme with live preview — navigating the list applies it instantly, closing without confirming restores the previous theme |
| **Toggle Word Wrap** | Toggle word wrap (`Alt+Z`) |
| **Save** | Save the file (`Ctrl+S`), formats first if formatOnSave is enabled |

All these actions are also accessible via the Monaco command palette (`F1`), along with all other built-in Monaco actions.

Formatter config is accessible via the gear icon (⚙) in the tab header — it shows the formatter options for the current file's extension.

## Settings

| Setting | Description |
|---|---|
| **Theme** | Monaco editor theme. `Default` follows Obsidian's dark/light mode. Can also be changed live from the editor context menu. |
| **Overwrite background** | Use Obsidian's background color instead of the theme's. Disable if text is illegible. |
| **File Extensions** | Extensions registered with Obsidian. Click **Add / Remove** to manage them. Changes take effect immediately — no restart needed. |
| **Folding** | Enable code block folding in the editor. |
| **Line Numbers** | Show line numbers. |
| **Minimap** | Show the minimap on the right side. |
| **Semantic Validation** | Show semantic errors (type errors, etc.) for JS/TS files. |
| **Syntax Validation** | Show syntax errors for JS/TS files. |
| **Auto Save** | Off by default. When off, changes are only saved with `Ctrl+S` — useful for code files where accidental edits should not be silently persisted. When on, Obsidian saves automatically after each change. A small circle in the tab title indicates save status when Auto Save is off: empty circle = nothing to save, filled white circle = unsaved changes. |
| **Word Wrap** | Toggle word wrap in the editor. Can also be toggled with `Alt+Z`. |

### Managing extensions

The **Add / Remove** button opens a search modal:
- Type an extension name → select **Add ".ext"** to register it
- Type an existing extension → select **Remove ".ext"** to unregister it

Extensions are also manageable from the **Create Code File** modal via the **+** button next to the dropdown.

## Development

```bash
git clone https://github.com/3C0D/obsidian-sample-plugin-modif.git
cd obsidian-sample-plugin-modif
yarn install
```

Create a `.env` file with your vault paths:

```env
TEST_VAULT=C:\path\to\test\vault
REAL_VAULT=C:\path\to\real\vault
```

```bash
yarn start      # Development with hot reload
yarn build      # Production build
yarn real       # Build + install to real vault
yarn acp        # Add-commit-push Git
yarn bacp       # Build + add-commit-push
yarn v          # Update version
yarn h          # Help
```

## Architecture

- `src/mountCodeEditor.ts` — creates the Monaco iframe, handles all postMessage communication
- `src/monacoEditor.html` — the iframe HTML, loaded locally from the plugin folder
- `src/getLanguage.ts` — extension → language mapping, with static fallback and dynamic Monaco map
- `src/codeEditorView.ts` — Obsidian TextFileView wrapping Monaco
- `src/fenceEditModal.ts` — modal for editing code fences
- `src/createCodeFileModal.ts` — modal for creating new code files
- `src/renameExtensionModal.ts` — modal to rename a file's extension from the context menu
- `src/chooseExtensionModal.ts` — SuggestModal for adding/removing extensions
- `src/chooseThemeModal.ts` — SuggestModal for theme selection with live preview
- `src/chooseCssFileModal.ts` — SuggestModal for CSS snippets
- `src/formatterConfigModal.ts` — modal for per-extension formatter config

See `docs/monaco-local-integration.md` for the full technical story of how Monaco was integrated locally.
