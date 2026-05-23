# Hidden Files System

## Summary
The plugin makes Obsidian's hidden dotfiles (.env, .gitignore, .prettierrc, etc.) visible and editable. This requires patching the DataAdapter to prevent Obsidian from removing them from its index, managing reveal/unreveal state, and displaying visual indicators (badges) in the file explorer.

## Architecture Overview

```
main.ts onload()
  ├─ patchAdapter(plugin)          → intercepts reconcileDeletion, rename, trash
  ├─ patchRegisterExtensions(plugin) → syncs dotfile visibility on ext add/remove
  ├─ setupExplorerBadges(plugin)   → MutationObserver for extension badges
   ├─ cleanStaleRevealedFiles()     → removes settings entries for deleted files
   ├─ initRevealedFiles()           → single-pass startup: restores persisted revealed items (incl. for workspace restore of external files) + auto-reveals registered dotfiles; calls decorateFolders internally
   └─ setupExplorerBadges(plugin)   → MutationObserver + badge application (rescan may be triggered after init if needed)
```

**Key modules:** `src/utils/hiddenFiles/` (index, state, operations, patches, sync, scan, badge, reconcile, symlink, dotfileFilters) — ~10 files; reconcile and some sync internals are no longer re-exported from index.ts for a stable public API.

## Core Mechanism: Adapter Patching

**File:** `src/utils/hiddenFiles/patches.ts`

### reconcileDeletion Patch
Obsidian's file watcher calls `adapter.reconcileDeletion()` whenever it detects a file it doesn't recognize. For dotfiles, this would immediately remove them from the vault index after we reveal them.

**Strategy:**
- If `_bypassPatch` is true → allow through (explicit hide action)
- If basename starts with `.` → block (dotfile protection)
- If path is inside a revealed hidden folder → block
- If path is inside configDir and tracked → block
- Otherwise → allow through (normal file deletion)

### rename Patch
Fixes drag-and-drop for dotfiles (Obsidian passes folder as dest instead of full path) and updates `revealedItems` settings on rename.

### vault.trash Patch
Sets `_bypassPatch = true` during trash operations so the reconcileDeletion patch allows the deletion to proceed.

## Reveal / Unreveal Operations

**File:** `src/utils/hiddenFiles/operations.ts`

### `revealItems(plugin, folderPath, itemPaths, persist)`
1. Stats each item to verify existence
2. Calls `reconcileItem()` to add it to Obsidian's vault index
3. For folders: recursively reveals non-dot children via `revealFolderContents()`
4. If `persist=true`: saves to `settings.revealedItems[folderPath]`
5. Invalidates `_revealedItemsCache`
6. Calls `decorateFolders()` to update eye badges

### `unrevealItems(plugin, folderPath, itemPaths, temporary)`
1. Sets `_bypassPatch = true`
2. Calls `adapter.reconcileDeletion()` for each item (removes from vault index)
3. Resets `_bypassPatch = false`
4. If not temporary: removes from settings, saves, redecorates

### `handleTemporaryReveal(plugin, filePath)`
Used when opening a dotfile via the ChooseHiddenFileModal or workspace restore. Reveals the file without persisting to `revealedItems`. Tracks in `temporaryRevealedPaths` for cleanup on close.

### `cleanupTemporaryReveal(plugin, filePath)`
Called when a temporarily revealed file's editor leaf is closed. Checks if still open in another leaf, if managed by auto-reveal, or if manually revealed before unrevealing.

## Auto-Reveal System

**File:** `src/utils/hiddenFiles/sync.ts`

When `settings.isAutoRevealRegisteredDotfile` is enabled, all dotfiles matching registered extensions are automatically revealed. The `syncAutoRevealedDotfiles(plugin)` function:
1. Scans the vault for dot-entries matching the given extensions
2. Reveals them without persisting (they are re-synced on each startup)
3. Yields every 30 folders to avoid blocking the UI

## Eye Badge (Folder Indicators)

**File:** `src/utils/hiddenFiles/badge.ts` → `decorateFolders(plugin)`

Adds an eye icon (👁) to folders in the file explorer that contain hidden items. Scans `view.fileItems` for folders and checks if they have dot-children not yet revealed.

## Extension Badges

**File:** `src/utils/explorerUtils.ts` → `setupExplorerBadges(plugin)`

Ensures dotfiles show their detected extension as a badge (e.g., "ENV", "GITIGNORE") in the file explorer, matching Obsidian's native behavior for regular files.

**Implementation:**
- Uses a `MutationObserver` on the file explorer container to catch dynamically added nodes (folder expansion)
- On `layout-change`: only does a full `scanAll` if the file explorer view instance has changed (guards against unnecessary work on pane resizes)
- On `rename`: applies badge to the renamed file specifically

## Settings Shape

```typescript
interface MyPluginSettings {
  revealedItems: Record<string, string[]>;  // folderPath → revealed item paths
  temporaryRevealedPaths: string[];         // transient, cleaned on close
  isAutoRevealRegisteredDotfile: boolean;   // toggle for auto-reveal
  showHiddenFiles: boolean;                 // toggle eye badge visibility
}
```

## Performance Considerations

- `getRevealedItemsCache(plugin)` returns a `Set<string>` cached at plugin level, invalidated when `revealedItems` changes. Avoids rebuilding `Object.values(...).flat()` on every `reconcileDeletion` call.
- `syncAutoRevealedDotfiles` yields every 30 folders to avoid blocking.
- `setupExplorerBadges` guards full scan behind a view-change check.

## Dotfile Filtering and State Unification

Extracted dedicated helpers in `src/utils/hiddenFiles/dotfileFilters.ts` (`isRegisteredDotfile`, `filterManualDotEntries`) to exclude auto-revealed dotfiles (those with registered extensions when the auto-reveal toggle is on) from all manual reveal/hide operations, badge counting, and project-root scans. This ensures auto-managed items are never persisted in `revealedItems` or accidentally hidden.

A new internal helper `forEachVaultFolder` centralizes vault-wide iteration with yield-to-event-loop every 30 folders.

State mutations for `revealedItems` were unified via `setRevealedItemsEntry` (in operations.ts) which also invalidates the cache; used everywhere instead of direct assignments + delete.

Public exports from `index.ts` were pruned to stable surface: now exposes `filterManualDotEntries`, `setRevealedItemsEntry`; `reconcileItem` and several internal sync helpers are no longer re-exported.

Key modules list expanded to include `dotfileFilters.ts` (reconcile.ts remains internal).

Centralized folder reveal after structural changes (reveal/hide, project root switch) into `revealFolderInExplorer` (explorerUtils.ts).

---

**Revised:** ✓
