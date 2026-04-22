# Architecture — Code Files Plugin

## Summary
Monaco Editor integration via iframe with postMessage communication. Single entry point `mountCodeEditor()` creates isolated Monaco instances with blob URLs to bypass CSP restrictions.

## Core Components

### Communication Flow
```
CodeEditorView → mountCodeEditor() → iframe (monacoEditor.html) → Monaco Editor
                     ↕ postMessage protocol
```

### Key Files
- `mountCodeEditor.ts` — iframe creation, postMessage handling
- `monacoEditor.html` — Monaco instance, receives messages
- `codeEditorView.ts` — Obsidian TextFileView wrapper
- `getLanguage.ts` — extension → language mapping
- `hiddenFilesUtils.ts` — hidden files scanning, reveal/hide operations
- `hiddenFilesModal.ts` — modal for revealing/hiding dotfiles per folder

## postMessage Protocol

### Parent → iframe
| Type | Purpose |
|------|--------|
| `init` | Create Monaco editor (once) |
| `change-value` | Replace content |
| `change-theme` | Apply theme |
| `change-editor-config` | Update settings (tabSize, etc.) |
| `load-project-files` | Load TS/JS files for IntelliSense |

### iframe → parent
| Type | Purpose |
|------|--------|
| `ready` | Monaco loaded |
| `change` | Content modified |
| `save-document` | Ctrl+S pressed |
| `open-file` | Ctrl+Click navigation |
| `format-diff-available` | Formatting completed |

## Language System
```
dynamicMap (Monaco) > staticMap (fallback) > 'plaintext'
```
- `staticMap` — 80 common extensions, available at startup
- `dynamicMap` — from `monaco.languages.getLanguages()`, persisted in `data.json`

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
- `addExtension()`: removes from `excludedExtensions`, adds to `extraExtensions` if not in base
- `removeExtension()`: adds to `excludedExtensions`, removes from `extraExtensions`
- `reregisterExtensions()` diffs changes to avoid re-registering identical extensions

## Hidden Files Management

**Reveal System:**
- `revealedFiles` — map of folder paths to arrays of revealed file paths
- `scanHiddenFiles()` — scans folder for dotfiles, respects exclusions
- `revealFiles()` — makes dotfiles visible in Obsidian's file explorer
- `hideFilesInFolder()` — removes dotfiles from explorer
- `decorateFolders()` — adds eye icon badge to folders with revealed files

**Adapter Patching:**
- `patchAdapter()` — prevents Obsidian from auto-deleting revealed dotfiles
- `reconcileDeletion` override blocks deletion unless explicitly requested
- `_bypassPatch` flag allows intentional hiding via `hideFilesInFolder()`

**Persistence:**
- Revealed files stored in `settings.revealedFiles` per folder
- `restoreRevealedFiles()` re-registers dotfiles on plugin load
- `cleanStaleRevealedFiles()` removes entries for deleted files

## Editor Config
```
editorConfigs['*'] (global) + editorConfigs['ts'] (per-extension) → merged config
```

## CSP Solutions
| Problem | Solution |
|---------|----------|
| Dynamic `<link>` blocked | CSS inlined + patch `appendChild` |
| `data:` fonts blocked | TTF copied, `app://` URLs |
| Relative `./vs` broken | Absolute `app://` URLs |
| `file://` blocked | Blob URL as iframe src |

---

**Revised:** ✓
