# Cross-File Navigation (TypeScript/JavaScript)

This document explains how TypeScript/JavaScript cross-file navigation works in the Code Files plugin. It allows you to Ctrl+Click on imports, function calls, or class names to jump to their definitions in other files.

---

## Overview

Cross-file navigation requires:

1. **Project Root Folder** — Set via Editor Settings (⚙️ gear icon) or folder context menu
2. **Loading project files** — All TS/JS files from the project root are loaded into Monaco
3. **TypeScript configuration** — Monaco's TypeScript language service is configured with proper URIs
4. **Navigation interception** — Ctrl+Click events are intercepted and sent to Obsidian
5. **File opening** — Obsidian opens the target file and scrolls to the definition

---

## Implementation Details

### 1. Loading Project Files

**File:** `src/editor/mountCodeEditor.ts`

**Function `loadProjectFiles`:**
```typescript
async function loadProjectFiles(
    send: (type: string, payload: Record<string, unknown>) => void
): Promise<void> {
    const root = plugin.settings.projectRootFolder;
    if (!root) return;

    const files: { path: string; content: string }[] = [];
    for (const file of plugin.app.vault.getFiles()) {
        if (!file.path.startsWith(root + '/')) continue;
        if (!['ts', 'tsx', 'js', 'jsx'].includes(file.extension)) continue;
        try {
            files.push({
                path: file.path,
                content: await plugin.app.vault.cachedRead(file)
            });
        } catch {
            /* skip unreadable files */
        }
    }
    send('load-project-files', { files });
}
```

**When it's called:**
- Once when the editor initializes (on 'ready' message)
- Loads all TypeScript/JavaScript files from the project root folder
- Sends them to Monaco via postMessage

---

### 2. Message Handler

**File:** `src/editor/mountCodeEditor.ts`

**Handler in `onMessage`:**
```typescript
case 'ready': {
    // Monaco is loaded — send config, then set initial content.
    send('init', initParams);
    send('change-value', { value });
    send('focus', {});
    void loadProjectFiles(send);
    break;
}
```

---

### 3. TypeScript Configuration in Monaco

**File:** `src/editor/monacoEditor.html`

**Creating the model with `file:///` URI:**
```javascript
// CRITICAL: The current file must have a file:/// URI so TypeScript
// can match imports with extra libs
var modelUri = monaco.Uri.parse('file:///' + context);
var existingModel = monaco.editor.getModel(modelUri);
var model = existingModel || monaco.editor.createModel('', params.lang || 'plaintext', modelUri);
opts.model = model;
```

**Configuring compilerOptions:**
```javascript
if (params.projectRootFolder) {
    var compilerOptions = {
        baseUrl: 'file:///' + params.projectRootFolder,  // Full URI, not relative path
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        allowJs: true,
        checkJs: false,
        paths: {}
    };
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
}
```

**Loading extra libs:**
```javascript
case 'load-project-files':
    if (!window._initialized) {
        // Defer if init hasn't been processed yet
        window._pendingProjectFiles = data.files;
    } else {
        for (var i = 0; i < data.files.length; i++) {
            var file = data.files[i];
            var uri = monaco.Uri.parse('file:///' + file.path);
            monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, uri.toString());
            monaco.languages.typescript.javascriptDefaults.addExtraLib(file.content, uri.toString());
            if (!monaco.editor.getModel(uri)) {
                monaco.editor.createModel(file.content, undefined, uri);
            }
        }
    }
    break;
```

---

### 4. Navigation Interception

**File:** `src/editor/monacoEditor.html`

**Registering the opener:**
```javascript
monaco.editor.registerEditorOpener({
    openCodeEditor: function(_source, resource, selectionOrPosition) {
        // Extract position (line + column)
        var position = null;
        if (selectionOrPosition && 'startLineNumber' in selectionOrPosition) {
            position = {
                lineNumber: selectionOrPosition.startLineNumber,
                column: selectionOrPosition.startColumn
            };
        } else if (selectionOrPosition && 'lineNumber' in selectionOrPosition) {
            position = {
                lineNumber: selectionOrPosition.lineNumber,
                column: selectionOrPosition.column
            };
        }
        
        // Send to Obsidian
        window.parent.postMessage({
            type: 'open-file',
            path: resource.path.replace(/^\//, ''),  // vault-relative path
            position: position,
            context: context
        }, '*');
        
        return true;  // "handled, don't open inline"
    }
});
```

---

### 5. Opening the File in Obsidian

**File:** `src/editor/mountCodeEditor.ts`

**Handler `open-file`:**
```typescript
case 'open-file': {
    if (data.context !== codeContext) break;
    const vaultPath = data.path as string;
    const position = data.position as { lineNumber: number; column: number } | null;
    const file = plugin.app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) break;

    // Look for an existing leaf in the main editor area (no sidebars, no popout windows)
    const existingLeaf = plugin.app.workspace.getLeavesOfType('code-editor').find((l) => {
        // Must be in the main window
        if (l.view.containerEl.win !== window) return false;
        // Must be in the root split (editor area), not left/right sidebar
        const root = plugin.app.workspace.rootSplit;
        let el: Element | null = l.containerEl;
        while (el && el !== root.containerEl) el = el.parentElement;
        if (!el) return false;
        // File must match
        return l.view instanceof CodeEditorView && l.view.file?.path === vaultPath;
    });

    const leaf = existingLeaf ?? plugin.app.workspace.getLeaf('tab');
    if (!existingLeaf) await leaf.openFile(file);
    plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

    if (position) {
        setTimeout(() => {
            if (leaf.view instanceof CodeEditorView && leaf.view.editor) {
                leaf.view.editor.send('scroll-to-position', { position });
            }
        }, existingLeaf ? 0 : 150);
    }
    break;
}
```

**Tab reuse logic:**
- First checks if the file is already open in a tab in the main editor area
- Excludes sidebars and popout windows
- If the file is already open, reuses the existing tab instead of creating a new one
- Scroll delay is 0ms if the tab already existed (Monaco ready), 150ms for a new file

**Handler `scroll-to-position` in the iframe:**
```javascript
case 'scroll-to-position':
    if (editor && data.position) {
        editor.setPosition(data.position);
        editor.revealPositionInCenter(data.position);
    }
    break;
```

---

### 6. Public Getter for the Editor

**File:** `src/editor/codeEditorView.ts`

```typescript
/** Expose the Monaco editor instance to allow sending messages directly to the iframe (e.g., for theme changes, formatting, etc.) */
get editor(): CodeEditorInstance | undefined {
    return this.codeEditor;
}
```

---

## Diagnostics: Verifying URIs

To verify that URIs are correctly configured:

1. **Open DevTools** (F12)
2. **Go to Console**
3. **Select the Monaco iframe**:
   - Click the "top" dropdown at the top of the console
   - Hover over entries until the active sheet highlights
   - Select the iframe (looks like `blob:app://obsidian.md/21436132-fdd0-4a72-8f5c...`)
4. **Type in the console**:
   ```javascript
   monaco.editor.getModels().map(m => m.uri.toString())
   ```
5. **Verify the result**:
   - ✅ All URIs should be `file:///templates/projet-test-sample/...`
   - ❌ If you see `inmemory://model/1`, the model wasn't created with the correct URI

---

## Common Issues

### TypeScript doesn't resolve imports

**Cause:** URI mismatch between the current file and extra libs.

**Solution:**
- Verify that the current file's model uses `monaco.Uri.parse('file:///' + context)`
- Verify that `baseUrl` is `'file:///' + projectRootFolder` (not a relative path)
- Verify that all extra libs use `file:///` URIs

### Navigation doesn't work

**Cause:** `registerEditorOpener` isn't called or the postMessage doesn't arrive.

**Solution:**
- Verify that `registerEditorOpener` is called after `monaco.editor.create`
- Check in the console that the `open-file` postMessage is sent
- Verify that the `open-file` handler in `mountCodeEditor.ts` is triggered

### Multiple tabs open for the same file

**Cause:** The tab reuse logic doesn't find the existing tab.

**Solution:**
- Verify that the file is open in the main editor area (not in a sidebar or popout)
- The check walks up the DOM tree to `rootSplit.containerEl` to exclude sidebars
- If Obsidian's internal structure changes in a future version, this check may need adjustment

### Scroll to position doesn't work

**Cause:** The file opens but the cursor doesn't position.

**Solution:**
- Verify that `position` is correctly extracted from `selectionOrPosition`
- Verify that the `setTimeout` delay is sufficient for Monaco to be ready (0ms for existing tabs, 150ms for new files)
- Verify that `leaf.view instanceof CodeEditorView` is true

---

## Test Project

A sample project is available in `templates/projet-test-sample/` with 3 TypeScript files:

- **utils.ts** — Utility functions (add, multiply, Calculator)
- **service.ts** — Service that imports utils.ts
- **main.ts** — Entry point that imports service.ts and utils.ts

**To test:**
1. Copy `templates/projet-test-sample/` to your vault
2. Open a TS file in Monaco
3. Click ⚙️ (gear) in the tab header
4. Configure "Project Root Folder" → `templates/projet-test-sample`
5. Open `main.ts`
6. Ctrl+Click on `MathService` → opens `service.ts` at the class line
7. Ctrl+Click on `add` → opens `utils.ts` at the function line

---

## Modified Files

- `src/types/types.ts` — Added `projectRootFolder`
- `src/ui/folderSuggest.ts` — New component
- `src/modals/editorSettingsModal.ts` — Project Root Folder field
- `src/editor/mountCodeEditor.ts` — `loadProjectFiles` + handlers
- `src/editor/monacoEditor.html` — TypeScript configuration + opener
- `src/editor/codeEditorView.ts` — Public `editor` getter
- `templates/projet-test-sample/` — Test project
