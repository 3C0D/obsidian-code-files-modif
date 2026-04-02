# Code Files — Obsidian Plugin

Open and edit code files directly in Obsidian using a full Monaco Editor (the same editor as VS Code), with syntax highlighting, folding, line numbers, minimap, and validation.

## Features

- **Monaco Editor** — full VS Code editor embedded in Obsidian, loaded locally (no external dependency)
- **Syntax highlighting** — automatic language detection from file extension, covering all Monaco-supported languages
- **Create code files** — ribbon icon or right-click in the explorer to create a new file with a chosen extension
- **Edit CSS snippets** — open and edit Obsidian CSS snippets directly from the command palette
- **Edit code blocks** — open any code fence in a full Monaco modal from the editor context menu
- **Dynamic extension management** — add or remove file extensions at runtime, no restart needed
- **Rename extension** — right-click any registered file to rename its extension on the fly

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

### Editing CSS snippets

Command palette → **"Edit CSS Snippet"** — opens a search modal to choose an existing snippet or create a new one.

## Settings

| Setting | Description |
|---|---|
| **Theme** | Monaco editor theme. `Default` follows Obsidian's dark/light mode. |
| **Overwrite background** | Use Obsidian's background color instead of the theme's. Disable if text is illegible. |
| **File Extensions** | Extensions registered with Obsidian. Click **Add / Remove** to manage them. Changes take effect immediately — no restart needed. |
| **Folding** | Enable code block folding in the editor. |
| **Line Numbers** | Show line numbers. |
| **Minimap** | Show the minimap on the right side. |
| **Semantic Validation** | Show semantic errors (type errors, etc.) for JS/TS files. |
| **Syntax Validation** | Show syntax errors for JS/TS files. |

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
- `src/chooseCssFileModal.ts` — SuggestModal for CSS snippets

See `docs/monaco-local-integration.md` for the full technical story of how Monaco was integrated locally.
