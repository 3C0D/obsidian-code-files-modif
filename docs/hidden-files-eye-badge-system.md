# Hidden Files Eye Badge System

## Summary

The eye badge (👁️) appears on folders containing **manually revealed** dotfiles. It's managed by `decorateFolders()` which checks `plugin.settings.revealedFiles[folderPath]`. The badge is added/removed dynamically based on folder content changes.

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

### 1. `patchAdapter()` — Prevent Dotfile Auto-Deletion

**Location:** `hiddenFilesUtils.ts`

**Patches:**
- `adapter.reconcileDeletion` — blocks deletion of dotfiles unless `_bypassPatch=true`
- `adapter.rename` — fixes drag-and-drop destination for dotfiles
- `vault.trash` — allows dotfile deletion via trash

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

## Current Issues & Potential Bugs

### Issue 1: Extension-less Files (LICENSE, README)

**Problem:** Files without extension (`file.extension = ""`) are registered via `extraExtensions: ['']` but are NOT dotfiles (don't start with `.`).

**Current Behavior:**
- These files open in Monaco automatically (correct)
- They are NOT managed by the hidden files system (correct)
- They do NOT appear in `RevealHiddenFilesModal` (correct)

**Status:** ✅ Working as intended

---

### Issue 2: Eye Badge Not Updated After Extension Registration

**Scenario:**
1. Manually reveal `.prettierrc` via modal → eye badge appears
2. Register `prettierrc` extension → file becomes auto-managed
3. Eye badge should disappear (file no longer in `revealedFiles`)

**Current Behavior:**
- `syncAutoRevealedDotfiles()` cleans `revealedFiles` and calls `decorateFolders()`
- Eye badge should disappear correctly

**Status:** ✅ Should work (needs testing)

---

### Issue 3: Eye Badge After Unregistering Extension

**Scenario:**
1. Register `.env` extension → auto-revealed (no badge)
2. Unregister `.env` extension → file hidden
3. Manually reveal `.env` via modal → eye badge appears

**Current Behavior:**
- `patchRegisterExtensions()` hides auto-revealed files when extension is unregistered
- Manual reveal adds to `revealedFiles` → eye badge appears

**Status:** ✅ Should work (needs testing)

---

### Issue 4: Drag-and-Drop Between Folders

**Scenario:**
1. Folder A has manually revealed `.env` → eye badge on A
2. Drag `.env` from A to B
3. Eye badge should move from A to B

**Current Behavior:**
- Vault `rename` event triggers `decorateFolders()`
- But `revealedFiles` still references old path `A/.env`
- Eye badge stays on A (incorrect)

**Status:** ⚠️ Potential bug — `revealedFiles` paths not updated on rename

---

### Issue 5: Folder Rename

**Scenario:**
1. Folder `src` has manually revealed `.eslintrc` → eye badge on `src`
2. Rename `src` to `source`
3. Eye badge should appear on `source`

**Current Behavior:**
- `revealedFiles` key is still `"src"` (old path)
- Eye badge disappears (incorrect)

**Status:** ⚠️ Bug — folder rename not handled in `revealedFiles`

---

## Recommendations

### 1. Add Path Update on Rename

**Location:** `main.ts` or `hiddenFilesUtils.ts`

**Solution:** Listen to `vault.on('rename')` and update `revealedFiles` keys/values:
```typescript
this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
    updateRevealedFilesOnRename(this, oldPath, file.path);
    decorateFolders(this);
}));
```

### 2. Test Eye Badge Behavior

**Test cases:**
- Manual reveal → badge appears
- Manual hide → badge disappears
- Register extension → badge disappears (if file was manually revealed)
- Unregister extension → badge appears (if file is manually revealed after)
- Drag file between folders → badge moves
- Rename folder → badge stays on renamed folder

---

**Revised:** ✓
