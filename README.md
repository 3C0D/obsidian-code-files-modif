# Code Files — Obsidian Plugin

Open and edit code files directly in Obsidian using a full Monaco Editor (the same editor as VS Code), with syntax highlighting, folding, line numbers, minimap, and validation.

## Features

- **Full Monaco Editor** — VS Code's editor embedded locally in Obsidian, with syntax highlighting (80+ languages), folding, line numbers, minimap, and validation
- **50+ Themes** — Dracula, Monokai, Nord, Tomorrow Night, and more, with live preview in theme picker
- **Multi-Language Formatting** — Prettier (JS, TS, CSS, HTML, JSON, YAML, Markdown, GraphQL), Mermaid, Ruff (Python), gofmt (Go), clang-format (C/C++). Trigger: Shift+Alt+F or formatOnSave
- **Format Diff & Selective Revert** — view side-by-side diff after formatting; revert individual blocks or all changes with one click
- **Cross-File Navigation** — Ctrl+Click on TS/JS imports to jump to definitions. Requires Project Root Folder (right-click folder → Code Files → Define as Project Root). Project root highlighted in explorer (color customizable)
- **Project Root Folder** — mark any folder as project root; all TS/JS files from that folder are loaded into Monaco's TypeScript service for IntelliSense
- **File Explorer Visual Indicators** — uppercase label on registered dotfiles (ENV, GITIGNORE), muted "unregistered" label on unknown extensions, project root highlight, subtle background tint for registered dotfiles
- **Extended Mode** — toggle "Use extended extensions list" in settings to automatically register all Monaco-supported extensions (80+ languages). Exclusions and custom additions are preserved when switching modes.
- **Built-In Hidden Files** — no external plugin needed. Auto-reveal registered dotfiles in explorer (configurable). Bulk reveal/hide via Reveal Hidden Files modal (`.re` quick action or folder context menu → Code Files → Reveal/Hide Hidden Files)
- **Dynamic Extension Management** — add/remove extensions at runtime. Quick actions: right-click file in explorer → Code Files → Register Extension / Unregister Extension
- **Create Code Files Modal** — interactive modal with extension autosuggest. Rename extensions, create files without extension (LICENSE, .env), auto-registers new extensions
- **Files Without Extension** — full support for dotfiles and extensionless files (.env, .gitignore, LICENSE, README). Automatic mapping to configuration profiles, per-file editor config, and syntax highlighting via fake extension system.
- **Per-Extension & Global Config** — JSONC editor config (tabSize, insertSpaces, formatOnSave, printWidth, etc.) with global fallback and language-level inheritance
- **Editor Settings Modal** — inline Monaco JSON editor with live preview; accessible via ⚙️ gear icon in tab header
- **AutoSave (OFF by default)** — visual dirty indicator (circle in tab header); prevents accidental saves. Format on save optional
- **Code Block Editing** — open any code fence in full Monaco modal from editor context menu
- **Open Any File in Monaco** — command palette or right-click → "Open in Monaco Editor"
- **Popout Windows** — secondary windows support (Ctrl+Shift+Alt+Click)
- **Dynamic Hotkey Sync** — Monaco hotkeys automatically update when Obsidian hotkey settings change (no reload needed). Some hotkeys can be overridden in the Code Files Settings Tab.

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

### Test Samples _(Developer/contributor only)_

The `templates/format-test-samples-for-obsidian/` folder (included in the plugin's source repository) contains example files with intentional formatting errors to test the formatter. **Copy this folder to your Obsidian vault** to try formatting on different file types.

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
    - The folder name will be highlighted with a colored highlight (default purple/rose matching Obsidian's accent color) in the explorer
    - To clear: right-click the same folder → **Code Files → Clear Project Root Folder**

2. **Via Editor Settings**:
    - Open Editor Settings (⚙️ gear icon in tab header)
    - Set **Project Root Folder** to your TypeScript/JavaScript project folder

Monaco will load all TS/JS files from that folder for IntelliSense and navigation.

**Note:** Without setting the Project Root Folder, cross-file navigation (Ctrl+Click on imports) will not work.

See `docs/cross-file-navigation.md` for implementation details and troubleshooting. _(Developer only)_

---

## File Explorer Visual Indicators

Code Files adds visual cues in the Obsidian file explorer to help you understand which files will open in Monaco:

### Project Root Folder Highlight

The folder set as **Project Root** for cross-file navigation is highlighted in the file explorer:

- **Default color**: Purple/rose (matches Obsidian's accent color; configurable)
- **How to set**: Right-click folder → **Code Files → Define as Project Root Folder**
- **Custom color**: In **Obsidian Settings → Code Files → Project Root Folder** section, use the color picker to choose any color

### File Explorer Visual Indicators

![File Explorer Badges](assets/Hidden_files.png)

<small>Explorer indicators — folder "Test" (green eye icon = revealed); `eslint.config.mts` — yellow label (MTS extension visible via "Detect all file extensions" but NOT registered); `.babelrc` — darker background (extension registered with Code Files); `.gitignore` — no label (dotfile revealed but NOT registered with Code Files).</small>

**Notes:**

- Registered dotfiles like `.babelrc` appear automatically if **auto-reveal** is enabled (no manual action needed).
- The folder eye icon appears **only** for folders that contain dotfiles **explicitly revealed** via the modal (checkbox checked). If you uncheck all manually-revealed dotfiles in a folder, the eye icon disappears. Dotfiles that are auto-revealed via registered extensions do not trigger the eye icon.

### Auto-Reveal Hidden Files

- When "Auto-reveal registered dotfiles" is enabled (default), any dotfile whose extension is registered with Code Files automatically becomes visible in the explorer
- No external "Show Hidden Files" plugin needed — handled entirely by Code Files
- Manual control via **Reveal Hidden Files** modal (see below)

### Extended Mode

- Toggle "Use extended extensions list" in settings to enable **Extended Mode**
- Automatically registers all Monaco-supported extensions (80+ languages)
- All code files open in Monaco without manual extension management
- Excluded extensions are still respected; you can add extra custom extensions
- Useful if you work with many languages and want zero configuration

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

## Opening hidden files (dotfiles)

Code Files provides comprehensive management for hidden files (dotfiles) directly within Obsidian's file explorer.

### Automatic Setup

The plugin automatically enables Obsidian's **"Detect all file extensions"** setting on startup. This is required for dotfiles to be visible and openable in Monaco. You'll see a one-time notice when this happens.

### Reveal Hidden Files in a Folder

- **Right-click a folder** in the explorer → **Code Files → Reveal/Hide Hidden Files**
- **Quick action**: Press `.re` (dot-reveal) for instant access (configurable in Settings → Plugin Hotkeys)
- A modal lists all hidden files in that folder (files starting with `.`)
- **Two-column layout**:
    - **Left column (Reveal)** — Check files to reveal them in the explorer, uncheck to hide them again
    - **Right column (Register)** — Check to register the file's extension with Code Files (makes it open automatically in Monaco)
- **Master checkboxes**: "All" in each column selects/deselects all items in that column
- **Click Apply** to confirm changes
- **Folder indicator**: Folders with revealed files show an eye icon (👁️)

### How Auto-Reveal Works

If **Auto-reveal registered dotfiles** is enabled in settings (default: on):

- Any dotfile whose extension is registered with Code Files is **automatically revealed** in the explorer
- Example: if `.env` extension is registered, all `.env` files become visible automatically
- Auto-revealed files are **managed automatically** — you don't need to manually reveal them
- You can still manually reveal/hide additional dotfiles via the modal

### Register Extensions from the Hidden Files Modal

When scanning a folder, dotfiles with unregistered extensions show a **"register as .ext"** checkbox in the right column:

- Check the box to **register that extension** with Code Files
- extension is added to your registered extensions list
- Once registered, the file type opens automatically in Monaco editor
- Click Apply to register all selected extensions at once

### Manual Reveal vs Auto-Reveal

- **Manual reveal**: You explicitly check a file in the modal → persists until you uncheck it
- **Auto-reveal**: Extension registered → file automatically shown → hidden automatically if extension is unregistered or auto-reveal is disabled

When you **turn off Auto-reveal** in settings, all auto-managed dotfiles are hidden (manual reveals are preserved).

### Open Hidden Files Directly

You can open hidden files without revealing them in the explorer:

- **From a specific folder**: Right-click a folder → **Code Files → Open Hidden Files in Code Files**
- **From entire vault**: Command palette → **"Open Hidden Files in Vault"**
- A suggester lists all hidden files with their relative paths
- Files are filtered by size (max 10MB) and exclude dangerous formats

### Hidden Files Settings

In **Obsidian Settings → Code Files → Hidden Files**:

- **Auto-reveal registered dotfiles** — Automatically reveal dotfiles whose extensions are registered with Code Files
- **Excluded folders** — Hidden folders to never show (e.g., `.git`, `node_modules`, `.trash`)
- **Excluded extensions** — Hidden file extensions to ignore (e.g., `tmp`, `log`, `cache`)

### Behavior on Extension Changes

- **Registering an extension**: Existing dotfiles with that extension are automatically revealed (if auto-reveal is on)
- **Unregistering an extension**:
    - Files you **manually revealed** stay visible
    - Files that were **only auto-revealed** are hidden
- **Renaming files**: Renaming a dotfile to another dotfile format works correctly with visibility preservation
- **Trash/deletion**: Dotfiles can be trashed normally; Obsidian's auto-deletion protection is bypassed for explicit delete operations

### Supported File Types

Hidden files are filtered by:

- **Size**: Maximum 10 MB by default (configurable in Plugin Settings)
- **Dangerous formats**: Executables (exe, dll, so, dylib, app, dmg, ms), archives (zip, rar, 7z, tar, gz, bz2, xz), databases (db, sqlite, mdb), binary office formats (doc, xls, ppt), fonts (ttf, otf, woff, woff2, eot) are excluded from scanning for safety

---

## Renaming files (name + extension)

- Click the **pencil icon** in the tab header
- Right-click a file in the explorer → **"Rename (Name.ext)"**
- Right-click the file in the editor → **"Rename (Name.ext)"**
- Command palette → **"Rename (Name.ext) of current file"**

Allows renaming both the filename and extension:

- Change extension: `myfile.py` → `myfile.js`
- Change name: `myfile.py` → `newname.py`
- Change both: `myfile.py` → `newfile.js`
- Create dotfiles: `.env` → `.prettierrc`
- Transform dotfiles to normal files: `.pythonconfig` → `config.yaml`

If the new extension is unknown, you'll be prompted to register it.

---

## Editing a code block

Place your cursor inside any code fence (` ```lang ... ``` `):

- Right-click → **"Edit Code Block in Monaco Editor"**
- Command palette → **"Open current code block in Monaco Editor"**

The block opens in a full-screen Monaco modal. Changes are written back when you close it.

---

## The tab header bar

When a code file is open, icons appear in the tab header:

| Icon           | What it does                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ✏️ **Pencil**  | Rename the file (name + extension). Unknown extensions will prompt for registration.                                      |
| 🎨 **Palette** | Pick a theme with live preview. Hover over themes to preview them in real-time, adjust brightness with left/right arrows. |
| ⬅️ **Arrow**   | Return to default view (only for files with unregistered extensions opened in Monaco).                                    |
| ⚙️ **Gear**    | Open the Editor Settings panel                                                                                            |

These actions are also available via **F1** or right-click inside Monaco.

### CSS Snippet Controls

When editing a CSS snippet file (`.obsidian/snippets/*.css`), two additional controls appear in the tab header:

| Icon          | What it does                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📁 **Folder** | Open the snippets folder in your system file explorer                                                                                                                   |
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
	"printWidth": 80, // Line length for Prettier (markdown, mermaid, JS, TS, CSS, etc.)
	"proseWrap": "always" // Markdown only: "always" | "never" | "preserve"
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

**Config Cascade with Language Fallback:** Extensions that map to a different Monaco language automatically inherit that language's config. For example:

- `.clangformat` (maps to `yaml`) inherits YAML config (tabSize: 2)
- `.prettierrc` (maps to `json`) inherits JSON config (tabSize: 2)
- `.eslintrc`, `.babelrc` (map to `json`) inherit JSON config

Cascade order: `global (*) → language (yaml) → extension (clangformat)`

This means you only need to configure the base language (like `yaml`), and all extensions that use that language will inherit the settings automatically. You can still override per-extension if needed.

These are suggestions — uncomment to override global config. Note that formatting (Shift+Alt+F) only works for languages with Prettier or Mermaid integration.

**Note:** `printWidth` affects Prettier-based formatters (Markdown, Mermaid, JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL). `proseWrap` is Markdown-specific. Use `rulers` for visual line length guides in all languages.

Changes save automatically when the panel closes. Per-extension config merges with global.

---

## Plugin Settings (Obsidian Settings → Code Files)

- **Show ribbon icon** — toggle the sidebar icon
- **Use extended extensions list** — auto-register a broad curated list vs. manual management
- **Manage extensions** — add or remove extensions; changes take effect immediately
- **Maximum file size** — maximum file size in MB for opening files in Monaco (default: 10 MB, range 1-100 MB)
- **Editor Config** — same JSON editor as the gear panel, with extension picker
- **Monaco Hotkey Overrides** — ensure Obsidian shortcuts work inside Monaco. Configure overrides for:
    - **Command Palette** (default: Ctrl+P / Cmd+P)
    - **Settings** (default: Ctrl+, / Cmd+,)
    - **Delete File** (default: Ctrl+Delete / Cmd+Delete)
      Changes require Monaco to reload the editor view to take effect.
- **Project Root Folder Highlight Color** — customize the color used to highlight the project root folder in the file explorer

---

## Keyboard shortcuts

| Shortcut      | Action                                                           |
| ------------- | ---------------------------------------------------------------- |
| `Ctrl+S`      | Save (formats first if formatOnSave is on)                       |
| `Shift+Alt+F` | Format document (all supported languages)                        |
| `Ctrl+/`      | Toggle line comment                                              |
| `Alt+Z`       | Toggle word wrap                                                 |
| `F1`          | Monaco command palette (all editor actions + Code Files actions) |
| `Ctrl+P`      | Obsidian command palette (remains accessible from inside Monaco) |
| `Ctrl+,`      | Obsidian settings (remains accessible from inside Monaco)        |
| `Ctrl+Delete` | Delete the current file                                          |

**Note:** While editing in Monaco, you can still access Obsidian's command palette (`Ctrl+P`) and settings (`Ctrl+,`). The Monaco-specific command palette is accessed with `F1`. Editor settings are available via the gear icon (⚙️) in the tab header.

---

## Managing extensions

Extensions control which file types open in Monaco.

**Two modes:**

- **Manual** — maintain your own list
- **Extended** — broad curated list auto-registered. You can still exclude or add extras.

**Quick actions via file explorer context menu:**

- **Register Extension** — for any file with an unregistered, non-native extension: right-click → Code Files → **Register Extension** to add it to your registered list
- **Unregister Extension** — for any file with a registered custom extension: right-click → Code Files → **Unregister Extension** to remove it
- Changes take effect immediately

Extensions can also be added on the fly from the **Create Code File** modal or **Rename (Name.ext)** dialog.

---

## Architecture overview

| File                      | Role                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `mountCodeEditor.ts`      | Creates the Monaco iframe and handles all postMessage communication |
| `monacoEditor.html`       | The iframe HTML, loaded locally from the plugin folder              |
| `codeEditorView.ts`       | Obsidian TextFileView wrapping Monaco                               |
| `getLanguage.ts`          | Extension → Monaco language ID mapping                              |
| `fenceEditModal.ts`       | Modal for editing code fences                                       |
| `createCodeFileModal.ts`  | Modal for creating new code files                                   |
| `renameExtensionModal.ts` | Modal for renaming files (name + extension)                         |
| `editorSettingsModal.ts`  | Gear panel: toggles + JSON config editor                            |
| `chooseThemeModal.ts`     | Theme picker with live preview                                      |

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

---

## Package Size

**Current size: ~21.4 MB**

The plugin bundle includes:

- Monaco Editor: ~12 MB
- Themes: ~2 MB
- Formatters (Prettier, Mermaid, Ruff, gofmt, clang-format): ~5 MB
- Plugin code: ~1 MB
- Other assets and overhead: ~1.4 MB

Formatters are the main contributors to the increased size compared to the initial estimate. The plugin remains completely offline with no external dependencies.

---

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
