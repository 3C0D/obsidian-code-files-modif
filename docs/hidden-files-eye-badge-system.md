# Hidden Files Eye Badge System

## Summary

The eye badge (👁️) appears on folders containing **manually revealed** dotfiles (stored in `plugin.settings.revealedFiles`). It's managed by `decorateFolders()` and updated after file operations. Dotfiles are registered by Obsidian as `file.extension = ""`. Files without extension (LICENSE, README) also have `extension = ""` but are visible by default when "Detect all file extensions" is enabled.

---

## Core Functions

### 1. `decorateFolders(plugin)` — Apply/Remove Eye Badge

**Location:** `hiddenFilesUtils.ts`

**Purpose:** Adds or removes the eye icon badge on folders based on whether they contain revealed files.

**Logic:**
```typescript
const hasRevealed = plugin.settings.revealedFiles[file.path]?.length > 0;
const existing = selfEl.querySelector('.hidden-files-badge');

if (hasRevealed && !existing) {
    const badge = selfEl.createSpan({ cls: 'hidden-files-badge' });
    setIcon(badge, 'eye');
} else if (!hasRevealed && existing) {
    existing.remove();
}
```

**Triggered by:**
- `revealFiles()` — after revealing files
- `unrevealFiles()` — after hiding files
- Vault events: `create`, `delete`, `rename` (registered in `main.ts`)
- `syncAutoRevealedDotfiles()` — after auto-reveal operations
- `cleanStaleRevealedFiles()` — after cleaning settings

---

### 2. `revealFiles()` — Reveal Hidden Files

**Location:** `hiddenFilesUtils.ts`

**Parameters:**
- `folderPath` — parent folder
- `itemPaths` — files to reveal
- `silent` — if true, no notice (for auto-reveal)
- `persist` — if true, save to `revealedFiles` settings (manual reveal only)

**Behavior:**
1. Uses `adapter.reconcileFileInternal()` or `adapter.reconcileFileChanged()` to force Obsidian to display the file
2. If `persist=true`, adds paths to `plugin.settings.revealedFiles[folderPath]`
3. Calls `decorateFolders()` to update eye badges
4. Shows notice if `silent=false`

**Used by:**
- `RevealHiddenFilesModal` — manual reveal (persist=true)
- `syncAutoRevealedDotfiles()` — auto-reveal (persist=false, silent=true)
- `restoreRevealedFiles()` — on plugin startup

---

### 3. `unrevealFiles()` — Hide Revealed Files

**Location:** `hiddenFilesUtils.ts`

**Parameters:**
- `folderPath` — parent folder
- `itemPaths` — files to hide
- `temporary` — if true, skip settings/notice/badges (for transient files)

**Behavior:**
1. Sets `_bypassPatch = true` to allow `reconcileDeletion` to work on dotfiles
2. Calls `adapter.reconcileDeletion()` to remove file from vault index
3. If `temporary=false`:
   - Removes paths from `plugin.settings.revealedFiles[folderPath]`
   - Calls `decorateFolders()` to update eye badges
   - Shows notice

**Used by:**
- `RevealHiddenFilesModal` — manual hide
- `patchRegisterExtensions()` — when unregistering extensions
- `hideAutoRevealedDotfiles()` — when disabling auto-reveal
- `ChooseHiddenFileModal` — temporary reveal for editing (temporary=true)

---

### 4. `syncAutoRevealedDotfiles()` — Auto-Reveal on Extension Registration

**Location:** `hiddenFilesUtils.ts`

**Triggered by:** `patchRegisterExtensions()` via `around()` on `Plugin.registerExtensions()`

**Behavior:**
1. Cleans `revealedFiles` by removing entries now managed by auto-reveal
2. Scans all folders for dotfiles matching newly registered extensions
3. Calls `revealFiles()` with `persist=false, silent=true` (auto-managed, not persisted)
4. Calls `decorateFolders()` to update eye badges

**Key Point:** Auto-revealed files are NOT stored in `revealedFiles` settings.

---

## Patches Using `around()`

### 1. `patchAdapter()` — Prevent Dotfile Auto-Deletion & Fix Rename

**Location:** `hiddenFilesUtils.ts`

**Patches:**

#### `adapter.reconcileDeletion`
Blocks deletion of dotfiles unless `_bypassPatch=true`.

#### `adapter.rename`
Fixes drag-and-drop destination for dotfiles:
```typescript
if (adapter.files?.[dest]?.type === 'folder') {
    const filename = src.split('/').pop() || '';
    dest = dest + '/' + filename;
}
```

#### `vault.trash`
Allows dotfile deletion via trash by setting `_bypassPatch=true`.

**Registered in:** `main.ts` via `this.register(patchAdapter(this))`

---

### 2. `patchRegisterExtensions()` — Sync Dotfile Visibility with Extension State

**Location:** `hiddenFilesUtils.ts`

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

### `revealedFiles` — Persisted Manual Reveals

**Type:** `Record<string, string[]>` (folder path → array of file paths)

**Example:**
```json
{
  "": [".env", ".gitignore"],
  "src": ["src/.eslintrc"]
}
```

**Contains:**
- Files **manually revealed** via `RevealHiddenFilesModal`
- Files **not managed by auto-reveal** (unregistered extensions)

**Does NOT contain:**
- Auto-revealed files (registered extensions with auto-reveal enabled)
- Temporarily revealed files (opened via `ChooseHiddenFileModal`)

---

## Eye Badge Behavior

### When Badge Appears

The eye badge appears on a folder when:
- `plugin.settings.revealedFiles[folderPath]` has at least one entry
- This means the folder contains **manually revealed** dotfiles

### When Badge Disappears

The eye badge disappears when:
- All manually revealed files in the folder are hidden
- `plugin.settings.revealedFiles[folderPath]` is empty or deleted

### Auto-Revealed Files and Badge

**Important:** Auto-revealed files (registered extensions) do NOT trigger the eye badge because they are not stored in `revealedFiles`.

**Example:**
- Register `.env` extension → `.env` files auto-revealed → NO eye badge
- Manually reveal `.gitignore` via modal → stored in `revealedFiles` → eye badge appears

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

**Solution:** After rename, update file paths in `revealedFiles`, handle folder renames, clean empty folders, then call `decorateFolders()`.

---

### Bug 2: Folder Rename

**Status:** ⚠️ Known limitation — not currently handled.

When a folder containing revealed dotfiles is renamed, the key in `revealedFiles`
becomes stale (old folder name). The eye badge disappears after the rename
(correct visually, since `decorateFolders` re-reads the current file tree),
but the stale key remains in settings until `cleanStaleRevealedFiles` runs at next startup.
No data loss — the dotfiles remain visible — but the badge won't reappear until restart.

---

### Bug 3: Trash/Delete File

**Status:** ✅ Fixed in `unpatchTrash`

**Solution:** After deletion, remove file path from `revealedFiles`, delete empty folder entries, then call `decorateFolders()`.

---

## Notes

- Dotfiles and extension-less files both have `file.extension = ""`
- Extension-less files (LICENSE, README) are visible when "Detect all file extensions" is enabled
- Only dotfiles (starting with `.`) are managed by the reveal system
- Auto-revealed files (registered extensions) do NOT appear in `revealedFiles` and do NOT trigger eye badge
- Eye badge only appears for manually revealed files

---

**Revised:** ✓
