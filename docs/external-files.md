# External Files (Outside Vault)

## Summary
The plugin can open files that live outside the normal vault folder — specifically files in Obsidian's `configDir` (`.obsidian/`), such as CSS snippets and plugin configuration files. These files are handled differently because they don't go through Obsidian's standard file indexing.

## Two Access Paths

### 1. CSS Snippets Modal
**Trigger:** Ribbon icon context menu → "Open CSS Snippet" or command palette.
**File:** `src/modals/chooseCssSnippetsModal.ts`

Lists all `.css` files in `.obsidian/snippets/` using `adapter.list()`. On selection, opens the file in a Monaco leaf with `external: true` state.

### 2. Hidden File Browser Modal
**Trigger:** Command "Browse hidden files" or context menu on a folder.
**File:** `src/modals/chooseHiddenFileModal.ts`

Allows browsing any dot-prefixed file/folder in the vault. Reveals the selected file temporarily before opening.

## Opening External Files

**File:** `src/editor/codeEditorView/editorOpeners.ts` → `openInMonacoLeaf()`

When opening a file with `external: true` in the view state:
- The `CodeEditorView` uses `adapter.read()` / `adapter.write()` directly instead of `vault.read()` / `vault.modify()` since the file is not in the vault index.
- The file is temporarily revealed (added to Obsidian's index) so it appears in the file explorer while open.
- On close, `cleanupTemporaryReveal()` removes it from the index (unless it's managed by auto-reveal or manually persisted).

## Persistence Across Sessions

External files that were open when Obsidian closes are tracked via `temporaryRevealedPaths` in settings. On next startup, `restoreRevealedFiles()` re-reveals them so Obsidian can restore the workspace layout (which references file paths that must exist in the vault index).

**Flow:**
```
Plugin unload → temporaryRevealedPaths saved in settings
Plugin load → restoreRevealedFiles() → revealItems(persist=false) for each tracked path
Workspace restore → CodeEditorView.onLoadFile() finds the file in vault index → opens normally
```

## configDir Protection

The adapter rename patch in `patches.ts` blocks any rename that would move files out of configDir, preventing accidental drag-and-drop of `.obsidian/` contents into the vault root.

---

**Revised:** ✓
