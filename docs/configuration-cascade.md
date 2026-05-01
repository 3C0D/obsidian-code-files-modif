# Configuration Cascade

## Summary

Editor configuration flows through a **three-level cascade**: **TypeScript Defaults → Global Config → Extension Config**. Each level overrides the previous, with extension config having the highest priority. The merge logic is implemented in `buildMergedConfig()` in `src/utils/settingsUtils.ts`.

## Overview

The plugin uses a **three-level cascade** to determine the final configuration for each Monaco editor instance. Each level can override values from the previous level, with the rightmost level having the highest priority.

## Configuration Levels

---

## 1. TypeScript Defaults (Lowest Priority)

**Location:** `src/types/types.ts`

**Purpose:** Define the plugin's default configuration before any user customization.

### Global Default Config

`DEFAULT_EDITOR_CONFIG` defines defaults like `tabSize: 4`, `insertSpaces: true`, `formatOnSave: true`, `printWidth: 100`. This applies to all file types unless overridden.

### Extension Default Config

`getExtensionConfigTemplate(ext)` returns language-specific templates with commented suggestions:

- **Markdown (`.md`)**: `proseWrap` option (`"always"` | `"never"` | `"preserve"`), `printWidth: 80`
- **JSON/YAML (`.json`, `.yaml`, `.yml`)**: `tabSize: 2`
- **JavaScript/TypeScript (`.js`, `.ts`, `.jsx`, `.tsx`)**: `tabSize: 2`, `printWidth: 100`
- **Python (`.py`)**: `tabSize: 4`, `printWidth: 88` (Black formatter default)
- **Go (`.go`)**: `insertSpaces: false` (tabs, gofmt standard)
- **Rust (`.rs`)**: `tabSize: 4`, `printWidth: 100` (rustfmt default)
- **C/C++/Java/C#/PHP**: `tabSize: 4`
- **CSS/SCSS/Less/HTML/GraphQL/Mermaid**: Language-appropriate suggestions

If no template exists for an extension, falls back to generic `DEFAULT_EXTENSION_CONFIG`.

### Plugin Settings Default

`DEFAULT_SETTINGS` initializes `editorConfigs: { '*': DEFAULT_EDITOR_CONFIG }` on first install.

---

## 2. Global Config (User-Defined)

**Location:** `plugin.settings.editorConfigs['*']`

**Purpose:** User's global configuration that applies to all file types.

**How to edit:** Open any code file → click ⚙️ gear icon → edit "Global Config" section

**Effect:** Overrides `DEFAULT_EDITOR_CONFIG` values for all file types unless a per-extension config overrides it

---

## 3. Extension Config (Highest Priority)

**Location:** `plugin.settings.editorConfigs['.ts']`, `editorConfigs['.md']`, etc.

**Purpose:** User's per-extension configuration that applies only to specific file types.

**How to edit:** Open any code file → click ⚙️ gear icon → select extension from dropdown → edit "Extension Config" section

**Language-Specific Templates:** When creating a new extension config, the editor pre-fills with language-specific suggestions:

- **Markdown (`.md`)**: Includes `proseWrap` option (`"always"` | `"never"` | `"preserve"`)
- **JSON/YAML (`.json`, `.yaml`)**: Suggests `tabSize: 2` (common convention)
- **JavaScript/TypeScript (`.js`, `.ts`, `.jsx`, `.tsx`)**: Suggests `tabSize: 2`, `printWidth: 100`
- **Python (`.py`)**: Suggests `tabSize: 4`, `printWidth: 88` (Black formatter default)
- **Go (`.go`)**: Suggests `insertSpaces: false` (tabs, gofmt standard)
- **Rust (`.rs`)**: Suggests `tabSize: 4`, `printWidth: 100` (rustfmt default)
- **C/C++/Java/C#/PHP**: Suggests `tabSize: 4` (common convention)

These are **commented suggestions** — uncomment to override global config.

**Effect:** Overrides both `DEFAULT_EDITOR_CONFIG` and global config (`'*'`) for the specified extension only

---

## How the Cascade Works

### Step 1: Build Merged Config

When a file is opened, `buildMergedConfig(plugin, ext)` in `src/utils/settingsUtils.ts` is called.

**Process:**
1. Load global config from `editorConfigs['*']` (or use `DEFAULT_EDITOR_CONFIG` if missing)
2. Load extension config from `editorConfigs['.ts']` (or use `{}` if missing)
3. Merge: `{ ...globalCfg, ...extCfg }`
4. Return as JSON string

**Result:** A single merged config object with extension-specific values overriding global values.

### Step 2: Send to Monaco

The merged config is sent to the Monaco iframe via postMessage in `mountCodeEditor.ts` using `instance.send('init', { editorConfig: buildMergedConfig(...), ... })`.

### Step 3: Apply in Monaco

The iframe receives the config and `applyEditorConfig(cfg)` in `monacoEditor.html` applies it:

1. Extract `tabSize`, `insertSpaces` → apply to Monaco model
2. Extract `formatOnSave` → update local variable
3. Extract `printWidth` → update Prettier config
4. Extract remaining options → apply to Monaco editor

**Result:** The HTML defaults are completely overwritten by the merged config.

---

## Example Walkthrough

Opening a `.md` (Markdown) file:

**TypeScript Defaults:**
- `tabSize: 4`, `insertSpaces: true`, `formatOnSave: true`, `printWidth: 100`

**Global Config (`editorConfigs['*']`):**
```json
{
    "tabSize": 2,
    "printWidth": 120
}
```

**Extension Template (`.md`):**
```jsonc
{
    // Markdown-specific options
    // "printWidth": 80,
    // "proseWrap": "always",  // "always" | "never" | "preserve"
    // "tabSize": 2,
}
```

**User uncomments and sets:**
```json
{
    "proseWrap": "never",
    "printWidth": 80
}
```

**Final Merged Config:**
- `tabSize: 2` — from global (overrides default 4)
- `insertSpaces: true` — from default (not overridden)
- `formatOnSave: true` — from default (not overridden)
- `printWidth: 80` — from `.md` extension (overrides global 120)
- `proseWrap: "never"` — from `.md` extension (overrides default "always")

---

## Design Rationale

**Separation of Concerns:** TypeScript defaults (plugin baseline), global config (user preferences), extension config (per-language overrides).

**Progressive Enhancement:** Start with sensible defaults, allow global customization, enable per-extension fine-tuning.

**VS Code Consistency:** Mirrors VS Code's built-in defaults → user settings → workspace settings pattern.

**Minimal Persistence:** Only store what differs from defaults. Extension configs matching global are deleted (see `saveEditorConfig()` in `src/utils/settingsUtils.ts`).

---

## Implementation Notes

### Why No HTML Defaults?

Previous versions had a fourth level with hardcoded defaults in `src/editor/iframe/config.ts` (e.g., `PRETTIER_PRINT_WIDTH = 80`). These were removed because:

1. **Redundant:** Always overwritten by `applyEditorConfig()` before first use
2. **Confusing:** Created a false impression of being configurable
3. **Inconsistent:** Values didn't match `DEFAULT_EDITOR_CONFIG` (80 vs 100 for printWidth)
4. **Maintenance burden:** Required syncing two sources of truth

Now, configuration variables in the HTML (`formatOnSave`, `PRETTIER_PRINT_WIDTH`, etc.) are declared without initial values and set by `applyEditorConfig()` during initialization.

---

## Key Takeaways

1. **TypeScript defaults are the source of truth** — they define the plugin's baseline behavior
2. **Global config is user-defined** — it overrides TypeScript defaults for all files
3. **Extension config is the highest priority** — it overrides everything for specific file types
4. **The cascade is implemented in `buildMergedConfig()`** — this is the single source of truth for the merge logic
5. **No HTML defaults** — configuration variables are initialized by `applyEditorConfig()` during Monaco setup

---

## Related Files

- `src/editor/iframe/config.ts` — Configuration variables (no defaults, set by `applyEditorConfig()`)
- `monacoEditor.html` — Monaco initialization and `applyEditorConfig()` function
- `src/types/types.ts` — TypeScript defaults (`DEFAULT_EDITOR_CONFIG`, `getExtensionConfigTemplate()`)
- `src/utils/settingsUtils.ts` — Merge logic (`buildMergedConfig()`)
- `src/utils/mountCodeEditor.ts` — Sends merged config to Monaco iframe
- `src/modals/editorSettingsModal.ts` — UI for editing global and extension configs (uses `getExtensionConfigTemplate()`)
