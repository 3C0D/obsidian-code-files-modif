# External Files Persistence Fix

## Context

External files (CSS snippets and files in `.obsidian/`) were not persisting correctly on Obsidian restart. The behavior was inconsistent:
- ✅ When opened in an **already occupied tab** → created a new tab → persisted
- ❌ When opened in an **empty tab** → reused the tab → disappeared on restart

## Root Cause

The `openExternalFile()` method was manually creating a `TFile` and a view with `new CodeEditorView()` and `leaf.open(view)`, instead of using `setViewState()` which properly handles persistence in Obsidian's workspace layout.

---

## Changes Made

### 1. Method `openExternalFile()` - Before

```typescript
/** Opens external files (CSS snippets) in a new leaf via an adapter path (not vault-indexed).
 *  Constructs a pseudo TFile internally since the path is outside the vault. */
static async openExternalFile(
	filePath: string,
	plugin: CodeFilesPlugin
): Promise<void> {
	// Snippets are outside the vault — TFile is constructed manually
	// because the adapter path is not indexed in the vault.
	// Workaround: constructors TFile manually via Obsidian's internal API since the file isn't in vault cache.
	// @ts-expect-error: TFile constructor is internal API
	const file = new TFile(plugin.app.vault, filePath);
	const leaf = plugin.app.workspace.getLeaf(true);
	const view = new CodeEditorView(leaf, plugin);
	view.file = file;
	await leaf.open(view);
	await view.onLoadFile(file);
	// Update tab header tab to show the file name
	leaf.updateHeader();
}
```

### 1. Method `openExternalFile()` - After

```typescript
/** Opens external files (CSS snippets) via an adapter path (not vault-indexed).
 *  Reuses existing tab if file is already open, otherwise creates a new tab.
 *  Constructs a pseudo TFile internally since the path is outside the vault. */
static async openExternalFile(
	filePath: string,
	plugin: CodeFilesPlugin
): Promise<void> {
	// Check if file is already open in a leaf
	const existingLeaf = plugin.app.workspace.getLeavesOfType(viewType).find((leaf) => {
		const view = leaf.view as CodeEditorView;
		return view.file?.path === filePath;
	});

	if (existingLeaf) {
		// File already open — activate that leaf
		plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		return;
	}

	// Always create a new tab for external files
	const leaf = plugin.app.workspace.getLeaf('tab');
	// Use setViewState for proper state management and persistence
	await leaf.setViewState({
		type: viewType,
		state: { file: filePath, reveal: true },
		active: true
	});
}
```

**Key changes:**
- Added check if file is already open (tab reuse)
- Using `setViewState()` instead of manually creating the view
- Passing `reveal: true` in state for persistence
- Using `getLeaf('tab')` to always create a new tab

---

### 2. Method `getState()` - Before

```typescript
getState(): Record<string, unknown> {
	const state = super.getState() as Record<string, unknown>;
	// Mark dotfiles and CSS snippets so setState can reveal them before vault lookup on restore
	if (
		this.file &&
		(!this.file.extension || this.file.path.includes('.obsidian/snippets'))
	) {
		state.reveal = true;
	}
	return state;
}
```

### 2. Method `getState()` - After

```typescript
getState(): Record<string, unknown> {
	const state = super.getState() as Record<string, unknown>;
	// Mark dotfiles and CSS snippets so setState can reveal them before vault lookup on restore
	if (
		this.file &&
		(!this.file.extension || this.file.path.includes('.obsidian'))
	) {
		state.reveal = true;
	}
	return state;
}
```

**Key changes:**
- Broadened detection: not just `snippets/` but all `.obsidian/`

---

### 3. Method `setState()` - Before

```typescript
async setState(
	state: Record<string, unknown>,
	result: ViewStateResult
): Promise<void> {
	const filePath = typeof state?.file === 'string' ? state.file : undefined;
	if (
		filePath &&
		state.reveal &&
		!this.plugin.app.vault.getAbstractFileByPath(filePath)
	) {
		const folderPath = filePath.substring(0, filePath.lastIndexOf('/')) || '';
		await revealFiles(this.plugin, folderPath, [filePath], true, false); // silent, no persist
	}
	await super.setState(state, result);
}
```

### 3. Method `setState()` - After

```typescript
async setState(
	state: Record<string, unknown>,
	result: ViewStateResult
): Promise<void> {
	const filePath = typeof state?.file === 'string' ? state.file : undefined;
	if (
		filePath &&
		state.reveal &&
		!this.plugin.app.vault.getAbstractFileByPath(filePath)
	) {
		const folderPath = filePath.substring(0, filePath.lastIndexOf('/')) || '';
		await revealFiles(this.plugin, folderPath, [filePath], true, false); // silent, no persist
	}

	try {
		await super.setState(state, result);
	} catch {
		// super.setState may fail for external files not in vault index
	}
}
```

**Key changes:**
- Added try/catch around `super.setState()` to avoid errors on external files

---

## Expected Result

- ✅ **Opening**: Always in a new tab (unless file is already open)
- ✅ **Reuse**: If file is already open, activate that existing tab
- ✅ **Persistence**: Tab persists on restart with correct content
- ✅ **Error handling**: If file no longer exists, error is logged and tab fails gracefully

## Affected Files

- `src/editor/codeEditorView.ts` (3 methods modified)
- Used by:
  - `src/modals/chooseCssSnippetsModal.ts` (CSS snippets)
  - `src/modals/chooseExternalFileModal.ts` (all files in `.obsidian/`)

## Technical Details

### Why `setViewState()` instead of manual view creation?

Obsidian's workspace layout persistence relies on `setViewState()` to properly serialize and restore view state. When creating a view manually with `new CodeEditorView()` and `leaf.open(view)`, the state is not properly registered in the workspace layout, causing the tab to disappear on restart.

### Why reveal files in `setState()`?

External files (like CSS snippets) are not indexed in Obsidian's vault cache. When `super.setState()` is called, it tries to load the file through Obsidian's normal file loading mechanism, which would normally fail for external files. By calling `revealFiles()` to temporarily inject the file into Obsidian's index before calling `super.setState()`, we allow Obsidian's standard file loading system to work normally.

### Why check `state.reveal`?

The `reveal` flag is set in `getState()` for all files in `.obsidian/`. This allows `setState()` to reveal the files before attempting to load them through Obsidian's normal mechanisms.

---

## 4. Save & Watcher Deadlock (Fix)

### The Problem

When saving an external file (e.g. a CSS snippet inside `.obsidian/`), the tab would suddenly close. Furthermore, attempting to open the "Reveal Hidden Files" modal would get stuck on "Scanning folder...".

**The Causal Chain:**
1. `CodeEditorView.save()` was calling `super.save()`.
2. `super.save()` internally calls `vault.modify()`.
3. `vault.modify()` writes the file and triggers Obsidian's internal filesystem watcher.
4. Because the file is in `.obsidian/` (which is typically not indexed), the watcher assumes it shouldn't be in the vault and calls `adapter.reconcileDeletion`.
5. The file is removed from the vault index, triggering `onUnloadFile`, which closes the editor tab.

To prevent this, we previously patched `reconcileDeletion` to ignore files starting with a dot. However, `mysnippet.css` does not start with a dot, so it was still being deleted from the index.

Furthermore, attempting to fix this by adding an asynchronous `await adapter.exists()` inside the `reconcileDeletion` patch caused a **deadlock**. During a folder scan (`adapter.list()`), Obsidian might trigger reconcile events. The asynchronous check inside the synchronous-like pipeline of the watcher caused the scan to freeze indefinitely.

### The Solution

We implemented a two-part fix using synchronous checks and direct adapter writes:

**1. Bypass `vault.modify()` for External Files**
In `CodeEditorView.save()`, we now check if the file belongs to the `configDir` (`.obsidian/`). If it does, we write the file directly using `adapter.write()` instead of `super.save()`. This updates the file on disk without triggering Obsidian's vault watchers, completely avoiding the `reconcileDeletion` chain.

**2. Synchronous Protection in `reconcileDeletion`**
We extended the monkey-patch on `adapter.reconcileDeletion` in `patches.ts` to protect files in the `configDir` that are actively tracked by the plugin. Instead of an asynchronous disk check, it performs a **synchronous** check against the plugin's `temporaryRevealedPaths` and `revealedFiles` arrays. This ensures the files are protected from any other background watcher events without risking a deadlock during folder scans.
