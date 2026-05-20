# Audit Findings — May 21, 2025

## Summary
Second comprehensive audit pass. Previous issues (file size guard, REPL bug, error recovery, history debounce) have all been resolved. Current code is solid with good error handling and performance optimizations.

**Implementation instructions:** See [audit-implementation-instructions-2025-05-21.md](audit-implementation-instructions-2025-05-21.md) for detailed LLM-ready fix instructions.

## Findings

### 1. Console Output Virtual Scrolling (Deferred — Low Priority)
**File:** `src/editor/iframe/console.ts`  
**Issue:** Console output is appended as raw DOM elements. With very fast output (build tools), DOM can briefly bloat before the 5000-line truncation.  
**Status:** Not a priority. Previous testing with 2000 console.log messages showed no freeze. The 5000-line truncation is working correctly. Revisit only if users report performance issues with very large outputs.  
**Suggestion:** Consider a virtual scrolling approach for the output container, or batch DOM updates in a requestAnimationFrame.

### 2. Settings Tab: maxFileSize Input Type (Minor UX)
**File:** `src/ui/codeFilesSettingsTab.ts` (line 119-136)  
**Issue:** The maxFileSize input now uses `type="number"` with `step="0.1"`, which is good. However, the validation in `onChange` doesn't prevent invalid input during typing — it only validates on change.  
**Current behavior:** User can type "0.05" and it will be rejected silently (min is 0.1).  
**Suggestion:** Add `onBlur` validation to restore the previous valid value if the user leaves an invalid value in the field. This prevents confusion when the input shows "0.05" but the setting is still "10".  
**Priority:** Low — current behavior is functional, just not ideal UX.

### 3. Extension Modal: Empty Extension Handling (Edge Case)
**File:** `src/modals/chooseExtensionModal.ts` (line 48-51)  
**Issue:** The modal allows typing an empty string after removing the leading dot. If the user types just "." and presses Enter, the query becomes empty string after normalization, and the modal offers to add it.  
**Current behavior:** `addExtension()` in `extensionUtils.ts` blocks empty strings (line 73), so the operation fails silently with a console warning.  
**Suggestion:** Filter out empty strings in `getSuggestions()` before offering to add them. This prevents the confusing UX of seeing "Add ''" in the suggestions.  
**Priority:** Low — edge case, already blocked by validation.

### 4. Project Root Folder: Non-Existent Path Handling (Robustness)
**File:** `src/main.ts` (line 77-84)  
**Issue:** On layout ready, the plugin checks if `projectRootFolder` exists and clears it if not. This is good. However, if the user manually types a non-existent path in the settings modal, it's accepted without validation.  
**Current behavior:** Invalid path is saved, then cleared on next reload. Cross-file navigation won't work until reload.  
**Suggestion:** Add validation in the settings tab when the user changes `projectRootFolder` — check if the path exists before saving. Show a Notice if invalid.  
**Priority:** Low — current behavior is safe (clears on reload), just not immediate feedback.

### 5. Hidden Files: Symlink Exclusion Documentation (Clarity)
**File:** README.md (line 267)  
**Issue:** The README mentions that symlinks are excluded from scanning, but doesn't explain why or what happens if a user tries to reveal a symlink.  
**Current behavior:** Symlinks are silently excluded from the hidden files modal. This is correct (prevents recursive loops and excessive I/O).  
**Suggestion:** Add a note in the README explaining that symlinks are excluded for safety, and that users should access symlinked files via their real paths instead.  
**Priority:** Very Low — documentation clarity only.

## Code Quality Observations (No Action Needed)

### Excellent Patterns Found
- **Error boundaries:** All async operations have proper try-catch blocks
- **Resource cleanup:** Consistent use of `cleanup()` methods and `onunload()` handlers
- **Type safety:** Comprehensive TypeScript types with proper null checks
- **Performance:** Smart caching (`_revealedItemsCache`, `_cachedBlobUrl`) and debouncing
- **Separation of concerns:** Clean module boundaries (iframe vs host, utils vs UI)

### Well-Handled Edge Cases
- **Popout windows:** Correct use of `containerEl.ownerDocument` and `doc.win`
- **External files:** Proper adapter.write() to avoid triggering vault watchers
- **Dotfiles:** Comprehensive reveal/unrevel logic with auto-reveal and manual overrides
- **Cross-platform:** Consistent use of `normalizePath()` and platform checks

## Files Reviewed in This Audit Pass

### Core Files
- `src/main.ts` — Plugin lifecycle, patching, initialization
- `src/editor/codeEditorView/index.ts` — View lifecycle, file I/O, header management
- `src/editor/mountCodeEditor/mountCodeEditor.ts` — Iframe orchestration
- `src/editor/mountCodeEditor/buildInitParams.ts` — Init params resolution
- `src/editor/mountCodeEditor/projectLoader.ts` — Project file loading
- `src/editor/iframe/init.ts` — Monaco initialization, message handling

### Modals
- `src/modals/chooseExtensionModal.ts` — Extension add/remove modal

### Utils
- `src/utils/settingsUtils.ts` — Settings persistence, config cascade
- `src/utils/broadcast.ts` — Config broadcasting to open editors
- `src/utils/extensionUtils.ts` — Extension management, registration
- `src/utils/fileUtils.ts` — File size checks, path utilities

### UI
- `src/ui/codeFilesSettingsTab.ts` — Settings tab with Monaco editor

## Files Reviewed in Previous Audit (May 20, 2025)

### Source Files
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

**Date:** 2025-05-21
