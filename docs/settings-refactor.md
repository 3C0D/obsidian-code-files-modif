# Settings Architecture

## Summary

Flat structure stored via Obsidian's `loadData()`/`saveData()` API, with settings distributed across Obsidian Settings Tab, Editor Settings Modal (⚙️), and Monaco F1 palette. AutoSave defaults to OFF for safety.

## Current Structure

**Storage:** Obsidian's plugin data store (managed via `loadData()`/`saveData()`)

```json
{
	"extensions": ["ts", "tsx", "js", "jsx", "py"],
	"theme": "default",
	"overwriteBg": true,
	"recentThemes": ["Dracula", "Nord"],
	"showRibbonIcon": true,
	"folding": true,
	"lineNumbers": true,
	"minimap": true,
	"semanticValidation": true,
	"syntaxValidation": true,
	"autoSave": true,
	"wordWrap": "off",
	"editorConfigs": {
		"*": "{...global config...}",
		"ts": "{\n  \"tabSize\": 4\n}"
	}
}
```

## Settings Distribution

| Location                     | Settings                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Obsidian Settings Tab**    | Ribbon Icon, Extensions (manual/extended mode), Editor Config (per-extension JSON), Project Root Folder highlight |
| **⚙️ Editor Settings Modal** | AutoSave, WordWrap, Folding, LineNumbers, Minimap, Semantic/Syntax Validation, Editor Config (JSON)               |
| **Monaco F1 Palette**        | All editor actions + Save                                                                                         |

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

- `requestSave()` blocked when autoSave OFF
- `save()` blocked except when `forceSave = true`
- **Ctrl+S:** sets `forceSave = true`, allows save
- **Obsidian close:** `forceSave = false` → blocked → unsaved changes lost (intended)

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
