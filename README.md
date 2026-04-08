# Code Files — Obsidian Plugin

Open and edit code files directly in Obsidian using a full Monaco Editor (the same editor as VS Code), with syntax highlighting, folding, line numbers, minimap, and validation.

## Features

- **Monaco Editor** — full VS Code editor embedded in Obsidian, loaded locally (no external dependency)
- **Syntax highlighting** — automatic language detection from file extension
- **50+ themes** — Dracula, Monokai, Nord, Tomorrow Night, and more, with live preview
- **Markdown formatting** — format markdown files with Prettier (Shift+Alt+F or formatOnSave), with diff viewer for all formatted files
- **Mermaid formatting** — format Mermaid diagram files with mermaid-formatter (Shift+Alt+F or formatOnSave). Also formats ` ```mermaid ` code blocks inside markdown files.
- **Code block editing** — open any code fence in a full Monaco modal from the editor context menu
- **Create code files** — ribbon icon, right-click in the explorer, or command palette. They open automatically in Monaco.
- **Open any file in Monaco** — open any file type in the Monaco editor via command palette or context menu
- **Edit CSS snippets** — open and edit Obsidian CSS snippets directly from the command palette
- **Dynamic extension management** — add or remove file extensions at runtime, no restart needed
- **Per-extension/global formatter config** — customize editor options (tabSize, insertSpaces, formatOnSave, formatOnType, etc.)

---

## Document Formatting

Format your code with Monaco's built-in formatters:

- **Keyboard shortcut**: `Shift+Alt+F` (markdown and Mermaid files)
- **Automatic**: Enable `formatOnSave` in Editor Config
- **Context menu**: Right-click → "📝 Format Document" (markdown and Mermaid files)

### Format Diff Viewer

After formatting any file, you can view the changes:

- A **diff icon** appears in the tab header for 10 seconds
- Click it to open a side-by-side comparison (original vs formatted)
- The diff viewer is also available in the context menu: **"⟷ Show Format Diff"**
- Shows exactly what changed during the last format operation
- Works for all file types that support formatting (JavaScript, TypeScript, JSON, CSS, HTML, markdown, Mermaid, etc.)

The diff viewer uses Monaco's native `createDiffEditor`, displaying changes with syntax highlighting and inline diff markers.

---

## Opening any file in Monaco

Files with registered extensions open automatically in Monaco. You can also:

- Command palette → **"Open current file in Monaco Editor"**
- Right-click a file → **"Open in Monaco Editor"**
- Right-click in the editor → **"Open in Monaco Editor"**

When opening a file with an unregistered extension in Monaco, a **return arrow icon** appears in the tab header to switch back to the default view.

---

## Creating a file

- Click the **ribbon icon** (left sidebar)
- Right-click a folder in the explorer → **"Create Code File"**
- Command palette → **"Create new Code File"**

A modal opens with filename, extension dropdown, and a **+** button to register new extensions on the fly.

---

## Renaming file extensions

- Click the **pencil icon** in the tab header
- Right-click a file in the explorer → **"Rename Extension"**
- Right-click the file in the editor → **"Rename Extension"**
- Command palette → **"Rename file extension"**

If the extension is unknown, you'll be prompted to register it.

---

## Editing a code block

Place your cursor inside any code fence (` ```lang ... ``` `):

- Right-click → **"Edit Code Block in Monaco Editor"**
- Command palette → **"Open current code block in Monaco Editor"**

The block opens in a full-screen Monaco modal. Changes are written back when you close it.

---

## The tab header bar

When a code file is open, icons appear in the tab header:

| Icon | What it does |
|------|-------------|
| ✏️ **Pencil** | Rename the file's extension. Unknown extensions will prompt for registration. |
| 🎨 **Palette** | Pick a theme with live preview. Hover over themes to preview them in real-time, adjust brightness with left/right arrows. |
| ⬅️ **Arrow** | Return to default view (only for files with unregistered extensions opened in Monaco). |
| ⚙️ **Gear** | Open the Editor Settings panel |

These actions are also available via **F1** or right-click inside Monaco.

### CSS Snippet Controls

When editing a CSS snippet file (`.obsidian/snippets/*.css`), two additional controls appear:

| Icon | What it does |
|------|-------------|
| 📁 **Folder** | Open the snippets folder in your system file explorer |
| 🔘 **Toggle** | Enable or disable the current snippet in Obsidian without leaving the editor |

The toggle switch shows the current state (on/off) and updates instantly when clicked.

---

## Editor Settings (gear icon)

### Toggles

- **Auto Save** — when off, only `Ctrl+S` saves. A circle in the tab shows unsaved state.
- **Semantic / Syntax Validation** — error checking for JS/TS
- **Editor Brightness** — dim or brighten Monaco independently of Obsidian's theme. Can also be adjusted directly in the theme picker modal using left/right arrow keys.

### Editor Config

JSON editor for formatting rules. Two scopes:

- **Global (`*`)** — applies to all file types
- **`.ext`** — overrides for the current extension

Accepts standard Monaco `IEditorOptions`:

```jsonc
{
    "tabSize": 4,
    "insertSpaces": true,
    "formatOnSave": true,
    "formatOnType": false,
    "printWidth": 80,  // Line length for Prettier (markdown, mermaid only)
    // "rulers": [80, 120],  // Visual line length guides (all languages)
    // "fontSize": 14,
}
```

**Note:** `printWidth` only affects Prettier-based formatters (markdown and mermaid). For other languages (TypeScript, JavaScript, etc.), Monaco uses native formatters that don't respect this setting. Use `rulers` for visual line length guides.

Changes save automatically when the panel closes. Per-extension config merges with global.

---

## Plugin Settings (Obsidian Settings → Code Files)

- **Show ribbon icon** — toggle the sidebar icon
- **Use extended extensions list** — auto-register a broad curated list vs. manual management
- **Manage extensions** — add or remove extensions; changes take effect immediately
- **Editor Config** — same JSON editor as the gear panel, with extension picker

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save (formats first if formatOnSave is on) |
| `Shift+Alt+F` | Format document (markdown and Mermaid files) |
| `Alt+Z` | Toggle word wrap |
| `F1` | Monaco command palette (all editor actions + Code Files actions) |
| `Ctrl+P` | Obsidian command palette (intercepted from inside Monaco) |
| `Ctrl+,` | Obsidian settings (intercepted from inside Monaco) |
| `Ctrl+Delete` | Delete the current file |

---

## Managing extensions

Extensions control which file types open in Monaco.

**Two modes:**

- **Manual** — maintain your own list
- **Extended** — broad curated list auto-registered. You can still exclude or add extras.

Extensions can also be added on the fly from the **Create Code File** modal or **Rename Extension** dialog.

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

See `docs/prettier-markdown-formatting.md` for details on how Prettier markdown formatting is implemented.

See `docs/mermaid-formatting.md` for details on how Mermaid diagram formatting is implemented.
