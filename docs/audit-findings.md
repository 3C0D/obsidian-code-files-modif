# Audit Findings — May 2025

## Summary
Comprehensive plugin audit. Previous critical and major bugs have all been resolved. Current code is solid. The findings below are improvements and one real bug discovered during testing.

**Status:** All issues from this audit (May 20, 2025) have been fixed. See [audit-findings-2025-05-21.md](audit-findings-2025-05-21.md) for the second audit pass.

**Implementation instructions:** See [audit-implementation-instructions.md](audit-implementation-instructions.md) for detailed LLM-ready fix instructions.

## Bug: REPL Interactive Mode Broken (Priority: Medium) ✅ Fixed

**File:** `src/editor/mountCodeEditor/consoleHandler.ts`
**Issue:** Launching bare REPL commands (`node`, `python`, `py`) in the console doesn't work interactively. The process spawns with piped stdio (`['pipe', 'pipe', 'pipe']`), which causes REPLs to enter "script mode" — they buffer ALL stdin until EOF instead of evaluating line-by-line. The user sees "stdin..." but typing expressions produces no output.
**Root Cause:** Without a PTY, `node` and `python` detect piped stdin and switch to batch mode. The fix is to auto-inject `-i` flag for known bare REPL commands (`node -i`, `python -i`) which forces interactive evaluation over pipes.
**Reproduction:** Open console → type `node` → type `2+2` → nothing happens (should output `4`).

## Remaining Suggestions

### 1. File Size Guard on Open (Low priority) ✅ Fixed
**File:** `src/editor/codeEditorView/editorOpeners.ts`
**Issue:** No file size check before opening in Monaco. The `maxFileSize` setting is used in modals but not in the main open path.
**Suggestion:** Check file size against `getMaxFileSize(plugin)` and show a Notice with a link to settings if exceeded.

### 2. Console Output Virtual Scrolling (Deferred)
**File:** `src/editor/iframe/console.ts`
**Issue:** Console output uses raw DOM insertion. Tested with 2000 console.log messages — no freeze observed. The 5000-line truncation is working correctly.
**Status:** Not priority. Revisit only if users report performance issues with very large outputs.

### 3. Error Recovery in buildBlobUrl (Resilience) ✅ Fixed
**File:** `src/editor/mountCodeEditor/buildBlobUrl.ts`
**Issue:** If critical assets (bundle.js, CSS) fail to load, user sees a blank iframe with no explanation.
**Suggestion:** Throw on critical asset failure + catch in `mountCodeEditor.ts` → show Notice "Failed to load editor assets."

### 4. Console History Deduplication Race (Low priority) ✅ Fixed
**File:** `src/editor/mountCodeEditor/consoleHandler.ts`
**Issue:** `saveSettings()` called on every command without debounce. Harmless but wasteful.
**Suggestion:** Debounce history persistence by 500ms.

## Previously Identified Issues (All Fixed)

| Issue | File | Status |
|-------|------|--------|
| `filePath` vs `normalizedPath` in reconcileItem | `operations.ts` L230 | ✅ Fixed |
| Monkey-patch stacking (settings/palette) | `messageHandler.ts` | ✅ Fixed (uninstall tracking) |
| `reconcileDeletion` O(n) on hot path | `patches.ts` | ✅ Fixed (Set cache) |
| `explorerUtils` scanAll on every layout-change | `explorerUtils.ts` | ✅ Fixed (view-change guard) |
| Console logic inline in messageHandler | `messageHandler.ts` | ✅ Fixed (extracted to consoleHandler.ts) |
| `onCssChange` event listener leak | `workspaceEvents.ts` | ✅ Fixed (offref() cleanup) |
| Hardcoded 150ms editor ready timeout | `editorOpeners.ts` | ✅ Fixed (ready promise) |
| `serializeMonacoHotkeys` missing settings param | `hotkeyUtils.ts` | ✅ Fixed |

## Files Reviewed During This Audit

### Source Files
- `src/main.ts` — Plugin entry point, full lifecycle
- `src/editor/mountCodeEditor/messageHandler.ts` — postMessage dispatch
- `src/editor/mountCodeEditor/consoleHandler.ts` — Console process management
- `src/editor/mountCodeEditor/buildBlobUrl.ts` — Blob URL construction
- `src/editor/codeEditorView/editorOpeners.ts` — File opening logic
- `src/editor/iframe/console.ts` — Console UI (iframe side)
- `src/utils/hiddenFiles/operations.ts` — Reveal/unreveal operations
- `src/utils/hiddenFiles/patches.ts` — Adapter patching
- `src/utils/explorerUtils.ts` — Explorer badges, MutationObserver
- `src/utils/hotkeyUtils.ts` — Hotkey serialization
- `src/utils/workspaceEvents.ts` — Workspace event wiring

### Documentation Files (all reviewed and consolidated)
- All files in `docs/` directory (29 documents audited, 12 deleted, 5 consolidated, rest updated)

## Files Reviewed in Second Audit Pass (May 21, 2025)

### Core Files
- `src/main.ts` — Plugin lifecycle, patching, initialization ✅
- `src/editor/codeEditorView/index.ts` — View lifecycle, file I/O, header management ✅
- `src/editor/mountCodeEditor/mountCodeEditor.ts` — Iframe orchestration ✅
- `src/editor/mountCodeEditor/buildInitParams.ts` — Init params resolution ✅
- `src/editor/mountCodeEditor/projectLoader.ts` — Project file loading ✅
- `src/editor/iframe/init.ts` — Monaco initialization, message handling ✅

### Modals
- `src/modals/chooseExtensionModal.ts` — Extension add/remove modal ✅

### Utils
- `src/utils/settingsUtils.ts` — Settings persistence, config cascade ✅
- `src/utils/broadcast.ts` — Config broadcasting to open editors ✅
- `src/utils/extensionUtils.ts` — Extension management, registration ✅
- `src/utils/fileUtils.ts` — File size checks, path utilities ✅

### UI
- `src/ui/codeFilesSettingsTab.ts` — Settings tab with Monaco editor ✅

## Files NOT Yet Reviewed (For Next Audit Pass)

### Iframe Side
- `src/editor/iframe/actions.ts` — Context menu actions
- `src/editor/iframe/formatters.ts` — Formatter providers
- `src/editor/iframe/diff.ts` — Diff modal
- `src/editor/iframe/keybindingUtils.ts` — Keybinding conversion
- `src/editor/monacoMain.ts` — IIFE bundle entry

### Modals (Remaining)
- `src/modals/createCodeFileModal.ts` — File creation modal
- `src/modals/renameExtensionModal.ts` — Rename modal
- `src/modals/editorSettingsModal.ts` — Settings gear modal
- `src/modals/chooseThemeModal.ts` — Theme picker
- `src/modals/chooseHiddenFileModal.ts` — Hidden file opener
- `src/modals/chooseExternalFileModal.ts` — External file opener
- `src/modals/fenceEditModal.ts` — Code fence editor

### UI (Remaining)
- `src/ui/commands.ts` — Command palette commands
- `src/ui/contextMenus.ts` — Context menu registration
- `src/ui/ribbonIcon.ts` — Ribbon icon

### Utils (Remaining)
- `src/utils/hiddenFiles/sync.ts` — Auto-reveal sync
- `src/utils/hiddenFiles/badge.ts` — Folder eye badges
- `src/utils/hiddenFiles/scan.ts` — Hidden file scanning
- `src/utils/projectUtils.ts` — Project file reading
- `src/utils/themeUtils.ts` — Theme resolution
- `src/utils/vaultConfigUtils.ts` — Vault config management
- `src/utils/modalPatch.ts` — Modal patching
- `src/utils/openFilePatch.ts` — Open file patching
- `src/utils/menuPatch.ts` — Menu overlay patching
- `src/utils/shellUtils.ts` — Shell detection (Windows)

### Types
- `src/types/index.ts` — Type definitions

---

**Date:** 2025-05-20  
**Status:** ✅ All issues fixed  
**Next audit:** [audit-findings-2025-05-21.md](audit-findings-2025-05-21.md)
