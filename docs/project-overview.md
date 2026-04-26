# Code Files Plugin — Current State Overview

## Core Features (by importance)

### 1. **Full Monaco Editor Integration**

- VS Code's complete editor embedded locally in Obsidian
- Syntax highlighting for 80+ languages
- Professional features: line numbers, minimap, folding, word wrap
- No external dependencies — **21.4 MB** local bundle

### 2. **Advanced Code Formatting with Diff Control**

- **15+ Languages**: JavaScript, TypeScript, CSS, SCSS, Less, HTML, JSON, YAML, GraphQL, Markdown, Mermaid, Python, Go, C, C++
- **Format Diff Viewer**: Side-by-side comparison after formatting
- **Selective Revert**: Block-by-block revert buttons in diff gutter
- **Revert All**: Instant undo of all formatting changes
- **Format any file**: Even unregistered extensions can be formatted

### 3. **Smart Save Strategy with Visual Indicators**

- **AutoSave OFF by default** — prevents accidental modifications
- **Visual indicators**: Circle in tab header (empty = no changes, filled = unsaved)
- **Manual save**: Ctrl+S required when AutoSave disabled
- **Format on save**: Optional automatic formatting before save

### 4. **Cross-File Navigation (TypeScript/JavaScript)**

1- **Project Root setup**: Right-click folder → "Define as Project Root Folder"
2- **Ctrl+Click** to jump to definitions

- **Smart tab reuse**: Opens in existing tab if file already open
- **IntelliSense**: Full project context for code completion

### 5. **Hidden Files Access & Management**

- **Automatic Detect All Extensions**: Plugin enables Obsidian's "Detect all file extensions" setting automatically on startup — dotfiles are visible system-wide. One-time notice shown when first enabled.
- **Reveal in explorer**: Right-click folder → "Reveal/Hide Hidden Files" modal with two-column UI
    - **Left column**: Checkboxes to reveal/hide files in explorer
    - **Right column**: Checkboxes to register file extensions for Monaco auto-open
- **Master checkboxes**: "All" in each column to select/deselect all items in that column
- **Auto-reveal**: Dotfiles with registered extensions are automatically revealed (configurable, on by default)
- **Extension registration**: Register new extensions directly from the hidden files modal
- **Visual indicator**: Eye icon (👁️) badge on folders with manually revealed files
- **Persistent state**: Revealed files persist across sessions
- **Open directly**: Access hidden files without revealing them first
    - **From folder**: Right-click → "Open Hidden Files in Code Files"
    - **From vault**: Command palette → "Open Hidden Files in Vault"
- **Temporary reveal for editing**: Hidden files opened directly are temporarily revealed in the vault index for editing, then hidden again when the tab is closed
- **Smart cleanup**: Auto-managed files hidden automatically when auto-reveal is disabled or extension unregistered
- **Safe filtering**: Excludes executables, archives, databases, binary office formats, fonts (configurable max size)
- **Configurable exclusions**: Exclude specific folders (`.git`, `node_modules`) and extensions (`tmp`, `log`, `cache`) in settings
- **Drag and drop support**: Dotfiles can be moved between folders normally; adapter patch fixes destination path calculation

### 6. **File Explorer Visual Indicators**

- **Project root highlight**: Folder set as Project Root is highlighted (default purple/rose matching Obsidian accent; customizable via setting)
- **Extension badges**:
    - Dotfiles with registered extensions show an uppercase extension badge (e.g., "ENV", "GITIGNORE") + subtle background tint
    - Regular files with unregistered extensions (excluding native Obsidian extensions like `.md`, `.canvas`) show a muted yellow "unregistered" badge
    - Native Obsidian files (`.md`, `.canvas`) show no badge
- Badges update automatically when extensions are registered or unregistered

### 7. **Dynamic Extension Management**

- **Unified system**: Base list + user additions/exclusions
- **Two modes**: Manual (curated list) or Extended (all Monaco-supported)
- **Persistent customizations**: Added/excluded extensions survive mode switches
- **Runtime changes**: Add/remove extensions without restart
- **On-the-fly registration**: Add extensions during file creation
- **Flexible switching**: Toggle between manual/extended modes anytime in settings

### 8. **50+ Themes with Live Preview**

- **Real-time preview**: Hover themes to see changes instantly
- **Brightness control**: Adjust independently of Obsidian theme
- **Popular themes**: Dracula, Monokai, Nord, Tomorrow Night, etc.
- **Theme picker**: Accessible from tab header palette icon

### 9. **Popout Window Support**

- **Secondary windows**: Views can open in separate windows
- **Keyboard shortcut**: Ctrl+Shift+Alt+Click
- **Full functionality**: All features work in popout windows
- **Navigation preserved**: History maintained across windows

### 10. **Comprehensive Settings System**

- **Gear icon access**: Settings directly from editor view
- **Global settings**: Apply to all file types (\*)
- **Per-extension settings**: Override for specific file types (.ts, .js, etc.)
- **Obsidian Settings tab**: Plugin-wide configuration
- **JSON editor**: JSONC support with comments

### 11. **Enhanced Shortcuts & Navigation**

- **Obsidian shortcuts preserved**: Ctrl+P (command palette), Ctrl+, (settings)
- **Alt+Z**: Toggle word wrap (persisted setting)
- **F1**: Monaco command palette with all actions
- **Dynamic hotkey sync**: Monaco hotkeys automatically update when Obsidian hotkey settings change (reloads editor seamlessly)
- **Navigation history**: Back/forward buttons work between view types
- **Focus restoration**: Automatic focus return after modal close

### 12. **Advanced Code Block Editing**

- **Full Monaco modal**: Edit markdown code fences in complete editor
- **Context menu**: Right-click in code fence → "Edit Code Block"
- **All languages**: Syntax highlighting and formatting in modal
- **Changes preserved**: Automatic write-back to markdown

### 13. **CSS Snippet Integration**

- **Direct editing**: Open Obsidian CSS snippets from command palette
- **Snippet controls**: Enable/disable toggle in tab header
- **Folder access**: Open snippets folder from editor
- **Live updates**: Changes apply immediately to Obsidian

### 14. **Professional Diff Viewer**

- **VS Code-like interface**: Native Monaco diff editor
- **Inline markers**: Syntax highlighting in diff view
- **Interactive widgets**: Hover-activated revert buttons
- **10-second indicator**: Diff icon appears after formatting

### 15. **Flexible File Creation**

- **Multiple entry points**: Ribbon icon, folder context menu, command palette
- **Extension suggester**: Dropdown with validation on Enter
- **Auto-registration**: Unknown extensions prompt for registration
- **Immediate opening**: New files open automatically in Monaco

## Technical Architecture

### Local Integration Achievement

**Key Evolution:** Migrated from external iframe to local Monaco integration, overcoming CSP restrictions and achieving complete offline functionality.

- **Monaco Editor** — VS Code's editor embedded locally via iframe
- **Local Assets** — **21.4 MB** bundle (no CDN, no internet required)
- **postMessage Communication** — iframe ↔ Obsidian integration
- **Custom Build System** — esbuild with specialized asset handling

See [architecture.md](architecture.md) for detailed technical overview and [monaco-local-integration.md](monaco-local-integration.md) for the crucial external → local migration process.

### Plugin Architecture

- **mountCodeEditor()** — single entry point for Monaco instances
- **CodeEditorView** — Obsidian TextFileView wrapper
- **Settings System** — flat JSON structure with per-extension configs
- **Modal Integration** — automatic focus handling via modalPatch

See [adding-features.md](adding-features.md) for development guide.

### Build System

- **esbuild** — custom configuration with asset copying
- **Local Monaco** — 12MB editor bundle with CSP workarounds
- **Formatter Integration** — Prettier standalone + Mermaid bundling
- **Theme Management** — 50+ themes with dynamic loading

**Technical Achievement:** Successfully migrated from external iframe dependency to complete local integration, solving complex CSP restrictions and asset bundling challenges.

See [monaco-local-integration.md](monaco-local-integration.md) for detailed migration process.

## Implementation Details

### Code Formatting

- **Prettier Integration** — standalone browser builds loaded locally
- **Mermaid Formatting** — custom bundled formatter
- **Format on save** — optional automatic formatting

See [prettier-markdown-formatting.md](prettier-markdown-formatting.md) and [mermaid-formatting.md](mermaid-formatting.md) for implementation details.

### Cross-File Navigation

- **Project Root Configuration** — folder context menu setup
- **Tab Reuse Logic** — smart file opening in existing tabs

See [cross-file-navigation.md](cross-file-navigation.md) for setup and implementation.

## Configuration Options

- **Editor Settings** — gear icon (⚙️) in tab header
- **Per-Extension Config** — JSON editor with JSONC support
- **Global Settings** — Obsidian Settings → Code Files
- **Project Root** — folder context menu for cross-file navigation

## Development Setup

```bash
git clone [repo-url]
cd obsidian-code-files-modif
yarn install
# Create .env with vault paths
yarn dev    # Development with hot reload
yarn build  # Production build
yarn real   # Install to production vault
```

## Package Size

**~21.4 MB total**

- Monaco Editor: ~12 MB
- Themes: ~2 MB
- Formatters (Prettier, Mermaid, Ruff, gofmt, clang-format): ~5 MB
- Plugin code: ~1 MB
- Other assets and overhead: ~1.4 MB

Formatters contribute significantly to the total size. The plugin is fully offline with no external dependencies.

- Other assets and overhead: ~1.4 MB

Formatters contribute significantly to the total size. The plugin is fully offline with no external dependencies.

## Why This Approach?

- **Complete Offline** — no external dependencies
- **Professional Features** — full VS Code editor experience
- **Customizable** — 50+ themes, extensive configuration
- **Integrated** — works seamlessly within Obsidian
- **Maintainable** — clear architecture with good documentation

## For GitHub Issue Context

This plugin represents a complete Monaco Editor integration with Obsidian, handling CSP restrictions, asset bundling, and complex iframe communication. The architecture is designed for extensibility and maintainability.

**Key differentiators:**

- Local asset bundling (no CDN)
- Advanced formatting with selective diff revert
- Cross-file navigation for TypeScript/JavaScript
- Professional code editing experience within Obsidian
- Smart save strategy with visual indicators
- Comprehensive extension management

---

**For detailed technical information, see the main [architecture.md](architecture.md) document.**
