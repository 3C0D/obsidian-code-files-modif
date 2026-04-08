# Code Files — Obsidian Plugin

Open and edit code files directly in Obsidian using a full Monaco Editor (the same editor as VS Code), with syntax highlighting, folding, line numbers, minimap, and validation.

## Features

- **Monaco Editor** — full VS Code editor embedded in Obsidian, loaded locally (no external dependency)
- **Syntax highlighting** — automatic language detection from file extension
- **50+ themes** — Dracula, Monokai, Nord, Tomorrow Night, and more, with live preview
- **Markdown formatting** — format markdown files with Prettier (Shift+Alt+F or formatOnSave), with diff viewer for all formatted files
- **Mermaid formatting** — format Mermaid diagram files with mermaid-formatter (Shift+Alt+F or formatOnSave). Also formats ` ```mermaid ` code blocks inside markdown files.
- **Multi-language formatting** — format JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, and GraphQL files with Prettier (Shift+Alt+F or formatOnSave)
- **Cross-file navigation** — Ctrl+Click on TypeScript/JavaScript imports to jump to definitions in other files
- **Code block editing** — open any code fence in a full Monaco modal from the editor context menu
- **Create code files** — ribbon icon, right-click in the explorer, or command palette. They open automatically in Monaco.
- **Open any file in Monaco** — open any file type in the Monaco editor via command palette or context menu
- **Edit CSS snippets** — open and edit Obsidian CSS snippets directly from the command palette
- **Dynamic extension management** — add or remove file extensions at runtime, no restart needed
- **Per-extension/global formatter config** — customize editor options (tabSize, insertSpaces, formatOnSave, formatOnType, etc.)

---

## Document Formatting

Format your code with Monaco's built-in formatters:

- **Keyboard shortcut**: `Shift+Alt+F` (all supported languages)
- **Automatic**: Enable `formatOnSave` in Editor Config
- **Context menu**: Right-click → "📝 Format Document" (all supported languages)

### Supported Languages

Prettier formatting is available for:
- **JavaScript** (parser: babel) — supports JSX
- **TypeScript** (parser: typescript) — supports TSX
- **CSS** (parser: css)
- **SCSS** (parser: scss)
- **Less** (parser: less)
- **HTML** (parser: html)
- **JSON** (parser: json)
- **YAML** (parser: yaml)
- **GraphQL** (parser: graphql)
- **Markdown** (parser: markdown) — with Mermaid block formatting
- **Mermaid** (mermaid-formatter) — standalone .mmd files

### Test Samples

The `format-test-samples/` folder contains example files with intentional formatting errors to test the formatter. Copy this folder to your vault to try formatting on different file types.

### Format Diff Viewer

After formatting any file, you can view the changes:

- A **diff icon** appears in the tab header for 10 seconds
- Click it to open a side-by-side comparison (original vs formatted)
- The diff viewer is also available in the context menu: **"⟷ Show Format Diff"**
- Shows exactly what changed during the last format operation
- Works for all file types that support formatting (JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL, Markdown, Mermaid)

The diff viewer uses Monaco's native `createDiffEditor`, displaying changes with syntax highlighting and inline diff markers.

---

## Cross-File Navigation (TypeScript/JavaScript)

Navigate between TypeScript and JavaScript files in your project:

- **Ctrl+Click** on imports, function calls, or class names to jump to their definitions
- **Go to Definition** (F12) shows a peek window with the definition location
- Works with relative imports (`./utils`, `../service`) and supports both `.ts`, `.tsx`, `.js`, `.jsx` files
- **Smart tab reuse** — if the target file is already open in the editor, it reuses that tab instead of creating a new one

### Setup

**IMPORTANT:** Cross-file navigation requires configuring the Project Root Folder.

1. Open Editor Settings (⚙️ gear icon in tab header)
2. Set **Project Root Folder** to your TypeScript/JavaScript project folder
3. Monaco will load all TS/JS files from that folder for IntelliSense and navigation

**Example:** If your project is in `templates/my-project/`, set Project Root Folder to `templates/my-project`. Now you can Ctrl+Click on any import to open the source file at the exact definition.

**Note:** Without setting the Project Root Folder, cross-file navigation (Ctrl+Click on imports) will not work.

See `docs/cross-file-navigation.md` for implementation details and troubleshooting.

---

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
- **Project Root Folder** — set the root folder for TypeScript/JavaScript cross-file navigation (enables Ctrl+Click on imports)

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

**Note:** `printWidth` affects Prettier-based formatters (Markdown, Mermaid, JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL). Use `rulers` for visual line length guides.

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
| `Shift+Alt+F` | Format document (all supported languages) |
| `Alt+Z` | Toggle word wrap |
| `F1` | Monaco command palette (all editor actions + Code Files actions) |
| `Ctrl+P` | Obsidian command palette (remains accessible from inside Monaco) |
| `Ctrl+,` | Obsidian settings (remains accessible from inside Monaco) |
| `Ctrl+Delete` | Delete the current file |

**Note:** While editing in Monaco, you can still access Obsidian's command palette (`Ctrl+P`) and settings (`Ctrl+,`). The Monaco-specific command palette is accessed with `F1`. Editor settings are available via the gear icon (⚙️) in the tab header.

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

See `docs/cross-file-navigation.md` for details on how TypeScript/JavaScript cross-file navigation is implemented.

### Future Formatter Considerations

**Biome Integration** — Consider integrating [Biome](https://biomejs.dev/) as a replacement for Prettier once it supports more languages. Biome is a Rust-based formatter and linter that aims to cover more languages than Prettier. Currently supports JavaScript, TypeScript, JSON, and JSX/TSX, but is actively expanding language support. Once Biome covers additional languages not supported by Prettier (C, C++, Go, Rust, Python, etc.), the integration would follow the same pattern as Prettier using `monaco.languages.registerDocumentFormattingEditProvider`. A settings option could be added to switch between formatters.
