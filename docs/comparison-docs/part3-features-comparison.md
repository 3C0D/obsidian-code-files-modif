# Part 3: Features Comparison - Legacy vs Current Project

**Previous**: [Part 2: Source Code Analysis](part2-source-analysis.md)  
**Back to**: [Project Overview](project-overview.md)

---

## Overview

This document compares the actual features and functionality between the legacy and current versions of the Code Files plugin, highlighting what's new, what's improved, and what's changed.

## Feature Summary Table

| Feature Category | Legacy | Current | Status |
|-----------------|--------|---------|--------|
| **Core Editor** | Basic Monaco | Enhanced Monaco | ✅ Improved |
| **Themes** | 54 themes | 50+ themes | ✅ Enhanced |
| **Code Formatting** | None | 10+ languages | ✨ New |
| **Format Diff Viewer** | None | Full diff + revert | ✨ New |
| **Cross-file Navigation** | None | TypeScript/JavaScript | ✨ New |
| **Hidden Files** | None | Full support | ✨ New |
| **Extension Management** | Basic | Advanced | ✅ Improved |
| **Settings UI** | Simple | Interactive JSON | ✅ Improved |
| **CSS Snippets** | Basic editing | Edit + toggle | ✅ Improved |
| **Code Block Editing** | Basic | Enhanced | ✅ Improved |
| **File Creation** | Basic modal | Enhanced modal | ✅ Improved |
| **Configuration** | Global only | Global + per-extension | ✨ New |
| **Project Root** | None | Folder highlighting | ✨ New |
| **Auto-save** | Always on | Toggleable | ✅ Improved |
| **Editor Brightness** | None | Adjustable | ✨ New |

## 1. Core Editor Features

### 1.1 Monaco Editor Integration

#### Legacy
- Monaco loaded from external source
- Basic editor options
- Limited customization
- No iframe isolation

**Settings**:
```typescript
{
    extensions: ["ts", "tsx", "js", "jsx", "py"],
    folding: true,
    lineNumbers: true,
    minimap: true,
    semanticValidation: true,
    syntaxValidation: true,
    theme: "default",
    overwriteBg: true
}
```

#### Current
- Monaco bundled locally (~12 MB)
- Full Monaco API access
- Iframe isolation for security
- PostMessage communication
- Complete offline support

**Settings** (expanded):
```typescript
{
    extensions: [...17 default extensions],
    semanticValidation: true,
    syntaxValidation: true,
    theme: 'default',
    showRibbonIcon: true,
    recentThemes: [],
    autoSave: false,              // NEW
    editorBrightness: 1,          // NEW
    wordWrap: 'off',
    folding: true,
    lineNumbers: true,
    minimap: true,
    editorConfigs: {...},         // NEW
    allExtensions: true,          // NEW
    excludedExtensions: [...],    // NEW
    extraExtensions: [],          // NEW
    projectRootFolder: '',        // NEW
    projectRootFolderColor: '',   // NEW
    lastSelectedConfigExtension: '' // NEW
}
```

**Key Improvements**:
- ✅ Local assets (no internet required)
- ✅ Iframe isolation (better security)
- ✅ More default extensions (5 → 17)
- ✅ Configurable auto-save
- ✅ Adjustable brightness
- ✅ Per-extension configuration

### 1.2 Syntax Highlighting

#### Legacy
- Automatic language detection
- Based on file extension
- ~50 languages supported

#### Current
- Automatic language detection
- Based on file extension
- ~100+ languages supported (full Monaco)
- Better syntax definitions
- More accurate highlighting

**Improvement**: More languages, better accuracy

### 1.3 Editor Options

#### Legacy (Global Only)
```typescript
{
    folding: boolean,
    lineNumbers: boolean,
    minimap: boolean,
    semanticValidation: boolean,
    syntaxValidation: boolean
}
```

#### Current (Global + Per-Extension)
```json
{
    "tabSize": 4,
    "insertSpaces": true,
    "formatOnSave": true,
    "formatOnType": false,
    "trimAutoWhitespace": true,
    "trimTrailingWhitespace": true,
    "printWidth": 100,
    "renderWhitespace": "selection",
    "rulers": [80, 120],
    "fontSize": 14,
    "bracketPairColorization.enabled": true,
    // ... and 50+ more Monaco options
}
```

**Key Improvements**:
- ✅ Per-extension overrides
- ✅ VS Code-compatible options
- ✅ Interactive JSON editor
- ✅ Live preview of changes
- ✅ Comment support in config

## 2. Theme System

### 2.1 Theme Selection

#### Legacy
- 54 themes hardcoded in `themes.ts`
- Simple dropdown in settings
- No preview
- Theme names in code

**Theme List** (54 themes):
Active4D, All Hallows Eve, Amy, Birds of Paradise, Blackboard, Brilliance Black, Brilliance Dull, Chrome DevTools, Clouds Midnight, Clouds, Cobalt, Cobalt2, Dawn, Dracula, Dreamweaver, Eiffel, Espresso Libre, GitHub Dark, GitHub Light, GitHub, IDLE, Katzenmilch, Kuroir Theme, LAZY, MagicWB (Amiga), Merbivore Soft, Merbivore, Monokai Bright, Monokai, Night Owl, Nord, Oceanic Next, Pastels on Dark, Slush and Poppies, Solarized-dark, Solarized-light, SpaceCadet, Sunburst, Textmate (Mac Classic), Tomorrow-Night-Blue, Tomorrow-Night-Bright, Tomorrow-Night-Eighties, Tomorrow-Night, Tomorrow, Twilight, Upstream Sunburst, Vibrant Ink, Xcode_default, Zenburnesque, iPlastic, idleFingers, krTheme, monoindustrial

#### Current
- 50+ themes from `monaco-themes` package
- Dedicated theme picker modal
- **Live preview** (hover to preview)
- Recent themes list (last 5)
- Brightness adjustment in picker
- Theme files in `monaco-themes/` folder

**Theme Picker Features**:
- 🎨 Grid layout with theme names
- 👁️ Hover to preview instantly
- ⬅️➡️ Arrow keys to adjust brightness
- ⭐ Recent themes at the top
- 🔍 Easy to browse and compare

**Key Improvements**:
- ✅ Live preview before applying
- ✅ Recent themes tracking
- ✅ Brightness control
- ✅ Better UX with modal
- ✅ Themes loaded from files (easier to add more)

### 2.2 Theme Application

#### Legacy
- Applied globally
- Requires reload sometimes
- Background overwrite option

#### Current
- Applied instantly
- No reload needed
- Broadcast to all open editors
- Brightness filter overlay
- Respects Obsidian's dark/light mode

**Improvement**: Instant application, better integration

## 3. Code Formatting (NEW in Current)

### Legacy
❌ No formatting support

### Current
✅ Full formatting support for 10+ languages

#### Supported Languages

| Language | Parser | Features |
|----------|--------|----------|
| **JavaScript** | babel | JSX support |
| **TypeScript** | typescript | TSX support |
| **CSS** | css | Standard CSS |
| **SCSS** | scss | Sass syntax |
| **Less** | less | Less syntax |
| **HTML** | html | Full HTML |
| **JSON** | json | JSON formatting |
| **YAML** | yaml | YAML formatting |
| **GraphQL** | graphql | GraphQL queries |
| **Markdown** | markdown | With Mermaid blocks |
| **Mermaid** | mermaid-formatter | Standalone .mmd files |

#### Formatting Triggers

1. **Keyboard**: `Shift+Alt+F`
2. **Context Menu**: Right-click → "📝 Format Document"
3. **On Save**: Enable `formatOnSave` in config
4. **Command Palette**: F1 → Format Document

#### Format Configuration

**Per-language settings**:
```json
{
    "printWidth": 100,        // Line length for Prettier
    "tabSize": 2,             // Indentation
    "insertSpaces": true,     // Spaces vs tabs
    "formatOnSave": true,     // Auto-format on save
    "formatOnType": false     // Format while typing
}
```

**Example**: TypeScript with 2-space indent
```json
// .ts extension config
{
    "tabSize": 2,
    "printWidth": 80
}
```

### 3.1 Format Diff Viewer (Masterpiece Feature)

**The Problem**: After formatting, you can't see what changed.

**The Solution**: Side-by-side diff viewer with selective revert.

#### Features

1. **Diff Icon** in tab header (appears for 10 seconds after format)
2. **Side-by-side comparison**: Original vs Formatted
3. **Syntax highlighting** in both panels
4. **Inline diff markers**: Added/removed/modified lines
5. **Selective Revert**: Click ↩ button in gutter to revert specific blocks
6. **Revert All**: Undo all formatting changes at once
7. **Context Menu**: "⟷ Show Format Diff" always available

#### How It Works

```
Before Format          After Format           Diff Viewer
─────────────         ─────────────          ─────────────────────────
function foo(){       function foo() {       │ Original  │ Formatted │
return 42;            return 42;             │ function  │ function  │
}                     }                      │ foo(){    │ foo() {   │ ← Changed
                                             │ return 42;│ return 42;│
                                             │ }         │ }         │
                                             └───────────┴───────────┘
                                                   ↩ Revert block
```

#### Use Cases

- **Review changes**: See exactly what the formatter did
- **Selective revert**: Keep some changes, revert others
- **Learning tool**: Understand formatting rules
- **Safety net**: Undo unwanted changes

**This is one of the plugin's standout features** - no other Obsidian plugin has this level of formatting control.

## 4. Cross-file Navigation (NEW in Current)

### Legacy
❌ No cross-file navigation

### Current
✅ Full TypeScript/JavaScript navigation

#### Features

1. **Ctrl+Click** on imports to jump to definition
2. **Go to Definition** (F12) with peek window
3. **Smart tab reuse**: Reuses existing tabs
4. **Relative imports**: `./utils`, `../service`
5. **File extensions**: `.ts`, `.tsx`, `.js`, `.jsx`

#### Setup Required

**Step 1**: Define Project Root Folder
- Right-click folder in explorer
- **Code Files → Define as Project Root Folder**
- Folder name turns green

**Step 2**: Navigate
- Ctrl+Click on any import
- Opens file at exact definition

#### Example

```typescript
// main.ts
import { helper } from './utils/helper';
//                      ↑ Ctrl+Click here
//                      Opens utils/helper.ts
```

#### Project Root Folder

**Visual Indicator**:
- Folder name highlighted in green
- Custom color configurable
- Persisted in settings

**Clear Root**:
- Right-click same folder
- **Code Files → Clear Project Root Folder**

**Why Needed**: Monaco needs to load all project files for IntelliSense and navigation.

## 5. Hidden Files Support (NEW in Current)

### Legacy
❌ Cannot open hidden files

### Current
✅ Full hidden file support

#### Features

1. **Open from folder**: Right-click folder → **Code Files → Open Hidden Files**
2. **Open from vault**: Command palette → **"Open Hidden Files in Vault"**
3. **Suggester UI**: Lists all hidden files with paths
4. **Size filter**: Max 10 MB
5. **Safety filter**: Excludes dangerous formats

#### Excluded Formats

- **Executables**: exe, dll, so, dylib, app, dmg, msi
- **Archives**: zip, rar, 7z, tar, gz, bz2, xz
- **Databases**: db, sqlite, mdb
- **Binary Office**: doc, xls, ppt
- **Fonts**: ttf, otf, woff, woff2, eot

#### Common Use Cases

- `.gitignore` - Git ignore rules
- `.env` - Environment variables
- `.dockerignore` - Docker ignore rules
- `.eslintrc` - ESLint config
- `.prettierrc` - Prettier config
- `.editorconfig` - Editor config

## 6. Extension Management

### 6.1 Extension Registration

#### Legacy
- Manual list in settings
- 5 default extensions
- No auto-registration
- Conflicts cause errors

**Default Extensions**:
```typescript
["ts", "tsx", "js", "jsx", "py"]
```

#### Current
- **Two modes**: Manual or Auto
- 17 default extensions (manual mode)
- Auto-register all Monaco languages
- Exclude Obsidian native formats
- Add extras manually
- No conflicts (smart handling)

**Default Extensions** (Manual Mode):
```typescript
[
    'ts', 'tsx', 'js', 'jsx', 'py',
    'json', 'jsonc', 'css', 'html', 'sh',
    'yaml', 'sql', 'php', 'cs', 'java',
    'go', 'rs', 'cpp', 'c'
]
```

**Auto Mode**:
- Registers all Monaco-supported extensions
- Excludes: md, canvas, pdf, images, audio, video
- Add extras: `extraExtensions`
- Exclude specific: `excludedExtensions`

### 6.2 Dynamic Extension Management

#### Legacy
- Add in settings only
- Restart required

#### Current
- Add from **Create Code File** modal
- Add from **Rename Extension** dialog
- Add from settings
- **No restart needed**
- Immediate effect

**Example Flow**:
1. Try to create `.rs` file
2. Extension not registered
3. Modal shows **+** button
4. Click to register `.rs`
5. File opens immediately

## 7. Settings and Configuration

### 7.1 Settings UI

#### Legacy
- Simple Obsidian settings tab
- Toggle switches
- Dropdown for theme
- Extension list (text input)

#### Current
- Enhanced settings tab
- Toggle switches
- Theme picker button (opens modal)
- Extension management UI
- **Editor Config** section (JSON editor)
- Extension picker dropdown
- Live validation

### 7.2 Editor Configuration (NEW)

#### Legacy
❌ No per-extension config

#### Current
✅ Full per-extension configuration

**Two Scopes**:
1. **Global (`*`)**: Applies to all files
2. **Per-extension (`.ts`, `.js`, etc.)**: Overrides global

**JSON Editor**:
- Pre-filled with defaults
- Comment support (JSONC)
- Trailing comma support
- Live validation
- Instant apply (on close)

**Example**:

```json
// Global config (*)
{
    "tabSize": 4,
    "printWidth": 100
}

// TypeScript override (.ts)
{
    "tabSize": 2,
    "printWidth": 80
}
```

**Result**: TypeScript files use 2 spaces, others use 4.

### 7.3 Settings Modal (Gear Icon)

#### Legacy
❌ No in-editor settings

#### Current
✅ Full settings modal in tab header

**Toggles**:
- **Auto Save**: On/off (circle indicator when off)
- **Semantic Validation**: JS/TS type checking
- **Syntax Validation**: Basic error checking
- **Editor Brightness**: Slider (0.2 - 2.0)

**Configuration**:
- **Project Root Folder**: Folder picker
- **Editor Config**: JSON editor (global + per-extension)

**Access**:
- Gear icon (⚙️) in tab header
- F1 → Editor Settings
- Right-click → Editor Settings

## 8. CSS Snippet Support

### 8.1 CSS Snippet Editing

#### Legacy
- Command: "Edit CSS Snippet"
- Opens snippet in Monaco
- Basic editing only

#### Current
- Command: "Edit CSS Snippet"
- Opens snippet in Monaco
- **Toggle enable/disable** in tab header
- **Open snippets folder** in tab header
- Enhanced editing

### 8.2 CSS Snippet Controls (NEW)

**Tab Header Icons** (when editing snippet):

| Icon | Function |
|------|----------|
| 📁 **Folder** | Open snippets folder in system explorer |
| 🔘 **Toggle** | Enable/disable snippet without leaving editor |

**Toggle Switch**:
- Shows current state (on/off)
- Updates instantly
- Tooltip shows "Enable" or "Disable"
- No need to go to Obsidian settings

**Use Case**:
1. Edit CSS snippet
2. Save changes
3. Click toggle to enable
4. See changes immediately
5. Toggle off if needed

## 9. Code Block Editing

### 9.1 Fence Editing

#### Legacy
- Right-click in code fence
- "Edit Code Block in Monaco Editor"
- Opens in modal
- Basic editing
- Save writes back

#### Current
- Right-click in code fence
- "Edit Code Block in Monaco Editor"
- Opens in full-screen modal
- **Full Monaco features**
- **Formatting support**
- **Theme support**
- Save writes back
- Preserves language tag

### 9.2 Fence Detection

#### Legacy
- Basic fence detection
- Checks if cursor in ` ```lang ... ``` `

#### Current
- Enhanced fence detection
- Checks cursor position
- Validates fence structure
- Handles nested fences
- Better error handling

## 10. File Management

### 10.1 Creating Code Files

#### Legacy
- Ribbon icon
- Right-click folder → "Create Code File"
- Command palette
- Modal with filename + extension dropdown

#### Current
- Ribbon icon (toggleable)
- Right-click folder → **Code Files → Create Code File**
- Command palette
- Enhanced modal:
  - Filename input
  - Extension dropdown
  - **+ button** to register new extensions
  - Auto-opens in Monaco

### 10.2 Renaming Extensions (NEW)

#### Legacy
❌ No extension renaming

#### Current
✅ Full extension renaming

**Access**:
- Pencil icon (✏️) in tab header
- Right-click file → "Rename Extension"
- Right-click in editor → "Rename Extension"
- Command palette

**Features**:
- Change file extension
- Auto-register if unknown
- Updates file immediately
- Reopens with new language

### 10.3 Opening Files in Monaco

#### Legacy
- Files with registered extensions open automatically
- Command: "Open current file in Monaco Editor"

#### Current
- Files with registered extensions open automatically
- Command: "Open current file in Monaco Editor"
- Right-click file → "Open in Monaco Editor"
- Right-click in editor → "Open in Monaco Editor"
- **Return arrow** (⬅️) for unregistered extensions

**Return Arrow**:
- Appears for files with unregistered extensions
- Click to return to default Obsidian view
- Only shows when needed

## 11. Tab Header Controls

### 11.1 Legacy Tab Header
- No custom controls
- Standard Obsidian tab

### 11.2 Current Tab Header

**Standard Icons** (all files):

| Icon | Function |
|------|----------|
| ✏️ **Pencil** | Rename file extension |
| 🎨 **Palette** | Open theme picker |
| ⚙️ **Gear** | Open editor settings |
| ⬅️ **Arrow** | Return to default view (unregistered extensions only) |

**CSS Snippet Icons** (when editing `.obsidian/snippets/*.css`):

| Icon | Function |
|------|----------|
| 📁 **Folder** | Open snippets folder |
| 🔘 **Toggle** | Enable/disable snippet |

**Format Diff Icon** (after formatting):

| Icon | Function |
|------|----------|
| ⟷ **Diff** | Show format diff viewer (visible for 10 seconds) |

**Auto-save Indicator**:
- ⭕ Circle when auto-save is off and file has unsaved changes

## 12. Command Palette Integration

### 12.1 Legacy Commands

1. Open current code block in Monaco Editor
2. Open current file in Monaco Editor
3. Edit CSS Snippet
4. Create new Code File

**Total**: 4 commands

### 12.2 Current Commands

1. Open current code block in Monaco Editor
2. Open current file in Monaco Editor
3. Edit CSS Snippet
4. Create new Code File
5. **Open Hidden Files in Vault** (NEW)
6. **Rename file extension** (NEW)
7. **Open in Monaco Editor** (NEW - from any file)

**Plus Monaco Commands** (F1 in editor):
- Format Document
- Go to Definition
- Find
- Replace
- Toggle Word Wrap
- And 50+ more Monaco commands

**Total**: 7+ Obsidian commands + 50+ Monaco commands

## 13. Context Menus

### 13.1 File Explorer Context Menu

#### Legacy
- Right-click folder → "Create Code File"

#### Current
- Right-click folder → **Code Files** submenu:
  - **Create Code File**
  - **Define as Project Root Folder** (NEW)
  - **Clear Project Root Folder** (NEW)
  - **Open Hidden Files in Code Files** (NEW)
- Right-click file → "Open in Monaco Editor" (NEW)
- Right-click file → "Rename Extension" (NEW)

### 13.2 Editor Context Menu

#### Legacy
- Right-click in code fence → "Edit Code Block in Monaco Editor"

#### Current
- Right-click in code fence → "Edit Code Block in Monaco Editor"
- Right-click anywhere → "Open in Monaco Editor" (NEW)
- Right-click anywhere → "Rename Extension" (NEW)

### 13.3 Monaco Context Menu (F1)

#### Legacy
- Basic Monaco commands

#### Current
- Full Monaco command palette
- Code Files custom commands
- Format Document
- Show Format Diff
- Editor Settings
- Change Theme
- And more...

## 14. New Features Summary

### Features NOT in Legacy

1. ✨ **Code Formatting** (10+ languages)
2. ✨ **Format Diff Viewer** with selective revert
3. ✨ **Cross-file Navigation** (TypeScript/JavaScript)
4. ✨ **Hidden Files Support**
5. ✨ **Per-extension Configuration**
6. ✨ **Live Configuration Editor** (JSON)
7. ✨ **Project Root Folder** with highlighting
8. ✨ **Extension Renaming**
9. ✨ **Auto-save Toggle**
10. ✨ **Editor Brightness Control**
11. ✨ **Theme Picker Modal** with live preview
12. ✨ **Recent Themes Tracking**
13. ✨ **CSS Snippet Toggle** in editor
14. ✨ **Open Snippets Folder** button
15. ✨ **Return Arrow** for unregistered files
16. ✨ **Dynamic Extension Registration**
17. ✨ **All Extensions Mode**
18. ✨ **Excluded/Extra Extensions**
19. ✨ **Render Whitespace** (selection mode)
20. ✨ **Enhanced Context Menus**

## 15. Improved Features

### Features Enhanced from Legacy

1. ✅ **Monaco Integration**: External → Local bundled
2. ✅ **Theme System**: Dropdown → Modal with preview
3. ✅ **Extension Management**: Manual → Manual + Auto modes
4. ✅ **Settings UI**: Basic → Interactive JSON editor
5. ✅ **CSS Editing**: Basic → With toggle controls
6. ✅ **Code Block Editing**: Basic → Full Monaco features
7. ✅ **File Creation**: Simple → Enhanced with registration
8. ✅ **Error Handling**: Generic → Specific with recovery
9. ✅ **Default Extensions**: 5 → 17
10. ✅ **Tab Header**: Empty → Rich controls

## 16. Removed/Changed Features

### Features Removed

1. ❌ **overwriteBg** setting (replaced by brightness control)

### Features Changed

1. 🔄 **Theme application**: Reload sometimes → Instant always
2. 🔄 **Extension registration**: Restart required → Immediate
3. 🔄 **Settings**: Global only → Global + per-extension

## 17. Performance Comparison

### Legacy
- **Load Time**: Fast (external Monaco)
- **Memory**: Low (~5 MB)
- **Startup**: Quick
- **File Size**: Small (~1 MB)

### Current
- **Load Time**: Slightly slower (local Monaco)
- **Memory**: Higher (~20 MB with Monaco loaded)
- **Startup**: Slightly slower (more features)
- **File Size**: Large (~17.5 MB with all assets)

**Trade-off**: Larger size and slightly slower startup for complete offline functionality and many more features.

## 18. User Experience Improvements

### Workflow Enhancements

1. **No Internet Required**: Everything works offline
2. **Instant Feedback**: Live preview, instant theme changes
3. **Better Discoverability**: Context menus, tab header icons
4. **Safety Nets**: Format diff with revert, auto-save indicator
5. **Flexibility**: Per-extension config, dynamic registration
6. **Visual Feedback**: Project folder highlighting, unsaved indicator
7. **Keyboard Shortcuts**: More commands, better accessibility
8. **Error Recovery**: Better error messages, fallback mechanisms

### Developer Experience

1. **Cross-file Navigation**: Jump to definitions
2. **Format on Save**: Automatic code formatting
3. **Diff Viewer**: Review formatting changes
4. **Hidden Files**: Edit config files
5. **Project Root**: Proper IntelliSense
6. **Live Config**: Test settings immediately

## Summary

The current version represents a massive evolution from the legacy version:

### Legacy Strengths
✅ Simple and lightweight  
✅ Quick to load  
✅ Easy to understand  
✅ Good for basic editing  

### Current Strengths
✅ Feature-rich (20+ new features)  
✅ Professional code editor experience  
✅ Complete offline functionality  
✅ Advanced formatting with diff viewer  
✅ Cross-file navigation  
✅ Highly configurable  
✅ Better UX with visual feedback  
✅ Production-ready  

### Trade-offs
- Larger file size (1 MB → 17.5 MB)
- Slightly slower startup
- More complex (but better organized)
- Steeper learning curve

### Recommendation

**Use Legacy If**:
- You need a lightweight plugin
- You only edit simple code files
- You don't need formatting
- You want minimal features

**Use Current If**:
- You want a professional code editor
- You need code formatting
- You work with TypeScript/JavaScript projects
- You want advanced features
- You need offline functionality
- You're serious about code editing in Obsidian

The current version is designed for users who want a complete, professional code editing experience inside Obsidian, with all the features you'd expect from a modern code editor.

---

**Back to**: [Project Overview](project-overview.md) | [Part 1: Technical Comparison](part1-technical-comparison.md) | [Part 2: Source Code Analysis](part2-source-analysis.md)
