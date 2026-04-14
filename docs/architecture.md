# Architecture — Code Files Plugin

## Communication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Obsidian                                   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ CodeEditorView (TextFileView)                                    │  │
│  │ • One instance per tab                                           │  │
│  │ • Manages file lifecycle (load/save/rename/close)                │  │
│  │ • Handles header UI (theme, settings, badges)                    │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐ │  │
│  │  │ mountCodeEditor() → CodeEditorInstance                     │ │  │
│  │  │ • Creates iframe with blob URL                             │ │  │
│  │  │ • Sets up postMessage communication                        │ │  │
│  │  │                                                            │ │  │
│  │  │  ┌──────────────────────────────────────────────────────┐ │ │  │
│  │  │  │ iframe (monacoEditor.html)                           │ │ │  │
│  │  │  │ • Monaco Editor instance                             │ │ │  │
│  │  │  │ • Isolated environment (blob URL)                    │ │ │  │
│  │  │  │ • Loads Monaco from app:// URLs                      │ │ │  │
│  │  │  │                                                      │ │ │  │
│  │  │  │  postMessage ↕                                       │ │ │  │
│  │  │  │                                                      │ │ │  │
│  │  │  │  ready → init → change-value → change/save          │ │ │  │
│  │  │  └──────────────────────────────────────────────────────┘ │ │  │
│  │  │                                                            │ │  │
│  │  │  API: send(), getValue(), setValue(), destroy()           │ │  │
│  │  └────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  FenceEditModal, EditorSettingsModal → also use mountCodeEditor()      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key principle:** `mountCodeEditor` is the single entry point for creating Monaco editors. It returns a `CodeEditorInstance` that encapsulates the iframe and its lifecycle.

---

## Monaco iframe Lifecycle

### Opening

```
CodeEditorView.onLoadFile(file)
  └── mountCodeEditor(plugin, language, initialValue, codeContext, onChange, onSave)
        ├── 1. Fetch monacoEditor.html via app:// URL
        ├── 2. Patch ./vs → absolute app:// URL (strip timestamp)
        ├── 3. Fetch editor.main.css → inline into HTML
        ├── 4. Patch @font-face codicon → app:// URL for .ttf
        ├── 5. Intercept appendChild to block Monaco's dynamic <link> tags
        ├── 6. Create blob URL → iframe.src
        └── 7. window.addEventListener('message', onMessage)
```

### Initialization Sequence (postMessage)

```
iframe                            parent (mountCodeEditor.ts)
  │                                     │
  │── ready ──────────────────────────► │  Monaco loaded
  │                                     │── init (initParams) ──────────► │
  │                                     │── change-value (initialValue) ──► │
  │
  │  [user edits]
  │── change (value, context) ─────────► │  onChange?.() + requestSave()
  │── save-document (context) ──────────► │  onSave?.() (Ctrl+S)
```

### Closing

```
CodeEditorView.onUnloadFile / onClose
  └── cleanup()
        └── codeEditor.destroy()
              ├── window.removeEventListener('message', onMessage)
              ├── URL.revokeObjectURL(blobUrl)
              └── iframe.remove()
```

---

## postMessage Protocol — Complete Reference

### Parent → iframe

| Type | Payload | Effect |
|------|---------|--------|
| `init` | `initParams` (see below) | Creates Monaco editor (once, guarded by `initialized`) |
| `change-value` | `{ value }` | Replaces editor content |
| `change-language` | `{ language }` | Changes syntax highlighting language |
| `change-theme` | `{ theme, themeData? }` | Applies theme (defineTheme if custom) |
| `change-editor-config` | `{ config }` | Applies JSON config (tabSize, formatOnSave, etc.) |
| `change-options` | `{ noSemanticValidation, noSyntaxValidation }` | Updates TS/JS diagnostics |
| `change-word-wrap` | `{ wordWrap }` | Toggles word wrap |
| `change-background` | `{ background, theme? }` | Changes iframe background |
| `load-project-files` | `{ files: [{path, content}] }` | Loads TS/JS files for IntelliSense |
| `focus` | — | Focuses the editor |
| `scroll-to-position` | `{ position }` | Scrolls to line/column |
| `trigger-show-diff` | — | Opens diff viewer modal |

### iframe → parent

| Type | Payload | Meaning |
|------|---------|----------|
| `ready` | — | Monaco loaded, ready to receive `init` |
| `change` | `{ value, context }` | Content modified by user |
| `save-document` | `{ context }` | Ctrl+S pressed |
| `word-wrap-toggled` | `{ wordWrap, context }` | Alt+Z pressed |
| `format-diff-available` | `{ context }` | Formatting completed with changes |
| `format-diff-reverted` | `{ context }` | All formatting reverted — reset to pre-format state |
| `open-rename-extension` | `{ context }` | "Rename Extension" action triggered |
| `open-theme-picker` | `{ context }` | "Change Theme" action triggered |
| `open-formatter-config` | `{ context }` | "Formatter Config" action triggered |
| `open-settings` | `{ context }` | Ctrl+, pressed |
| `open-obsidian-palette` | `{ context }` | Ctrl+P pressed |
| `open-file` | `{ path, position, context }` | Ctrl+Click on import (cross-file navigation) |
| `delete-file` | `{ context }` | Ctrl+Delete pressed |
| `return-to-default-view` | `{ context }` | Return arrow clicked (unregistered extensions) |

### `initParams` — Detail

```typescript
{
  context: string,               // Instance identifier (file path or "modal-editor.ext")
  lang: string,                  // Monaco language ID
  theme: string,                 // Theme ID (special chars replaced with -)
  themeData?: string,            // Stringified JSON of custom theme (if not builtin)
  wordWrap: 'on' | 'off',
  folding: boolean,
  lineNumbers: boolean,
  minimap: boolean,
  noSemanticValidation: boolean,
  noSyntaxValidation: boolean,
  background?: 'transparent',    // Present if theme === 'default'
  editorConfig: string,          // Merged JSON: global(*) + per-extension
  projectRootFolder?: string,    // For TS/JS cross-file navigation
  isUnregisteredExtension?: boolean,
}
```

---

## The `codeContext`

Each Monaco instance receives a unique `codeContext` at creation. It serves two purposes:

1. **Message filtering** — `onMessage` ignores any message where `data.context !== codeContext`. Multiple iframes can be open simultaneously (a file + a fence modal); without this filter, their messages would cross-contaminate.

2. **Action source identification** — when Monaco sends `open-theme-picker`, the parent knows which iframe originated it.

Typical values:
- Open file: `"path/to/file.ts"` (via `file.path`)
- Fence modal: `"modal-editor.js"`
- JSON config in EditorSettingsModal: `"editor-settings-config.jsonc"`

**Important:** If a file is renamed, the old `codeContext` becomes stale. `CodeEditorView.onRename` destroys the iframe and creates a new one with the correct context.

---

## Language System

Two sources, in priority order:

```
dynamicMap (Monaco) > staticMap (fallback) > 'plaintext'
```

- **`staticMap`** (`getLanguage.ts`) — Static list of ~80 common extensions. Available immediately at startup, before any iframe is opened.
- **`dynamicMap`** — Populated from `monaco.languages.getLanguages()` on first editor open. Persisted in `data.json` (key `languageMap`). Reloaded at startup via `loadPersistedLanguages()`.

Persistence ensures syntax highlighting works from the first reopened tab at startup, without waiting for a Monaco iframe to initialize.

---

## Extension System

Two exclusive modes controlled by `settings.allExtensions`:

| Mode | Active Extensions Source | Modified By |
|------|--------------------------|-------------|
| Manual (`allExtensions: false`) | `settings.extensions[]` | add/remove in list |
| Extended (`allExtensions: true`) | `getAllMonacoExtensions(excluded)` + `extraExtensions[]` | excluded/extra lists |

`getActiveExtensions()` always returns the computed list according to the active mode.

`reregisterExtensions()` diffs the previous list (`_registeredExts`) against the new one and calls `registerExtension`/`unregisterExtension` only for changes — avoids re-registering 80 identical extensions on every save.

---

## Editor Config System

Two levels of JSON config (JSONC supported via `parseEditorConfig`):

```
editorConfigs['*']     → Global config (DEFAULT_EDITOR_CONFIG)
editorConfigs['ts']    → Override for .ts only
```

Merged at usage: `{ ...globalCfg, ...extCfg }`. Sent as `editorConfig` in `initParams`, or via `change-editor-config` for hot updates.

`parseEditorConfig` strips `//` and `/* */` comments and trailing commas before `JSON.parse`.

`broadcastEditorConfig(ext)`: if `ext === '*'`, rebroadcasts merged config to **all** open views. Otherwise, only to views where `file.extension === ext`.

---

## CSP — Constraints and Solutions

Obsidian's CSP applies to all child frames and cannot be overridden from the iframe. Constraints:

| Resource | Blocked | Solution |
|----------|---------|----------|
| Dynamic `<link rel="stylesheet">` | Yes | CSS inlined in HTML + patch `appendChild` |
| `data:` for fonts | Yes | TTF copied at build, `app://` URL in CSS |
| `data:` for images | No (allowed in `img-src`) | `img-src data:` in iframe's `<meta>` CSP |
| Relative URLs `./vs` | Broken (timestamp) | Replaced with absolute `app://` URL |
| `file://` | Blocked by Electron | Blob URL as iframe `src` |
