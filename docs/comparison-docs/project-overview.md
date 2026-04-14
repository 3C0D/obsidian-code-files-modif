# Code Files Plugin - Project Overview

## What is this project?

Code Files is an Obsidian plugin that lets you edit code files directly inside Obsidian using a full-featured code editor (the same one used in VS Code). You get syntax highlighting, code formatting, themes, and many other professional coding features.

## Two Versions

This project has evolved through two major versions:

1. **Legacy Version** - Simple, relied on external tools
2. **Current Version** - Advanced, fully independent with local assets

## Installation Methods

### Method 1: Download Release (Easiest)

1. Download the latest `code-files.zip` from GitHub releases
2. Extract it into your vault's `.obsidian/plugins/` folder
3. Restart Obsidian
4. Enable the plugin in Settings → Community Plugins

**Size**: ~17.5 MB (includes full Monaco editor and 50+ themes)

### Method 2: Build from Source (For Developers)

#### Option A: External Development
Develop outside your vault, then install to a test vault:

```bash
git clone https://github.com/3C0D/obsidian-code-files-modif.git
cd obsidian-code-files-modif
yarn install
```

Fill the `.env` file with your vault paths:
```
TEST_VAULT=C:\path\to\test\vault
REAL_VAULT=C:\path\to\production\vault
```

Then:
- `yarn dev` - Development mode with hot reload
- `yarn real` - Install to production vault

#### Option B: In-place Development
Develop directly inside your vault's plugins folder:

```bash
cd /path/to/vault/.obsidian/plugins/
git clone https://github.com/3C0D/obsidian-code-files-modif.git code-files
cd code-files
yarn install
yarn build
```

No `.env` file needed - it builds right where it is.

## Quick Start Commands

Once installed:

- `yarn start` - Install dependencies and start development
- `yarn dev` - Development mode with auto-reload
- `yarn build` - Build for distribution
- `yarn real` - Build and install to production vault
- `yarn v` - Update version (interactive)
- `yarn r` - Create GitHub release
- `yarn acp` - Git add, commit, and push

## What Makes This Plugin Special?

### Full Monaco Editor
The same powerful editor used in VS Code, running locally inside Obsidian. No internet connection needed.

### 50+ Themes
Choose from Dracula, Monokai, Nord, Tomorrow Night, and many more. Live preview before applying.

### Code Formatting
Format your code with one keystroke (`Shift+Alt+F`). Supports JavaScript, TypeScript, CSS, HTML, JSON, YAML, Markdown, Mermaid, and more.

**Format Diff Viewer**: After formatting, view a side-by-side comparison of all changes with the ability to selectively revert specific blocks. This is one of the plugin's standout features.

**Open Any File**: You can open and format files even if their extension isn't registered in the plugin settings.

### Cross-file Navigation
Ctrl+Click on imports to jump to other files in your project. Works with TypeScript and JavaScript.

**Setup Required**: Right-click a folder in the file explorer → **Code Files → Define as Project Root Folder** to enable this feature.

### Everything Local
All assets (editor, themes, formatters) are bundled with the plugin. No external dependencies, no CDN, no internet required.

### Hidden Files Support
Open and edit hidden files (like `.gitignore`, `.env`, `.dockerignore`) that aren't normally visible in Obsidian's file explorer.

- Right-click a folder → **Code Files → Open Hidden Files**
- Command palette → **"Open Hidden Files in Vault"**

### Live Configuration
Configure editor settings interactively with a pre-filled JSON editor (like VS Code).

- **Per-file type**: Configure settings for specific extensions (`.ts`, `.js`, `.css`, etc.)
- **Global settings**: Apply settings to all file types with `*`
- **Live updates**: Changes apply immediately when you close the settings panel
- **VS Code options**: Supports standard Monaco `IEditorOptions` (tabSize, formatOnSave, fontSize, rulers, etc.)

Access via the gear icon (⚙️) in the tab header or plugin settings.

## Project Size

**~17.5 MB total**

Breakdown:
- Monaco Editor: ~12 MB (full VS Code editor)
- 50+ Themes: ~2 MB
- Code Formatters: ~2 MB (Prettier + Mermaid)
- Plugin Code: ~1 MB

All assets are bundled locally for complete offline functionality.

## Development Philosophy

### Legacy Version
- Simple and quick to set up
- Used external tools and frameworks
- Limited customization
- Good for learning

### Current Version
- Full control over everything
- Custom build scripts
- Highly customizable
- Production-ready
- Independent (no external tools)

## Documentation Structure

This comparison documentation is organized in multiple parts:

1. **[README.md](README.md)** - Documentation index and quick navigation
2. **[Project Overview](project-overview.md)** - Simple introduction
3. **[Part 1: Technical Comparison](part1-technical-comparison.md)** - Build system and configuration
4. **[Part 2: Source Code Analysis](part2-source-analysis.md)** - Code organization (coming soon)
5. **[Part 3: Features Comparison](part3-features-comparison.md)** - Feature comparison (coming soon)

## Who Should Use This?

### Use the Plugin If:
- You want to edit code files in Obsidian
- You need syntax highlighting and formatting
- You want a professional code editor experience
- You work with TypeScript, JavaScript, CSS, HTML, JSON, YAML, Markdown, or Mermaid

### Develop This Plugin If:
- You want to learn Obsidian plugin development
- You need to customize the code editor features
- You want to add support for more languages
- You're interested in Monaco editor integration

## Key Features at a Glance

✅ Full Monaco Editor (VS Code's editor)  
✅ 50+ themes with live preview  
✅ Code formatting (10+ languages)  
✅ Syntax highlighting  
✅ Line numbers, minimap, folding  
✅ Cross-file navigation (TypeScript/JavaScript)  
✅ Edit code blocks from markdown  
✅ Create and manage code files  
✅ Edit CSS snippets  
✅ Format on save  
✅ Diff viewer for formatting changes  
✅ Selective revert for formatting  
✅ Everything works offline  

## Getting Help

- Read the main plugin README.md for complete user documentation
- Check this comparison documentation for understanding the project evolution
- Look at `templates/format-test-samples/` for formatting examples
- Try `templates/projet-test-sample/` for cross-file navigation testing

## Contributing

The project uses:
- TypeScript 5.8.2
- ESBuild for bundling
- Custom scripts for automation
- Monaco Editor 0.55.1
- Prettier for formatting
- Mermaid Formatter for diagrams

All development happens outside the vault (or in-place if you prefer), with automated builds to test/production vaults.

## License

MIT

---

**Next**: Read [Part 1: Technical Comparison](part1-technical-comparison.md) for detailed differences between legacy and current versions.
