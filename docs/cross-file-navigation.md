# Cross-File Navigation (TypeScript/JavaScript)

## Summary

Ctrl+Click on imports/functions to jump to definitions in other files. Requires Project Root Folder configuration and loads all TS/JS files into Monaco's TypeScript service.

## Setup

**IMPORTANT:** Cross-file navigation requires configuring the Project Root Folder.

**Two ways to set the Project Root Folder:**

1. **Via context menu**:
    - Right-click any folder in the file explorer
    - Select **Code Files → Define as Project Root Folder**
    - The folder is highlighted (default purple/rose matching Obsidian's accent color) in the explorer
    - To clear: right-click the same folder → **Code Files → Clear Project Root Folder**
    - **Note:** Defining or clearing the root folder via the context menu automatically reveals or hides dotfiles according to your "Show Hidden Files" setting.

2. **Via Editor Settings**:
    - Open Editor Settings (⚙️ gear icon in tab header)
    - Set **Project Root Folder** to your TypeScript/JavaScript project folder
    - Toggle **Use tsconfig.json** to apply compiler options from your project's `tsconfig.json` for IntelliSense and navigation.
    - Toggle **Show Hidden Files** to reveal dotfiles and dot-folders in the project root and its subfolders.

Monaco will load all TS/JS files from that folder for IntelliSense and navigation.

**Note:** Without a Project Root Folder, Ctrl+Click on imports will not work. Clearing the project root folder (by emptying the field or via the context menu) will automatically hide the revealed dotfiles.

See `docs/cross-file-navigation.md` for implementation details. _(Developer only)_

## Implementation Overview

### Key Files

- `mountCodeEditor.ts` — `loadProjectFiles()`, message handlers
- `monacoEditor.html` — TypeScript config, `registerEditorOpener()`
- `codeEditorView.ts` — public `editor` getter, tab reuse logic

### Flow

```
Project Root set → loadProjectFiles() → Monaco TS service → Ctrl+Click → open-file message → Obsidian opens file
```

## Core Functions

### Loading Project Files

**Location:** `mountCodeEditor.ts`

```typescript
async function loadProjectFiles(send) {
	// Loads all .ts/.tsx/.js/.jsx files from projectRootFolder
	// Sends to Monaco via 'load-project-files' message
}
```

### TypeScript Configuration

**Location:** `monacoEditor.html`

- Model URI: `file:///` + context (critical for import matching)
- Compiler options: `baseUrl: 'file:///' + projectRootFolder`
- Extra libs: all project files added with `file:///` URIs

### Navigation Interception

**Location:** `monacoEditor.html`

```javascript
monaco.editor.registerEditorOpener({
	openCodeEditor: function (_source, resource, selectionOrPosition) {
		// Extract position, send 'open-file' message to parent
		return true; // "handled, don't open inline"
	}
});
```

### File Opening

**Location:** `mountCodeEditor.ts`

- Finds existing tab in main editor area (excludes sidebars)
- Reuses tab if file already open, creates new tab otherwise
- Scrolls to definition position with appropriate delay

## URI Requirements

**Critical:** All URIs must use `file:///` scheme for TypeScript import resolution:

- Current file: `monaco.Uri.parse('file:///' + context)`
- Base URL: `'file:///' + projectRootFolder`
- Extra libs: `'file:///' + file.path`

## Diagnostics

Verify URIs in Monaco iframe console:

```javascript
monaco.editor.getModels().map((m) => m.uri.toString());
// Should show: file:///project/path/file.ts (not inmemory://model/1)
```

## Test Project

**Location:** `templates/projet-test-sample-for-obsidian/`

- 3 TypeScript files with cross-imports
- Test: Ctrl+Click on `MathService` → opens `service.ts`
- Test: Ctrl+Click on `add` → opens `utils.ts`

---

**Revised:** ✓
