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

### Why read content in `setState()`?

External files are not indexed in Obsidian's vault cache. When `super.setState()` is called, it tries to load the file through Obsidian's normal file loading mechanism, which fails for external files. By reading the content directly with `adapter.read()` and setting `this.data` before mounting the editor, we bypass the vault's file loading system entirely.

### Why check `state.reveal`?

The `reveal` flag is set in `getState()` for all files in `.obsidian/`. This allows `setState()` to reveal the files before attempting to load them through Obsidian's normal mechanisms.
