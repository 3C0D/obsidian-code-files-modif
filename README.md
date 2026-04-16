# Code Files — Obsidian Plugin

Open and edit code files directly in Obsidian using a full Monaco Editor (the same editor as VS Code), with syntax highlighting, folding, line numbers, minimap, and validation.

## Features

- **Monaco Editor** — full VS Code editor embedded in Obsidian, loaded locally (no external dependency)
- **Syntax highlighting** — automatic language detection from file extension
- **50+ themes** — Dracula, Monokai, Nord, Tomorrow Night, and more, with live preview
- **Format Diff & Selective Revert** — format code with Prettier and view all changes side-by-side. Includes a block-by-block revert tool directly in the gutter (similar to VS Code)
- **Markdown formatting** — format markdown files with Prettier (Shift+Alt+F or formatOnSave)
- **Mermaid formatting** — format Mermaid diagram files with mermaid-formatter (Shift+Alt+F or formatOnSave). Also formats ` ```mermaid ` code blocks inside markdown files.
- **Multi-language formatting** — format JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL, Python, Go, C, and C++ files (Shift+Alt+F or formatOnSave)
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
- **Python** (Ruff formatter) — PEP 8 compliant formatting
- **Go** (gofmt) — official Go formatter
- **C/C++** (clang-format) — LLVM's official formatter

### Test Samples

The `templates/format-test-samples-for-obsidian/` folder contains example files with intentional formatting errors to test the formatter. **Copy this folder to your Obsidian vault** to try formatting on different file types.

### Format Diff Viewer

After formatting any file, you can view the changes:

- A **diff icon** appears in the tab header for 10 seconds
- Click it to open a side-by-side comparison (original vs formatted)
- The diff viewer is also available in the context menu: **"⟷ Show Format Diff"**
- Shows exactly what changed during the last format operation
- **Selective Revert**: Use the ↩ button in the left gutter to revert specific layout changes block-by-block without undoing the entire document.
- **Revert All**: Undoes all formatting changes instantly and closes the diff view.
- Works for all file types that support formatting (JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL, Markdown, Mermaid, Python, Go, C, C++)

The diff viewer uses Monaco's native `createDiffEditor`, displaying changes with syntax highlighting, inline diff markers, and interactive widgets.

---

## Cross-File Navigation (TypeScript/JavaScript)

Navigate between TypeScript and JavaScript files in your project:

- **Ctrl+Click** on imports, function calls, or class names to jump to their definitions
- **Go to Definition** (F12) shows a peek window with the definition location
- Works with relative imports (`./utils`, `../service`) and supports both `.ts`, `.tsx`, `.js`, `.jsx` files
- **Smart tab reuse** — if the target file is already open in the editor, it reuses that tab instead of creating a new one

### Setup

**IMPORTANT:** Cross-file navigation requires configuring the Project Root Folder.

**Two ways to set the Project Root Folder:**

1. **Via context menu** (recommended):
   - Right-click any folder in the file explorer
   - Select **Code Files → Define as Project Root Folder**
   - The folder name will be highlighted in green in the explorer
   - To clear: right-click the same folder → **Code Files → Clear Project Root Folder**

2. **Via Editor Settings**:
   - Open Editor Settings (⚙️ gear icon in tab header)
   - Set **Project Root Folder** to your TypeScript/JavaScript project folder

Monaco will load all TS/JS files from that folder for IntelliSense and navigation.

**Example:** If your project is in `templates/my-project/`, set it as Project Root Folder. Now you can Ctrl+Click on any import to open the source file at the exact definition.

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
- Right-click a folder in the explorer → **Code Files → Create Code File**
- Command palette → **"Create new Code File"**

A modal opens with filename, extension dropdown, and a **+** button to register new extensions on the fly.

---

## Opening hidden files

You can open any file in Monaco, even if it's not displayed in Obsidian's file explorer:

- **From a specific folder**: Right-click a folder in the explorer → **Code Files → Open Hidden Files in Code Files**
- **From entire vault**: Command palette → **"Open Hidden Files in Vault"**
- A suggester lists all hidden files with their relative paths
- Files are filtered by size (max 10MB) and exclude dangerous formats:
  - Executables: `exe`, `dll`, `so`, `dylib`, `app`, `dmg`, `msi`
  - Archives: `zip`, `rar`, `7z`, `tar`, `gz`, `bz2`, `xz`
  - Databases: `db`, `sqlite`, `mdb`
  - Binary Office formats: `doc`, `xls`, `ppt`
  - Fonts: `ttf`, `otf`, `woff`, `woff2`, `eot`

This is useful for editing configuration files like `.gitignore`, `.env`, `.dockerignore`, or any other hidden files in your vault.

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

When editing a CSS snippet file (`.obsidian/snippets/*.css`), two additional controls appear in the tab header:

| Icon | What it does |
|------|-------------|
| 📁 **Folder** | Open the snippets folder in your system file explorer |
| 🔘 **Toggle** | Enable or disable the current snippet in Obsidian without leaving the editor. The tooltip updates dynamically to show "Enable" or "Disable" based on the current state. |

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
    "printWidth": 80,  // Line length for Prettier (markdown, mermaid, JS, TS, CSS, etc.)
    "proseWrap": "always",  // Markdown only: "always" | "never" | "preserve"
    // "rulers": [80, 120],  // Visual line length guides (all languages)
    // "fontSize": 14,
}
```

**Language-Specific Templates:** When you open the extension config for a specific file type, the editor pre-fills with helpful suggestions:

- **Languages with Prettier formatting** (JS, TS, CSS, HTML, JSON, YAML, Markdown, Mermaid): Inherit global config (tabs, tabSize 4) unless overridden
- **JSON/YAML**: Override with 2-space indentation (Prettier standard)
- **Python**: Override with 4-space indentation (PEP 8 standard)
- **Go**: Override with tabs (gofmt standard)
- **C/C++**: Override with 4-space indentation (clang-format default)
- **Other languages** (Rust, Java, C#, PHP): Templates suggest 4-space indentation, but **no formatter is currently integrated** — these are editor display settings only

These are suggestions — uncomment to override global config. Note that formatting (Shift+Alt+F) only works for languages with Prettier or Mermaid integration.

**Note:** `printWidth` affects Prettier-based formatters (Markdown, Mermaid, JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL). `proseWrap` is Markdown-specific. Use `rulers` for visual line length guides in all languages.

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
| `Ctrl+/` | Toggle line comment |
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

### Adding New Formatters

**Current Status:**
- **Integrated formatters**: Prettier (JS, TS, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL, Markdown), Mermaid, Ruff (Python), gofmt (Go), clang-format (C/C++)
- **No formatter yet**: Rust, Java, C#, PHP (syntax highlighting only)

**Integration Pattern:**
All formatters follow the same pattern in `monacoEditor.html`:
1. Load formatter library as UMD bundle via `<script>` tag
2. Register with Monaco: `monaco.languages.registerDocumentFormattingEditProvider(languageId, provider)`
3. Provider implements `provideDocumentFormattingEdits()` which returns text edits

**Potential Formatters:**
- **Rust**: rustfmt (WASM build needed)
- **Java**: google-java-format (WASM build needed)
- **C#**: csharpier (WASM build needed)
- **PHP**: PHP-CS-Fixer (WASM build needed)
- **Multi-language**: [Biome](https://biomejs.dev/) (supports JS, TS, JSON, JSX/TSX via WASM, expanding to more languages)

**Key Files for Integration:**
- `monacoEditor.html` — register formatter provider
- `mountCodeEditor.ts` — load formatter bundle via `<script>` tag
- `types.ts` — update language-specific config templates
- `README.md` — document supported languages

See `docs/prettier-markdown-formatting.md` and `docs/mermaid-formatting.md` for implementation examples.
