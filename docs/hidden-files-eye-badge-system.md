# Hidden Files Eye Badge System

## Summary

The eye badge (👁️) appears on folders containing **manually revealed** dotfiles or dotfolders (stored in `plugin.settings.revealedItems`). It's managed by `decorateFolders()` and updated after file operations. Dotfiles and dotfolders are handled by the reveal system, with symlink detection to skip symbolic links. The system now supports revealing both files and folders, with cross-platform reconciliation.

---

## Core Functions

### 1. `decorateFolders(plugin)` — Apply/Remove Eye Badge

**Location:** `hiddenFiles/badge.ts`

**Purpose:** Adds or removes the eye icon badge on folders based on whether they contain revealed items (files or folders).

**Logic:**
The function is now synchronous and builds a set of folders with revealed items for efficient DOM querying. It removes stale badges and adds missing ones without iterating all fileItems unnecessarily.

**Triggered by:**
- `revealItems()` — after revealing files or folders
- `unrevealItems()` — after hiding files or folders
- Vault events: `create`, `delete`, `rename` (registered in `main.ts`)
- `syncAutoRevealedDotfiles()` — after auto-reveal operations (with yielding to prevent blocking)
- `cleanStaleRevealedFiles()` — after cleaning settings

---

### 2. `revealItems()` — Reveal Hidden Files or Folders

**Location:** `hiddenFiles/operations.ts`

**Parameters:**
- `folderPath` — parent folder
- `itemPaths` — files or folders to reveal
- `persist` — if true, save to `revealedItems` settings (manual reveal only)

**Behavior:**
1. Uses `reconcileItem()` for cross-platform reconciliation (Desktop: reconcileFileInternal, Mobile: reconcileFileChanged)
2. For folders: calls `revealFolderContents()` to recursively reveal non-hidden children
3. If `persist=true`, adds paths to `plugin.settings.revealedItems[folderPath]`
4. Calls `decorateFolders()` to update eye badges
5. No longer shows notices (silent by default)

**Used by:**
- `RevealHiddenFilesModal` — manual reveal (persist=true, scans recursively through subfolders)
- `syncAutoRevealedDotfiles()` — auto-reveal (persist=false)
- `restoreRevealedFiles()` — on plugin startup
- `handleTemporaryReveal()` — temporary reveal (persist=false)

---

### 2.5. `revealFolderContents()` — Recursive Folder Contents Reveal

**Location:** `hiddenFiles/operations.ts`

**Purpose:** Automatically reveals all non-hidden (non-dot) children of a revealed dot-folder, recursively.

**Parameters:**
- `plugin` — The plugin instance
- `adapter` — The data adapter
- `folderPath` — The normalized path of the folder whose contents to reveal

**Behavior:**
1. Lists all files and folders in the given `folderPath`
2. Filters out hidden children (files/folders starting with `.`)
3. For folders: calls `adapter.reconcileFolderCreation()` and recurses with `revealFolderContents()`
4. For files: uses `adapter.reconcileFileInternal()` or `adapter.reconcileFileChanged()` to reveal the file
5. Does not persist to settings — folder persistence is handled by the parent `revealItems()` call

**Used by:**
- `revealItems()` — when revealing a folder item
- `restoreRevealedFiles()` — when restoring a folder item on startup

**Key Point:** This ensures that when a dot-folder (e.g., `.obsidian`) is revealed, its visible contents (e.g., `plugins`, `themes`) are automatically made visible in the vault without manual intervention.

---

### 3. `unrevealItems()` — Hide Revealed Files or Folders

**Location:** `hiddenFiles/operations.ts`

**Parameters:**
- `folderPath` — parent folder
- `itemPaths` — files or folders to hide
- `temporary` — if true, skip settings/badges (for transient files)

**Behavior:**
1. Sets `_bypassPatch = true` to allow `reconcileDeletion` to work on dot-items
2. Calls `adapter.reconcileDeletion()` to remove item from vault index
3. If `temporary=false`:
   - Removes paths from `plugin.settings.revealedItems[folderPath]`
   - Calls `decorateFolders()` to update eye badges
   - No longer shows notices

**Used by:**
- `RevealHiddenFilesModal` — manual hide (scans recursively through subfolders)
- `patchRegisterExtensions()` — when unregistering extensions
- `hideAutoRevealedDotfiles()` — when disabling auto-reveal
- `cleanupTemporaryReveal()` — cleanup after temporary reveal

---

### 4. `handleTemporaryReveal()` — Temporary File Reveal

**Location:** `hiddenFiles/operations.ts`

**Purpose:** Reveals a file temporarily (e.g., when restoring workspace state or opening via `ChooseHiddenFileModal`).

**Behavior:**
1. Checks if file is already visible in vault
2. If not, calls `revealItems()` with `persist=false` (silent, no persist)
3. Tracks file in `plugin.settings.temporaryRevealedPaths` unless:
   - Extension is registered (managed by auto-reveal)
   - File is already tracked
4. Saves settings

**Used by:**
- `ChooseHiddenFileModal` — when opening hidden files for editing
- Workspace state restoration (via `codeEditorView.ts`)

---

### 5. `cleanupTemporaryReveal()` — Cleanup Temporary Reveal

**Location:** `hiddenFiles/operations.ts`

**Purpose:** Unreveals a temporarily revealed file when it is closed.

**Behavior:**
1. Checks if file is in `temporaryRevealedPaths`
2. Verifies file is not still open in another leaf (prevents premature cleanup)
3. Checks if item is manually revealed (via `revealedItems` or ancestor folder)
4. If not manually revealed, calls `unrevealItems()` with `temporary=true`
5. Removes from `temporaryRevealedPaths` and saves settings

**Used by:**
- `codeEditorView.ts` — in `onClose()` method

---

### 6. `syncAutoRevealedDotfiles()` — Auto-Reveal on Extension Registration

**Location:** `hiddenFiles/sync.ts`

**Triggered by:** `patchRegisterExtensions()` via `around()` on `Plugin.registerExtensions()`

**Behavior:**
1. Cleans `revealedItems` by removing entries now managed by auto-reveal
2. Scans all folders for dotfiles matching newly registered extensions (skipping symlinks)
3. Calls `revealItems()` with `persist=false` (auto-managed, not persisted)
4. Calls `decorateFolders()` to update eye badges
5. Yields to event loop every 30 folders to prevent UI blocking

**Key Point:** Auto-revealed items are NOT stored in `revealedItems` settings.

---

## Patches Using `around()`

### 1. `patchAdapter()` — Prevent Dotfile Auto-Deletion & Fix Rename

**Location:** `hiddenFiles/patches.ts`

**Patches:**

#### `adapter.reconcileDeletion`
Blocks deletion of dot-items (files or folders) unless `_bypassPatch=true`.

#### `adapter.rename`
Prevents moving the configDir itself and blocks renames that would move external files out of configDir.

#### `vault.trash`
Allows dot-item deletion via trash by setting `_bypassPatch=true`, and cleans up revealedItems after deletion.

**Registered in:** `main.ts` via `this.register(patchAdapter(this))`

---

### 2. `patchRegisterExtensions()` — Sync Dotfile Visibility with Extension State

**Location:** `hiddenFiles/patches.ts`

**Patches:**
- `Plugin.registerExtensions()` — calls `syncAutoRevealedDotfiles()` after registration
- `viewRegistry.unregisterExtensions()` — hides auto-revealed dotfiles for removed extensions

**Registered in:** `main.ts` via `this.register(patchRegisterExtensions(this))`

---

### 3. `patchOpenFile()` — Ensure Dotfiles Open in Monaco

**Location:** `openFilePatch.ts`

**Patches:** `Workspace.openLinkText()` to intercept file opening and force Monaco view for registered extensions

**Registered in:** `main.ts` via `this._openFilePatch = patchOpenFile(this)`

---

## Settings Structure

### `revealedItems` — Persisted Manual Reveals

**Type:** `Record<string, string[]>` (folder path → array of item paths, files or folders)

**Example:**
```json
{
  "": [".env", ".gitignore", ".vscode"],
  "src": ["src/.eslintrc"]
}
```

**Contains:**
- Items **manually revealed** via `RevealHiddenFilesModal`
- Items **not managed by auto-reveal** (unregistered extensions)

**Does NOT contain:**
- Auto-revealed items (registered extensions with auto-reveal enabled)
- Temporarily revealed items (opened via `ChooseHiddenFileModal`)

---

## Eye Badge Behavior

### When Badge Appears

The eye badge appears on a folder when:
- `plugin.settings.revealedItems[folderPath]` has at least one entry
- This means the folder contains **manually revealed** dotfiles or dotfolders

### When Badge Disappears

The eye badge disappears when:
- All manually revealed items in the folder are hidden
- `plugin.settings.revealedItems[folderPath]` is empty or deleted

### Auto-Revealed Items and Badge

**Important:** Auto-revealed items (registered extensions) do NOT trigger the eye badge because they are not stored in `revealedItems`.

**Example:**
- Register `.env` extension → `.env` files auto-revealed → NO eye badge
- Manually reveal `.gitignore` via modal → stored in `revealedItems` → eye badge appears

---

## Vault Event Triggers

**Registered in `main.ts`:**
```typescript
this.registerEvent(this.app.vault.on('create', () => decorateFolders(this)));
this.registerEvent(this.app.vault.on('delete', () => decorateFolders(this)));
this.registerEvent(this.app.vault.on('rename', () => decorateFolders(this)));
```

**Purpose:** Keep eye badges in sync when files are created, deleted, or moved.

---

## Current Bugs — Eye Badge Not Updated

### Bug 1: Drag-and-Drop Between Folders

**Status:** ✅ Fixed in `unpatchRename`

**Solution:** After rename, update item paths in `revealedItems`, handle folder renames, clean empty folders, then call `decorateFolders()`.

---

### Bug 2: Folder Rename

**Status:** ⚠️ Known limitation — not currently handled.

When a folder containing revealed dotfiles or dotfolders is renamed, the key in `revealedItems`
becomes stale (old folder name). The eye badge disappears after the rename
(correct visually, since `decorateFolders` re-reads the current file tree),
but the stale key remains in settings until `cleanStaleRevealedFiles` runs at next startup.
No data loss — the items remain visible — but the badge won't reappear until restart.

---

### Bug 3: Trash/Delete File

**Status:** ✅ Fixed in `unpatchTrash`

**Solution:** After deletion, remove item path from `revealedItems`, handle nested items, delete empty folder entries, then call `decorateFolders()`.

---

## Notes

- Dotfiles, dotfolders, and extension-less files both have `file.extension = ""`
- Extension-less files (LICENSE, README) are visible when "Detect all file extensions" is enabled
- Dotfiles and dotfolders (starting with `.`) are managed by the reveal system, with symlink detection
- Auto-revealed items (registered extensions) do NOT appear in `revealedItems` and do NOT trigger eye badge
- Eye badge only appears for manually revealed items

---

**Revised:** ✓
