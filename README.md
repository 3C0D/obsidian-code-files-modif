# Code Files — Obsidian Plugin

Open and edit code files directly in Obsidian using a full Monaco Editor (the same editor as VS Code), with syntax highlighting, folding, line numbers, minimap, and validation.

## Features

- **Monaco Editor** — full VS Code editor embedded in Obsidian, loaded locally (no external dependency)
- **Syntax highlighting** — automatic language detection from file extension
- **50+ themes** — Dracula, Monokai, Nord, Tomorrow Night, and more, with live preview
- **Code block editing** — open any code fence in a full Monaco modal from the editor context menu
- **Create code files** — ribbon icon, right-click in the explorer, or command palette
- **Edit CSS snippets** — open and edit Obsidian CSS snippets directly from the command palette
- **Dynamic extension management** — add or remove file extensions at runtime, no restart needed
- **Per-extension formatter config** — tabSize, insertSpaces, formatOnSave, formatOnType, and any Monaco IEditorOptions

---

## Opening a file

Files with registered extensions open automatically in Monaco when you click them in the explorer. You can also force-open any file via:

- Command palette → **"Open current file in Monaco Editor"**
- Right-click a file → **"Open in Monaco Editor"**

---

## Creating a file

Three entry points:

- Click the **ribbon icon** (JSON file icon, left sidebar)
- Right-click a **folder** in the explorer → **"Create Code File"**
- Command palette → **"Create new Code File"**

A small modal opens with a filename field, an extension dropdown (autocomplete from registered extensions), and a **+** button to register a new extension on the fly. Type a name, pick an extension, press **Create**.

---

## Editing a code block

Place your cursor inside any code fence (` ```lang ... ``` `) and use:

- Right-click → **"Edit Code Block in Monaco Editor"**
- Command palette → **"Open current code block in Monaco Editor"**

The block opens in a full-screen Monaco modal. Closing the modal writes the content back to the note.

---

## The tab header bar

When a code file is open, three icon buttons appear in the tab header, to the right of the filename:

| Icon | What it does |
|------|-------------|
| ✏️ **Pencil** | Rename the file's extension on the fly |
| 🎨 **Palette** | Pick a theme with live preview (hover to preview, ← → to adjust brightness) |
| ⚙️ **Gear** | Open the Editor Settings panel |

These same actions are also available inside the Monaco editor via **F1** (Monaco command palette) or the right-click context menu.

---

## Editor Settings (gear icon)

The gear panel is the main place to configure the editor. It is split into two parts.

### Toggles (top section)

Quick on/off switches for the most common options:

- **Auto Save** — when off, only `Ctrl+S` saves. A small circle in the tab title shows unsaved state.
- **Semantic / Syntax Validation** — error checking for JS/TS files
- **Editor Brightness** — slider to dim or brighten the Monaco editor independently of Obsidian's theme

### Editor Config (bottom section)

A JSON editor (Monaco inside Monaco) for fine-grained formatting rules. Two scopes are available via buttons:

- **Global (`*`)** — applies to all file types
- **`.ext`** — overrides for the current file's extension only

The config accepts standard Monaco `IEditorOptions` plus a few extra keys:

```jsonc
{
    "tabSize": 4,
    "insertSpaces": true,
    "formatOnSave": true,
    "formatOnType": false,
    // any Monaco IEditorOption key works here too:
    // "rulers": [80, 120],
    // "fontSize": 14,
}
```

Changes are saved automatically when the panel closes. The per-extension config is merged on top of the global config, so you only need to specify what differs.

---

## Plugin Settings (Obsidian Settings → Code Files)

The main settings panel (`Ctrl+,` → Code Files) covers options that are less frequently changed:

- **Show ribbon icon** — toggle the sidebar icon
- **Use extended extensions list** — register a broad curated list of extensions automatically (vs. managing them manually)
- **Manage extensions** — add or remove extensions via a search modal; changes take effect immediately without restart
- **Editor Config** — same JSON config editor as in the gear panel, but with an extension picker to edit any extension's config without having a file open

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save (formats first if formatOnSave is on) |
| `Alt+Z` | Toggle word wrap |
| `F1` | Monaco command palette (all editor actions + Code Files actions) |
| `Ctrl+P` | Obsidian command palette (intercepted from inside Monaco) |
| `Ctrl+,` | Obsidian settings (intercepted from inside Monaco) |

---

## Managing extensions

Extensions control which file types open in Monaco instead of Obsidian's default viewer.

**Two modes** (toggled in Settings → Code Files):

- **Manual** — you maintain your own list. Use **Add / Remove** to add or remove extensions one by one.
- **Extended** — a broad curated list is registered automatically. You can still exclude individual extensions or add extras.

Extensions can also be added on the fly from the **Create Code File** modal (the **+** button next to the dropdown).

---

## Architecture overview

| File | Role |
|------|------|
| `mountCodeEditor.ts` | Creates the Monaco iframe and handles all postMessage communication |
| `monacoEditor.html` | The iframe HTML, loaded locally from the plugin folder |
| `codeEditorView.ts` | Obsidian TextFileView wrapping Monaco |
| `getLanguage.ts` | Extension → Monaco language ID mapping |
| `fenceEditModal.ts` | Modal for editing code fences |
| `createCodeFileModal.ts` | Modal for creating new code files |
| `editorSettingsModal.ts` | Gear panel: toggles + JSON config editor |
| `chooseThemeModal.ts` | Theme picker with live preview |

---

## Development

```bash
git clone https://github.com/3C0D/obsidian-sample-plugin-modif.git
cd obsidian-sample-plugin-modif
yarn install
```

Create a `.env` file:

```env
TEST_VAULT=C:\path\to\test\vault
REAL_VAULT=C:\path\to\real\vault
```

```bash
yarn start    # Development with hot reload → TEST_VAULT
yarn build    # Production build (current folder)
yarn real     # Build + install to REAL_VAULT
```

See `docs/monaco-local-integration.md` for the full story of how Monaco is loaded locally inside Obsidian.
