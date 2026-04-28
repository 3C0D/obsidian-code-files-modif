# Settings Architecture

## Summary

Flat structure stored via Obsidian's `loadData()`/`saveData()` API, with settings distributed across Obsidian Settings Tab, Editor Settings Modal (⚙️), and Monaco F1 palette. AutoSave defaults to OFF for safety.

## Current Structure

**Storage:** Obsidian's plugin data store (managed via `loadData()`/`saveData()`)

```json
{
	"extensions": ["ts", "tsx", "js", "jsx", "py"],
	"theme": "default",
	"recentThemes": ["Dracula", "Nord"],
	"semanticValidation": true,
	"syntaxValidation": true,
	"autoSave": false,
	"editorBrightness": 1.0,
	"wordWrap": "off",
	"folding": true,
	"lineNumbers": true,
	"minimap": true,
	"editorConfigs": {
		"*": "{...global config...}",
		"ts": "{\n  \"tabSize\": 4\n}"
	},
	"allExtensions": false,
	"excludedExtensions": [],
	"extraExtensions": [],
	"maxFileSize": 10,
	"projectRootFolder": "",
	"projectRootFolderColor": "",
	"lastSelectedConfigExtension": "",
	"commandPaletteHotkeyOverride": "",
	"settingsHotkeyOverride": "",
	"deleteFileHotkeyOverride": "",
	"excludedFolders": ["node_modules", ".git"],
	"revealedFiles": {},
	"autoRevealRegisteredDotfiles": true,
	"temporaryRevealedPaths": []
}
```

## Settings Distribution

| Location                     | Settings                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Obsidian Settings Tab**    | Extensions (manual/extended mode), Extra/Exclusions, Max File Size, Project Root Folder, Hotkey Overrides, Excluded Folders, Auto-Reveal Dotfiles |
| **⚙️ Editor Settings Modal** | AutoSave, WordWrap, Folding, LineNumbers, Minimap, Semantic/Syntax Validation, Editor Brightness, Editor Config (JSON)                                         |
| **Monaco F1 Palette**        | All editor actions + Save                                                                                                                                      |

## EditorSettingsModal Structure

### Top Section — UI Toggles

Global settings: AutoSave, WordWrap, Folding, Line Numbers, Minimap, Semantic Validation, Syntax Validation

### Bottom Section — JSON Editor

- **Title:** `Editor Config — .ts` (current extension)
- **Embedded Monaco** with JSONC support
- **Storage:** `editorConfigs[ext]`
- **Merging:** Always sends `editorConfigs['*']` + `editorConfigs[ext]` via `buildMergedConfig()`
- **Updates:** Sends `change-editor-config` to iframe on change

## AutoSave Behavior

### Default: OFF

**Reason:** In code files, accidental keystrokes can silently modify files. AutoSave OFF requires explicit Ctrl+S.

### Implementation

**Location:** `CodeEditorView`

**Architecture: Callbacks vs Gatekeeper**
The integration relies on a clear separation of concerns between the editor's event callbacks and the central save mechanism. 

When mounting the editor (`mountCodeEditor`), we inject callbacks that act simply as "intent signals", without needing to know the current state of settings like `autoSave`:

1. **`onChange` callback:** Triggered every time the user types. It asks Obsidian to queue an automatic save (`requestSave()`).
   * **Why `requestSave`?** Because Monaco runs in an isolated `iframe`, Obsidian is "blind" to user typing events. `requestSave()` acts as an alarm clock. It tells Obsidian's internal timer: *"The user typed something, start your 2-second countdown"*. Once the countdown finishes, Obsidian automatically calls `save()`.
2. **`onSave` callback:** Triggered explicitly by `Ctrl+S`. It sets a "VIP pass" (`forceSave = true`) and immediately forces a save (`this.save()`).

**The Gatekeeper (`save()` function)**
Obsidian's parent class (`TextFileView`) is designed to constantly trigger automatic background saves (on focus loss, timeouts, or via our `requestSave` requests) by calling `save()`.

If we only checked `if (!autoSave) return;` inside `save()`, we would block **all** saves, including intentional manual saves by the user. This is where `forceSave` acts as the VIP pass for manual saves:

- **Obsidian's background saves (or `onChange`):** Call `save()` → `forceSave` is false → Blocked by the gatekeeper when autoSave is OFF.
- **Manual Save (Ctrl+S):** Callback explicitly sets `forceSave = true` → calls `save()` → Allowed by the gatekeeper despite autoSave being OFF → Resets `forceSave = false`.
- **Obsidian close:** `forceSave` is false → Blocked → Unsaved changes are intentionally lost.

### Visual Indicator

Small circle after extension badge when autoSave OFF:

- **Empty circle** — no changes
- **Filled white circle** — unsaved changes
- **Disappears** when autoSave re-enabled

## WordWrap Behavior

**Alt+Z** and EditorSettingsModal toggle update **persisted setting** (not just current session).

**Implementation:**

- Iframe receives `change-editor-config` or `word-wrap-toggled` message
- Applied immediately to current editor
- Saved via `plugin.saveData()` for future sessions

---

**Revised:** ✓
