# Architecture — Code Files Plugin

## Summary

Monaco Editor integration via iframe with postMessage communication. Single entry point `mountCodeEditor()` creates isolated Monaco instances with blob URLs to bypass CSP restrictions. The actual Monaco editor objects reside in the iframes; the main code interacts with them through `CodeEditorHandle` proxies that manage postMessage communication.

## Core Components

### Communication Flow

```
CodeEditorView → mountCodeEditor() → iframe (monacoEditor.html) → Monaco Editor
                     ↕ postMessage protocol
```

### Key Files

- `mountCodeEditor/` — Monaco iframe integration (modular)
  - `mountCodeEditor.ts` — main entry point, iframe creation
  - `messageHandler.ts` — postMessage protocol handling
  - `buildInitParams.ts` — initialization parameters builder
  - `projectLoader.ts` — TypeScript/JavaScript project file loading
  - `assetUrls.ts` — asset path resolution
  - `buildBlobUrl.ts` — blob URL creation with CSP workarounds
- `monacoEditor.html` — Monaco instance, receives messages
- `codeEditorView.ts` — Obsidian TextFileView wrapper
- `getLanguage.ts` — extension → language mapping
- `hiddenFiles/` — hidden files management (modular)
  - `operations.ts` — reveal/hide operations, temporary reveal handling
  - `badge.ts` — folder decoration with eye badges
  - `patches.ts` — adapter patching for dotfile support
  - `scan.ts` — dotfile scanning
  - `sync.ts` — auto-reveal synchronization
- `vaultConfigUtils.ts` — vault-level settings management ("Detect all file extensions")
- `revealHiddenFilesModal.ts` — modal for revealing/hiding dotfiles per folder

## postMessage Protocol

### Parent → iframe

| Type                   | Purpose                           |
| ---------------------- | --------------------------------- |
| `init`                 | Create Monaco editor (once)       |
| `change-value`         | Replace content                   |
| `change-theme`         | Apply theme                       |
| `change-editor-config` | Update settings (tabSize, etc.)   |
| `load-project-files`   | Load TS/JS files for IntelliSense |

### iframe → parent

| Type                    | Purpose               |
| ----------------------- | --------------------- |
| `ready`                 | Monaco loaded         |
| `change`                | Content modified      |
| `save-document`         | Ctrl+S pressed        |
| `open-file`             | Ctrl+Click navigation |
| `format-diff-available` | Formatting completed  |

## Language System

```
staticMap > 'plaintext'
```

- `staticMap` — maps 80+ common file extensions to Monaco language IDs, available at startup
- Unknown extensions → 'plaintext' (no syntax highlighting)
- The map is defined in `getLanguage.ts` and used throughout the plugin

## Extension Management

**Unified System:**

- `extensions[]` — base list (changes only when switching modes)
- `extraExtensions[]` — user additions (common to both modes)
- `excludedExtensions[]` — user exclusions (common to both modes)
- Active extensions = `(extensions + extraExtensions) - excludedExtensions`

**Two Modes:**

- **Manual mode** (`allExtensions: false`): `extensions[]` = curated default list
- **Extended mode** (`allExtensions: true`): `extensions[]` = all Monaco-supported extensions

**Mode Switching:**

- Switching to extended: `extensions = getAllMonacoExtensions()` (all staticMap keys)
- Switching to manual: `extensions = DEFAULT_SETTINGS.extensions` (curated list)
- Customizations (`extraExtensions`, `excludedExtensions`) persist across mode switches

**Runtime Operations:**

- `addExtension()`: blocks empty string, native extensions, and already registered extensions; removes from `excludedExtensions`, adds to `extraExtensions` if not in base
- `removeExtension()`: if in `extraExtensions`, just removes it; if in base `extensions`, adds to `excludedExtensions` to override
- `reregisterExtensions()` diffs changes to avoid re-registering identical extensions

## Hidden Files Management

**Vault Configuration:**

- `ensureDetectAllExtensions()` — automatically enables Obsidian's "Detect all file extensions" setting on plugin startup (required for dotfile visibility)
- `showDetectAllExtensionsNotice()` — one-time notice shown when the setting is first enabled
- Located in `vaultConfigUtils.ts`

**Reveal System:**

- `revealedFiles` — map of folder paths to arrays of revealed file paths
- `temporaryRevealedPaths` — array of file paths temporarily revealed (e.g., workspace restore)
- `scanDotEntries()` — scans folder for dotfiles, respects exclusion settings, filters by max file size
- `revealFiles()` — makes dotfiles visible in Obsidian's file explorer
    - `persist` parameter (default: true) — saves to settings for manual reveals only
    - No longer shows notices (silent by default)
- `unrevealFiles()` — removes dotfiles from explorer
    - `temporary` parameter (default: false) — skips settings/badges for transient reveals
- `handleTemporaryReveal()` — reveals a file temporarily and tracks it in `temporaryRevealedPaths`
- `cleanupTemporaryReveal()` — unreveals a temporarily revealed file when closed (unless manually revealed)
- `decorateFolders()` — adds eye icon badge to folders with revealed files

**Auto-Reveal System:**

- `autoRevealRegisteredDotfiles` setting (default: true)
- `syncAutoRevealedDotfiles()` — cleans revealedFiles and auto-reveals dotfiles when extensions are registered
- `autoRevealRegisteredDotfiles()` — scans entire vault on startup to reveal dotfiles with active extensions
- `hideAutoRevealedDotfiles()` — hides all auto-managed files when the feature is disabled
- Auto-managed files are filtered from the hidden files modal UI

**Adapter Patching:**

- `patchAdapter()` — prevents Obsidian from auto-deleting revealed dotfiles
    - `reconcileDeletion` override blocks deletion unless `_bypassPatch` flag is set
    - `rename` patch fixes drag-and-drop destination path for dotfiles (checks if dest is folder, appends filename)
    - `rename` patch blocks moves of external files (snippets, etc.) out of configDir
    - `vault.trash` patch sets `_bypassPatch` before deletion to allow dotfile trash
    - Stores original methods in `plugin._origReconcileDeletion` and `plugin._origRename` for use by other patches
- `patchRegisterExtensions()` — keeps dotfile visibility in sync with extension registration
    - On `registerExtensions`: cleans revealedFiles and auto-reveals matching dotfiles via `syncAutoRevealedDotfiles()`
    - On `unregisterExtensions`: hides non-manually-revealed dotfiles for removed extensions using original reconcileDeletion method

**Persistence:**

- Revealed files stored in `settings.revealedFiles` per folder
- `restoreRevealedFiles()` re-registers dotfiles on plugin load using cross-platform DataAdapter APIs
- `cleanStaleRevealedFiles()` removes entries for deleted files and normalizes paths

**User Interface:**

- `RevealHiddenFilesModal` — two-column modal (reveal checkboxes | register checkboxes)
- Allows on-the-fly extension registration via "register as .ext" checkboxes
- Master checkboxes control all items in each column

## File Explorer Badges

**Visual Indicators:**

- `updateProjectFolderHighlight()` — highlights the Project Root folder in the file explorer (color via `projectRootFolderColor` setting)
- `setupExplorerBadges()` — adds badges to file entries:
    - **Dotfiles with registered extensions** → uppercase extension badge (e.g., "ENV", "GITIGNORE")
    - **Files with unregistered extensions** (excluding native Obsidian extensions like `.md`, `.canvas`) → muted yellow "unregistered" badge
    - Badges update automatically when extensions are registered or unregistered

## Editor Config

```
editorConfigs['*'] (global) + editorConfigs['ts'] (per-extension) → merged config
```

## CSP Solutions

| Problem                  | Solution                          |
| ------------------------ | --------------------------------- |
| Dynamic `<link>` blocked | CSS inlined + patch `appendChild` |
| `data:` fonts blocked    | TTF copied, `app://` URLs         |
| Relative `./vs` broken   | Absolute `app://` URLs            |
| `file://` blocked        | Blob URL as iframe src            |

---

**Revised:** ✓
