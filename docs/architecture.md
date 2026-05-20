# Plugin Architecture

## Summary
Code Files is an Obsidian plugin that embeds a Monaco Editor (the VS Code engine) inside Obsidian to edit code files with full IDE features. The key architectural challenge is running Monaco inside a sandboxed iframe while communicating bidirectionally with the Obsidian host.

## High-Level Module Map

```
src/
├── main.ts                        → Plugin entry: lifecycle, patches, event registration
├── editor/
│   ├── codeEditorView/            → Obsidian TextFileView subclass (per-tab lifecycle)
│   │   ├── index.ts              → CodeEditorView: load/unload/save, state management
│   │   ├── editorOpeners.ts      → Open files in Monaco leaves (new tab, reuse, position)
│   │   ├── editorModals.ts       → Modal triggers (theme picker, rename, settings gear)
│   │   ├── headerActions.ts      → Tab header action buttons (format diff, return arrow)
│   │   └── headerBadges.ts       → Tab header badges (unregistered ext, project root)
│   ├── mountCodeEditor/           → Iframe bridge layer (one instance per open file)
│   │   ├── index.ts              → Re-exports, cleanupAllConsoles, revokeBlobUrlCache
│   │   ├── mountCodeEditor.ts    → Creates iframe, wires message handler, returns API
│   │   ├── buildBlobUrl.ts       → Fetches assets, inlines CSS/scripts, creates blob: URL
│   │   ├── buildInitParams.ts    → Resolves editor options, hotkeys, theme for init message
│   │   ├── messageHandler.ts     → Central postMessage dispatcher (parent side)
│   │   ├── consoleHandler.ts     → Console process management (spawn, kill, stdin/stdout)
│   │   ├── projectLoader.ts      → Loads project files for cross-file IntelliSense
│   │   └── assetUrls.ts          → Resolves app:// URLs for all Monaco/formatter assets
│   ├── iframe/                    → Code running INSIDE the Monaco iframe (bundled as IIFE)
│   │   ├── init.ts               → Editor creation, message listener, applyParams
│   │   ├── actions.ts            → Context menu actions, hotkey registration
│   │   ├── formatters.ts         → Prettier/Mermaid/Clang/Ruff/Gofmt formatter providers
│   │   ├── diff.ts               → Diff modal, revert widget
│   │   ├── console.ts            → Console pane UI (input, output, resize, history)
│   │   ├── keybindingUtils.ts    → Hotkey conversion (Obsidian format → Monaco keybinding)
│   │   ├── utils.ts              → Shared utilities (throttle, getParentOrigin)
│   │   └── types/                → TypeScript declarations for iframe globals
│   └── monacoMain.ts             → IIFE bundle entry point for all iframe code
├── modals/                        → Various picker/creation modals
├── ui/                            → Settings tab, commands, context menus, ribbon icon
├── utils/                         → Shared utilities
│   ├── hiddenFiles/              → Dotfile visibility system (8 modules)
│   ├── broadcast.ts              → Broadcast config/hotkey changes to all open views
│   ├── explorerUtils.ts          → File explorer badges and project root highlight
│   ├── extensionUtils.ts         → Extension registration (add/remove from Obsidian)
│   ├── hotkeyUtils.ts            → Hotkey reading, parsing, serialization
│   ├── fileUtils.ts              → Path utilities, extension detection, vault base path
│   ├── settingsUtils.ts          → Settings load/save, editorConfig parsing
│   └── ...                       → Other utility modules
└── types/                         → Shared TypeScript interfaces and constants
```

## The Iframe Boundary

Monaco Editor cannot run directly in Obsidian's DOM due to:
1. **CSP restrictions**: Obsidian blocks external scripts, `data:` fonts, and dynamic `<link>` insertions in child frames
2. **AMD loader conflict**: Monaco uses its own `require()` which would conflict with Obsidian's module system
3. **Isolation**: Monaco's global state (models, workers) must be scoped per-editor without polluting Obsidian

**Solution:** A `blob:` URL iframe.

### Blob URL Construction (`buildBlobUrl.ts`)
1. Fetch `monacoEditor.html` from `app://` (Obsidian's local protocol)
2. Inject `<base href>` so Monaco's AMD loader resolves `vs/` paths
3. Fetch all assets in parallel (Monaco CSS, Prettier plugins, formatters, bundle)
4. Inline Monaco CSS as `<style>` (CSP blocks `<link>` in iframes)
5. Patch `@font-face` to use `app://` URL for codicon font (CSP blocks `data:` fonts)
6. Monkey-patch `appendChild` to silently drop dynamic `<link>` insertions
7. Encode each script as base64 → inject via `(0,eval)(atob(...))` (avoids `</script>` parsing issues)
8. Wrap in a `Blob` → `URL.createObjectURL()` → set as iframe `src`
9. Cache the blob URL for the plugin session (invalidated on rebuild)

### Communication Protocol

All communication between parent (Obsidian) and iframe (Monaco) uses `postMessage`. The two directions work differently:

**Parent → Iframe** (via the `send()` function in `mountCodeEditor.ts`):
```ts
const send = (type, payload) => {
  iframe.contentWindow?.postMessage({ type, ...payload }, '*');
};
```
Uses `'*'` as target origin because the iframe is loaded from a `blob:` URL which has no stable origin. The parent calls `send('init', ...)`, `send('change-value', ...)`, `send('change-theme', ...)`, etc.

**Iframe → Parent** (from inside the iframe, e.g., `init.ts`, `console.ts`):
```ts
window.parent.postMessage({ type: 'ready' }, getParentOrigin());
window.parent.postMessage({ type: 'change', value, context }, getParentOrigin());
```
Uses the captured parent origin (set during the `init` handshake). The `context` field is always the vault-relative file path, used to route messages to the correct editor instance when multiple files are open.

**Parent listens** via `win.addEventListener('message', onMessage)` on the iframe's `contentWindow`. The `onMessage` handler in `messageHandler.ts` receives all messages FROM the iframe and dispatches them (spawn process, save settings, trigger navigation, etc.).

**Security:** The parent message handler checks `event.source === iframe.contentWindow` to ignore messages from other iframes.

## CodeEditorView Lifecycle

**File:** `src/editor/codeEditorView/index.ts`

`CodeEditorView extends TextFileView` — one instance per open file tab.

### Opening a File
```
Obsidian calls onLoadFile(file)
  → mount code editor (create iframe, build blob URL, wire message handler)
  → iframe sends 'ready' message
  → parent sends 'init' (params) + 'change-value' (file content)
  → resolveReady() fulfills the ready promise
  → if position requested: send 'scroll-to-position'
```

### Saving
```
User presses Ctrl+S → iframe sends 'save-document'
  → parent messageHandler calls onSave()
  → CodeEditorView.save() writes via vault.modify() or adapter.write()
```

### Closing
```
Obsidian calls onUnloadFile()
  → messageHandler.cleanup() kills processes, removes patches, removes drag overlay
  → iframe.remove()
  → revokeBlobUrlCache() if last editor
  → cleanupTemporaryReveal() for dotfiles
```

## Ready Mechanism

Each mounted editor exposes a `ready: Promise<void>` that resolves when the iframe Monaco instance has fully initialized. This allows callers (e.g., `openInMonacoLeaf`) to await readiness before sending commands like `scroll-to-position`, eliminating hardcoded timeouts.

**Flow:**
```
mountCodeEditor() creates a Promise
  → iframe loads, Monaco initializes
  → iframe sends { type: 'ready' }
  → parent handler calls resolveReady()
  → await editor.ready resolves
  → safe to send commands
```

## Plugin Startup Sequence

```
onload()
  ├─ loadSettings()
  ├─ ensureDetectAllExtensions()       → enables "show unsupported files" in Obsidian
  ├─ patchModalOpen()                  → fixes iframe focus crash on modal open
  ├─ patchOpenFile()                   → intercepts file opens to route to Monaco
  ├─ patchMenuOverlay()                → adds file-type indicator to context menus
  ├─ serializeMonacoHotkeys()          → snapshot for change detection
  ├─ registerView(viewType, factory)   → registers CodeEditorView
  ├─ initExtensions()                  → registers file extensions with Obsidian
  ├─ addRibbonIcon, registerCommands, registerContextMenus, addSettingTab
  ├─ onLayoutReady (async):
  │   ├─ cleanStaleRevealedFiles()     → prune settings of deleted files
  │   ├─ verify projectRootFolder exists
  │   ├─ restoreRevealedFiles()        → re-reveal for workspace restore
  │   ├─ syncAutoRevealedDotfiles()    → reveal dotfiles for registered extensions
  │   └─ decorateFolders()             → eye badges on folders
  ├─ setupExplorerBadges()             → MutationObserver for extension badges
  ├─ patchAdapter() + patchRegisterExtensions()  → hidden files system
  └─ register vault events (create/delete/rename → decorateFolders, tsconfig → broadcastProjectFiles)
```

---

**Revised:** ✓
