# Implementation Instructions — Audit Fixes

> Instructions for an LLM to apply each fix. Each section is self-contained.

---

## 1. File Size Guard on Open

### Context
The setting `maxFileSize` (MB) already exists in settings and is used by modals (`chooseHiddenFileModal.ts`, `chooseExternalFileModal.ts`) via `getMaxFileSize(plugin)` (in `src/utils/hiddenFiles/scan.ts`). However, the main opening path (`editorOpeners.ts` → `openInMonacoLeaf`) does NOT check file size before loading into Monaco.

### Files to modify
- `src/editor/codeEditorView/editorOpeners.ts`

### Instructions

In `openInMonacoLeaf()`, after resolving `filePath` (line 52) and before proceeding to open the leaf, add a file size check:

```ts
// After line 52: const filePath = fileOrPath instanceof TFile ? fileOrPath.path : fileOrPath;

// --- ADD THIS BLOCK ---
// Check file size against the configured maximum before opening
const file = fileOrPath instanceof TFile ? fileOrPath : plugin.app.vault.getAbstractFileByPath(filePath);
if (file instanceof TFile && file.stat?.size) {
  const { getMaxFileSize } = await import('../../utils/hiddenFiles/scan.ts');
  const maxBytes = getMaxFileSize(plugin);
  if (file.stat.size > maxBytes) {
    const sizeMB = (file.stat.size / (1024 * 1024)).toFixed(1);
    const maxMB = plugin.settings.maxFileSize || 10;
    new Notice(
      `File too large (${sizeMB} MB). Maximum is ${maxMB} MB.\n` +
      `Change this in Settings → Code Files → Maximum file size.`,
      8000
    );
    return;
  }
}
// --- END BLOCK ---
```

Add the import at the top of the file:
```ts
import { Notice, TFile } from 'obsidian';
```
(`TFile` is already imported, just add `Notice`.)

### Verification
- Open a file > 10MB → should show Notice with the size and settings hint
- Open a file < 10MB → normal behavior unchanged
- Change `maxFileSize` in settings to 1 → files > 1MB should be blocked

---

## 2. REPL/Interactive Mode Bug (NEW — Priority: Medium)

### Context (Root Cause)
When a user launches a bare REPL command (`node`, `python`, `py`) via the console, the process is spawned with `stdio: ['pipe', 'pipe', 'pipe']`. In pipe mode (no PTY), REPLs behave differently:

- **Node.js** without args + piped stdin → enters "script mode": reads ALL stdin until EOF, then executes everything at once. It does NOT evaluate line-by-line.
- **Python** without args + piped stdin → same: reads until EOF, then executes as a script.

This means typing `a=2` then `a+b` produces no output until the user sends EOF (Ctrl+D). This is confusing because the UI shows "stdin..." suggesting interactivity, but nothing ever happens.

**Fix:** Force interactive mode by adding `-i` flag for known REPL commands. `node -i` and `python -i` force line-by-line evaluation even over pipes.

### Files to modify
- `src/editor/mountCodeEditor/consoleHandler.ts`

### Instructions

In the `'run-command'` case (around line 243 where `spawn!` is called), **before** the spawn call, add REPL detection and flag injection:

```ts
// After line 240 (after killing existing process), BEFORE the try/spawn block:

// --- ADD THIS BLOCK ---
/**
 * REPL Detection: Force interactive mode for known interpreters.
 * Without this, bare REPL commands (node, python) in pipe mode
 * buffer all stdin until EOF instead of evaluating line-by-line.
 * Adding -i forces interactive behavior over piped stdio.
 */
const REPL_INTERACTIVE_FLAGS: Record<string, string> = {
  'node': 'node -i',
  'python': 'python -i',
  'python3': 'python3 -i',
  'py': 'py -i',
};
const resolvedCmd = REPL_INTERACTIVE_FLAGS[cmdLine] ?? cmdLine;
// --- END BLOCK ---
```

Then change line 243 from:
```ts
const proc = spawn!(cmdLine, [], {
```
to:
```ts
const proc = spawn!(resolvedCmd, [], {
```

### Additional UX improvement (optional)
When a REPL is auto-fixed, send a subtle feedback to the user:

```ts
if (resolvedCmd !== cmdLine) {
  send('console-output', { text: `[Interactive mode: ${resolvedCmd}]\n` });
}
```

### Verification
- Type `node` → should see `[Interactive mode: node -i]` then the Node REPL `>` prompt
- Type `2+2` → should immediately output `4`
- Type `python` → should see `[Interactive mode: python -i]` then Python prompt
- Type `a=2` then `a` → should immediately output `2`
- Type `node script.ts` → should NOT be modified (it's not a bare REPL command)

---

## 3. Error Recovery in buildBlobUrl

### Context
`buildBlobUrl.ts` has a `fetchText` helper that returns `''` on failure (line 58-66). This prevents crashes, but if the **main bundle** (`bundleJsUrl`) or **HTML** (`htmlUrl`) fails, the iframe will be blank with no feedback. The `fetchText` fallback of `''` is fine for optional formatters but should not silently swallow critical asset failures.

### Files to modify
- `src/editor/mountCodeEditor/buildBlobUrl.ts`
- `src/editor/mountCodeEditor/mountCodeEditor.ts` (caller)

### Instructions

**In `buildBlobUrl.ts`:** After the parallel fetch (around line 86-110, after the `const [cssText, ..., bundleJs] = await Promise.all([...])`), add a critical asset check:

```ts
// After the Promise.all destructuring (after bundleJs is assigned):

// --- ADD THIS BLOCK ---
// Critical assets: without these, the editor cannot function at all
if (!bundleJs || !cssText) {
  revokeBlobUrlCache();
  throw new Error('Failed to load critical Monaco assets (bundle or CSS). Check network/disk access.');
}
// --- END BLOCK ---
```

**In `mountCodeEditor.ts`:** In the caller function that calls `buildBlobUrl(urls)`, wrap it in a try-catch and show a Notice on failure. Find where `buildBlobUrl` is awaited and add:

```ts
let blobUrl: string;
try {
  blobUrl = await buildBlobUrl(urls);
} catch (err) {
  new Notice('Failed to load editor assets. Try reloading Obsidian.', 10000);
  console.error('[Code Files]', err);
  return; // Abort mounting — don't create a blank iframe
}
```

Make sure `Notice` is imported from `'obsidian'` in `mountCodeEditor.ts`.

### Verification
- Normal operation: no change
- Simulate failure: temporarily rename/delete the bundle JS file → should see Notice instead of blank pane
- After restoring the file and reopening a tab → should work again (cache was cleared)

---

## 4. Console History Deduplication Debounce

### Context
In `consoleHandler.ts` line 188-195, `plugin.saveSettings()` is called on every command. If typing rapidly, multiple concurrent saves could occur. This is harmless (last-write-wins) but wasteful.

### Files to modify
- `src/editor/mountCodeEditor/consoleHandler.ts`

### Instructions

Add a debounced save at module level (top of file, after the Map declarations around line 31):

```ts
// --- ADD THIS BLOCK ---
/** Debounced settings save to avoid rapid concurrent writes from console history. */
let _saveTimer: NodeJS.Timeout | null = null;
function debouncedSaveSettings(plugin: CodeFilesPlugin): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    plugin.saveSettings();
  }, 500);
}
// --- END BLOCK ---
```

Then in the `'run-command'` case (line 194), replace:
```ts
await plugin.saveSettings();
```
with:
```ts
debouncedSaveSettings(plugin);
```

Remove the `async` from the case if `saveSettings` was the only await there (it isn't — the whole function is async, so just remove the `await`).

### Verification
- Type 5 commands rapidly → only 1 save should occur (check via console.log in saveSettings if needed)
- Close and reopen Obsidian → all 5 commands should be in history (the debounce fired before close)

---

## Priority Order

1. **#2 REPL Bug** — Real user-facing bug, interactive REPLs don't work
2. **#3 Error Recovery** — Resilience improvement, prevents confusion on asset failure  
3. **#1 File Size Guard** — Low priority but useful safety net
4. **#4 History Debounce** — Minor optimization

---

**Date:** 2025-05-20
