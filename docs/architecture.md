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
- **Manual mode**: `settings.extensions[]`
- **Extended mode**: `getAllMonacoExtensions()` + exclusions
- `reregisterExtensions()` diffs changes to avoid re-registering identical extensions

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
