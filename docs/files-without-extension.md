# Files Without Extension Support

## Summary
Files without extension (`.env`, `.gitignore`, `LICENSE`, `README`, etc.) automatically open in Monaco by registering empty string `""` as an extension in `extraExtensions`. This is the only modification needed.

## The Problem
Obsidian's file system treats files without extension as having `file.extension = ""` (empty string):
- `.env` → `file.extension = ""`
- `LICENSE` → `file.extension = ""`
- `.gitignore` → `file.extension = ""`

These files cannot be registered individually because they all share the same "extension" (none).

## The Solution
Register `""` (empty string) as an extension in `extraExtensions`:

**Location:** `types.ts` - `DEFAULT_SETTINGS`
```typescript
extraExtensions: ['']  // Handles all files without extension
```

**Why `extraExtensions`?**
- Works in both manual and extended modes
- Always included regardless of mode toggle
- Merged with other extensions via `getActiveExtensions()`

## How It Works

When Obsidian tries to open a file:
1. Checks `file.extension` → returns `""`
2. Looks up `""` in registered extensions
3. Finds `viewType = 'code-editor'` registered for `""`
4. Opens file in Monaco instead of default view

## Behavior

### Automatic Opening
All files with `file.extension === ""` open in Monaco:
- `.env`, `.gitignore`, `.dockerignore`
- `LICENSE`, `README`, `Makefile`
- Any file starting with `.` and no extension

### Language Detection
Falls back to `plaintext` since these files aren't in `staticMap`.

## Editor Configuration for Files Without Extension

### The Challenge

Files like `.prettierrc`, `.env`, or `LICENSE` need per-file editor configuration (tabSize, formatOnSave, etc.), but they all share `file.extension = ""`. The plugin uses a mapping system to assign unique "fake extensions" for configuration purposes.

### How It Works

**Step 1: Extension Mapping** (`getEmptyFileExtension` in `fileUtils.ts`)

Maps files without extension to unique identifiers:
- `.prettierrc` → `"prettierrc"`
- `.env` → `"env"`
- `LICENSE` → `"license"`
- `.gitignore` → `"gitignore"`

This allows each file type to have its own editor config.

**Step 2: Language Detection** (`getLanguage` in `getLanguage.ts`)

Maps fake extensions to Monaco language IDs:
```typescript
prettierrc: 'json',
env: 'plaintext',
gitignore: 'plaintext'
```

**Step 3: Configuration Cascade** (`buildMergedConfig` in `settingsUtils.ts`)

Merges global config with per-extension overrides:
```typescript
buildMergedConfig(plugin, 'prettierrc')
// Returns: global config + prettierrc-specific overrides
```

### Configuration Cascade with Language Fallback

**New Feature:** Extensions that map to a different Monaco language automatically inherit that language's config as a fallback.

**Example:** `.clangformat` maps to `yaml` language

**Cascade order:**
1. Global config (`*`)
2. Language config (`yaml`) — if extension maps to a different language
3. Extension config (`clangformat`) — highest priority

**Implementation:**

`buildMergedConfig` in `settingsUtils.ts`:
```typescript
const language = staticMap[ext] ?? 'plaintext';
const languageCfg = (language !== ext && language !== 'plaintext')
    ? parseEditorConfig(plugin.settings.editorConfigs[language] ?? '{}')
    : {};
return JSON.stringify({ ...globalCfg, ...languageCfg, ...extCfg });
```

`getExtensionConfigTemplate` in `types.ts`:
```typescript
const language = staticMap[ext] ?? 'plaintext';
if (language !== ext && language !== 'plaintext' && templates[language]) {
    return templates[language];
}
```

`broadcastEditorConfig` in `broadcast.ts`:
```typescript
const targets = views.filter((v) => {
    const fileExt = getEmptyFileExtension(v.file);
    if (fileExt === ext) return true;
    const language = staticMap[fileExt] ?? 'plaintext';
    return language === ext;  // Also broadcast to extensions that map to this language
});
```

**Benefits:**
- `.clangformat` inherits YAML config (tabSize: 2, insertSpaces: true)
- `.prettierrc` inherits JSON config (tabSize: 2)
- Changing `yaml` config broadcasts to all YAML files AND `.clangformat`
- No duplicate config needed for extensions that share a language

**Testing:**
1. Create `.clangformat` file
2. Open Editor Settings → shows YAML template (tabSize: 2)
3. Change YAML config → applies to `.clangformat` immediately
4. Create `.clangformat` specific config → overrides YAML config

### Broadcasting Config Changes

**The Bug (Fixed):**

When changing editor config for `.prettierrc`, the settings modal would save the config under key `"prettierrc"`, but `broadcastEditorConfig` was filtering views by `file.extension` (which is `""` for `.prettierrc`), so the config never reached the open editor.

**The Fix:** (`broadcast.ts`)

Use `getEmptyFileExtension()` instead of `file.extension` when broadcasting:

```typescript
export function broadcastEditorConfig(plugin: CodeFilesPlugin, ext: string): void {
    const views = getCodeEditorViews(plugin.app);
    const targets = ext === '*' ? views : views.filter((v) => v.file && getEmptyFileExtension(v.file) === ext);
    for (const view of targets) {
        const fileExt = view.file ? getEmptyFileExtension(view.file) : '';
        const config = buildMergedConfig(plugin, fileExt);
        view.editor?.send('change-editor-config', { config });
    }
}
```

This ensures:
- Config saved under `"prettierrc"` is broadcast to files with `getEmptyFileExtension(file) === "prettierrc"`
- Each file type receives its correct configuration
- Format settings (tabSize, formatOnSave) apply immediately when closing the settings modal

### Testing

1. Open `.prettierrc` in Monaco
2. Open Editor Settings (gear icon)
3. Change `tabSize` from 4 to 2
4. Close settings modal
5. Format document (Shift+Alt+F)
6. Verify formatting uses 2-space indentation

## Current Limitation

**Requires external plugin:** Files starting with `.` are hidden by Obsidian by default. Users need a plugin like "Show Hidden Files" to see them in the file explorer.

**Future consideration:** Add "Open Hidden Files" command directly in Code Files plugin.

## Testing

1. Install "Show Hidden Files" plugin (or similar)
2. Create `.env` file in vault
3. Click on `.env` → opens automatically in Monaco
4. Create `LICENSE` file → opens automatically in Monaco

---

**Revised:** ✓
