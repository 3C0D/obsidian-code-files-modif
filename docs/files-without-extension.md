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
extraExtensions: ['']; // Handles all files without extension
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
buildMergedConfig(plugin, 'prettierrc');
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
const languageCfg =
	language !== ext && language !== 'plaintext'
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
	return language === ext; // Also broadcast to extensions that map to this language
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
	const targets =
		ext === '*'
			? views
			: views.filter((v) => v.file && getEmptyFileExtension(v.file) === ext);
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

### Creating Files Without Extension

**The Bug (Fixed):**

When creating a file with only an extension (no name), like `.prettierrc`, the modal would crash with "Cannot read properties of null (reading 'path')" because `vault.create()` returns a `TFile` that may not be immediately indexed in the vault.

**The Fix:** (`createCodeFileModal.ts`)

Use `CodeEditorView.openFile()` instead of `openVaultFile()` after creating the file:

```typescript
const newFile = await this.app.vault.create(newPath, '');
void CodeEditorView.openFile(newFile, this.plugin);
```

`openFile()` checks if the file exists in the vault with `getAbstractFileByPath()` before opening, handling newly created files correctly.

### Testing

1. Open `.prettierrc` in Monaco
2. Open Editor Settings (gear icon)
3. Change `tabSize` from 4 to 2
4. Close settings modal
5. Format document (Shift+Alt+F)
6. Verify formatting uses 2-space indentation

## Current Status

The plugin now handles dotfiles natively through the **Reveal Hidden Files** system:

### Built-in Dotfile Management

- **Automatic "Detect all file extensions"**: On plugin startup, the plugin automatically enables Obsidian's "Detect all file extensions" setting (required for dotfile visibility). A one-time notice is shown when this happens. Managed by `vaultConfigUtils.ts`.
- **Auto-reveal**: When a dotfile extension (e.g., `.env`, `.gitignore`) is registered with Code Files, it is automatically made visible in the Obsidian file explorer (if "Auto-reveal registered dotfiles" is enabled, which is the default).
- **Manual control**: The "Reveal Hidden Files" modal (`.re` quick action or folder context menu) allows scanning and manually revealing/hiding dotfiles per folder.
- **Patch layer**: `openFilePatch.ts` intercepts Obsidian's file opening to ensure dotfiles and extension-less files open in Monaco when registered (or unconditionally for extension-less files like LICENSE, README).
- **Adapter patches**: `patchAdapter()` prevents Obsidian from auto-deleting revealed dotfiles, fixes drag-and-drop destination paths, and allows dotfile deletion via trash. `patchRegisterExtensions()` keeps dotfile visibility in sync with extension registration state.
- **No external plugin required**: The Code Files plugin fully manages dotfile visibility without any third-party dependencies.

### To See Dotfiles in Explorer

1. Register the extension in Code Files settings (e.g., add `env` for `.env` files)
2. The dotfile automatically becomes visible in the explorer (if "Auto-reveal registered dotfiles" is enabled, which is the default)
3. Click to open — it opens directly in Monaco

For bulk operations, open the Reveal Hidden Files modal via quick action (`.re`) or folder context menu.

---

**Revised:** ✓
