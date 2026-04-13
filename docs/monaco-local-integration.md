# Local Monaco Editor Integration in Obsidian Plugin

## Context

The plugin initially used `https://embeddable-monaco.lukasbach.com` to load Monaco in an iframe. The goal was to replace this external dependency with a local version embedded in the plugin.

---

## What We Implemented

### 1. Install Monaco

```bash
yarn add -D monaco-editor
```

### 2. Create `src/editor/monacoEditor.html`

Minimal HTML page that loads Monaco from `./vs/loader.js`, emits `ready` when Monaco is ready, and communicates via `postMessage`.

### 3. Copy Monaco files at build time (`scripts/esbuild.config.ts`)

- `node_modules/monaco-editor/min/vs/` → `{buildPath}/vs/`
- `src/editor/monacoEditor.html` → `{buildPath}/monacoEditor.html`
- `src/editor/monacoHtml.js` → `{buildPath}/monacoHtml.js`
- `src/editor/monacoHtml.css` → `{buildPath}/monacoHtml.css`
- `node_modules/monaco-themes/themes/` → `{buildPath}/monaco-themes/`
- Prettier and Mermaid formatters → `{buildPath}/formatters/`

These files are in `.gitignore` (`vs/`, `monacoEditor.html`, `monacoHtml.js`, `monacoHtml.css`, `monaco-themes/`, `formatters/` at the root).

### 4. Modify `mountCodeEditor.ts`

Parameters that were in the query string of the external URL now pass via `postMessage` (`init`).

### 5. Replace static language list with dynamic map

Monaco is local, so we can query `monaco.languages.getLanguages()` from the iframe and build the extension → language map dynamically. This avoids maintaining a manual list and automatically covers all Monaco languages.

The map is **persisted in `data.json`** of the plugin to be available at next startup, even before an editor is opened.

---

## Problems Encountered

### Problem 1 — `loader.js` blocked, broken paths

**Attempt:** use `getResourcePath()` directly as iframe `src`.

**Error:** `getResourcePath` adds a timestamp (`?1775...`) at the end. Relative paths `./vs/loader.js` resolve to `vs?timestamp/loader.js` — invalid.

**Attempt:** use `file://` via `adapter.getBasePath()`.

**Error:** Electron blocks `file://` URLs in iframes.

**Solution:** fetch HTML via `getResourcePath`, replace `./vs` paths with absolute `app://` URL (timestamp removed with `.replace(/\?.*$/, '')`), inject via **blob URL**.

```typescript
const htmlUrl = plugin.app.vault.adapter.getResourcePath(`${pluginBase}/monacoEditor.html`);
const vsBase = plugin.app.vault.adapter.getResourcePath(`${pluginBase}/vs`).replace(/\?.*$/, '');

let html = await (await fetch(htmlUrl)).text();
html = html
    .replace("'./vs'", `'${vsBase}'`)
    .replace('"./vs/loader.js"', `"${vsBase}/loader.js"`);

const blob = new Blob([html], { type: 'text/html' });
iframe.src = URL.createObjectURL(blob);
```

The blob URL is revoked in `destroy()`.

---

### Problem 2 — Monaco CSS blocked by Obsidian's CSP

**Error:** Monaco dynamically injects a `<link rel="stylesheet">`. Obsidian's CSP blocks it.

**Attempt:** add `<meta http-equiv="Content-Security-Policy">` in the iframe HTML.

**Error:** the parent's CSP (Obsidian) applies to child frames and overrides the `<meta>`. Cannot override from the iframe.

**Solution:** inline Monaco CSS in the HTML before creating the blob URL, and intercept `appendChild` to block `<link>` tags that Monaco tries to inject later.

```typescript
const cssText = await (await fetch(`${vsBase}/editor/editor.main.css`)).text();
html = html.replace('</head>', `<style>${cssText}</style>
<script>
const _orig = Element.prototype.appendChild;
Element.prototype.appendChild = function(node) {
    if (node.tagName === 'LINK' && node.rel === 'stylesheet') return node;
    return _orig.call(this, node);
};
</script>
</head>`);
```

---

### Problem 3 — Fonts blocked by CSP

**Error:** Monaco CSS contains `@font-face` with fonts in `data:font/ttf;base64,...`. Obsidian's CSP blocks `data:` for fonts.

**Attempt:** replace `data:` with blob URLs.

**Error:** `blob:app://...` is also blocked by the same CSP.

**Attempt:** replace with absolute `app://` URLs.

**Error:** Monaco fonts are already inline as `data:` in the CSS, there are no separate `.ttf` files to reference.

**Solution:** remove `@font-face` from CSS. Monaco falls back to system fonts (monospace), which is functional for a code editor.

```typescript
cssText = cssText.replace(/@font-face\s*\{[^}]*\}/g, '');
```

---

### Problem 4 — Error decoration SVGs blocked by CSP

**Error:** Monaco loads its squiggles (red waves under errors) via inline SVG in `data:image/svg+xml`. CSP blocks `data:` for images.

**Solution:** add `data:` to `img-src` in the CSP `<meta>` of the HTML. Unlike fonts and stylesheets, `img-src` is not overridden by the parent CSP for inline content of a blob URL.

```html
<meta http-equiv="Content-Security-Policy" content="... img-src 'self' app: data:; ..." />
```

---

### Problem 5 — Empty editor, wrong message order

**Error:** the editor appeared empty.

**Cause:** `ready` was emitted inside `applyParams` (after editor creation). The flow was broken:

1. Monaco loads → waits for a message (no `ready` yet)
2. Parent sends `init` → `applyParams` creates editor → emits `ready`
3. Parent receives `ready` → sends `init` + `change-value` again
4. `applyParams` is called again → error "Element already has context attribute"

**Solution:** emit `ready` immediately after Monaco loads, before any message. Correct flow:

1. Monaco loads → emits `ready`
2. Parent receives `ready` → sends `init` (params) + `get-languages` + `change-value` (content)
3. HTML receives `init` → creates editor
4. HTML receives `get-languages` → responds with extension → language map
5. HTML receives `change-value` → fills editor

---

### Problem 6 — "Element already has context attribute" on modal

**Cause:** `applyParams` could be called twice if messages arrived in wrong order.

**Solution:** `initialized` flag in HTML.

```javascript
var initialized = false;

function applyParams(params) {
    if (initialized) return;
    initialized = true;
    // ...
}
```

---

### Problem 7 — No syntax highlighting at restart

**Cause:** dynamic map is empty at startup. It's only filled when a Monaco editor is opened. If Obsidian reopens files at startup, `getLanguage()` returns `'plaintext'`.

**Solution in two parts:**

1. **Static list as fallback** — covers common languages immediately, before Monaco is loaded.

2. **Persist dynamic map** — at first startup with an editor open, the Monaco map is saved in `data.json`. At subsequent startups, it's reloaded before an editor is even opened.

```typescript
// In main.ts — onload()
await loadPersistedLanguages(this);

// In mountCodeEditor.ts — case 'languages'
await registerAndPersistLanguages(data.langs, plugin);
// registerAndPersistLanguages is a no-op if dynamicMap is already filled (single persistence per session)
```

Resolution priority: `dynamicMap` (Monaco) > `staticMap` (fallback) > `'plaintext'`.

---

## Final Architecture

### `mountCodeEditor.ts`

- `async` function (fetch HTML and CSS)
- Builds `initParams` with all configuration parameters
- Fetches HTML, replaces `./vs` with absolute `app://` URL
- Fetches Monaco CSS, removes `@font-face`, injects inline in HTML
- Intercepts `appendChild` to block dynamic `<link>` tags from Monaco
- Creates blob URL for iframe, revoked in `destroy()`
- On `ready` → sends `init` + `get-languages` + `change-value`
- On `languages` → registers and persists map (once per session)
- On `change` → filters by `codeContext` to only listen to its own iframe

### `monacoEditor.html`

- Loads Monaco via `./vs/loader.js` (replaced by `app://` URL before injection)
- Loads formatters via `./formatters/*.js` (replaced by `app://` URLs before injection)
- Loads configuration via `./monacoHtml.js` (replaced by `app://` URL before injection)
- Emits `ready` as soon as Monaco is loaded
- On `init` → creates editor (once thanks to `initialized` flag)
- On `get-languages` → returns complete map `[extension, languageId][]`
- On `change-value` → updates content
- Emits `change` with `context` on each user modification

### `getLanguage.ts`

- `staticMap` — immediate fallback for common languages
- `dynamicMap` — complete map from Monaco, persisted between sessions
- `loadPersistedLanguages` — called at plugin startup
- `registerAndPersistLanguages` — called on Monaco map reception, no-op if already filled

---

## Lifecycle Management

`mountCodeEditor` returns a control object (`iframe`, `getValue`, `setValue`, `clear`, `destroy`, `send`). The `window.addEventListener('message', onMessage)` remains active as long as the editor is open — `destroy()` must remove it via `removeEventListener`, otherwise memory leaks accumulate if dozens of editors are created and destroyed during a session.

The `codeContext` identifies each instance: if multiple Monaco iframes are open simultaneously (a file + a fence modal for example), they all send `change` on the same `window`. The `codeContext` allows listening only to messages from its own iframe.

---

## Problem 9 — False save on file open

**Symptom:** simply opening a file marked it as modified on disk, alarming sync services (Obsidian Sync, iCloud, Dropbox) that saw a phantom modification.

**Cause:** in `codeEditorView.ts`, `onLoadFile` injected file content into Monaco via `setValue`. Monaco then triggered its `onDidChangeModelContent` event, which the plugin blindly listened to to call `requestSave()`. Result: open = unnecessary disk write.

**Solution:** in the `change` handler of `mountCodeEditor.ts`, ignore the message if the received content is identical to the current value. The file is never saved to disk just by opening it.

```typescript
case 'change':
    if (data.context === codeContext && value !== data.value) {
        value = data.value;
        onChange?.();
    }
```

---

## Problem 10 — Double extension on tab rename (`.js` → `.js.js`)

**Symptom:** clicking on a Monaco tab title silently triggered a file rename, adding the extension twice (`test.js` → `test.js.js`).

**Cause:** `getDisplayText()` in `CodeEditorView` returned `file.name` (full name with extension) instead of `file.basename` (without extension). When the user clicked on the tab title, Obsidian entered rename mode by initializing its text box with `test.js`. On validation, Obsidian automatically added the extension — giving `test.js.js`.

**Solution:** use `file.basename` in `getDisplayText()`, conforming to Obsidian convention.

---

## Problem 11 — Rename extension from Monaco: reload not triggered after first rename

**Symptom:** the first rename via Monaco context menu worked, but subsequent ones no longer reloaded the view. Monaco remained stuck with the old `codeContext` (e.g. `script.py`) while the file was now called `script.js`. Subsequent `postMessage` messages were silently ignored.

**Cause:** the old approach forced `openLeaf.openFile()` from `RenameExtensionModal`. Obsidian optimized by refusing to reload a tab it considered already open on the same `TFile` object. The Monaco view therefore kept its old `codeContext`, making the modal inaccessible on the second call.

**Solution in two parts:**

1. **Native rename interception in `CodeEditorView`** — implementation of `onRename(file: TFile)` that destroys the old iframe and mounts a new one with the correct language and `codeContext`:

```typescript
async onRename(file: TFile): Promise<void> {
    super.onRename(file);
    this.codeEditor?.destroy();
    this.contentEl.empty();
    this.codeEditor = await mountCodeEditor(
        this.plugin,
        getLanguage(file.extension),
        this.data,
        this.getContext(file),
        () => this.requestSave()
    );
    this.contentEl.append(this.codeEditor.iframe);
}
```

2. **Simplification of `RenameExtensionModal`** — removal of now-unnecessary `openLeaf.openFile()` logic. The view manages itself via `onRename`.

3. **Restoration of `iframe.focus()`** in the `onClose` monkey-patch of `mountCodeEditor` — necessary for the cancel case (cross): if the user closes the modal without validating, focus is gracefully returned to the Monaco iframe.

**Error:** when closing `ChooseThemeModal`, `RenameExtensionModal` and `FormatterConfigModal` (opened via Monaco context menu), Obsidian crashed with:

```
Uncaught TypeError: n.instanceOf is not a function
    at e.close (app.js:1:1079118)
```

**Cause:** Obsidian saves `document.activeElement` when opening a modal to restore focus on close. When the modal is opened from the Monaco iframe, the captured active element is an internal iframe element (Monaco's hidden `<textarea>`). On close, Obsidian tries to validate this element's type with `element.instanceOf(HTMLElement)` — a method that Obsidian injects globally on `Node.prototype`. But iframe elements don't inherit this patch (isolated document), so `instanceOf` doesn't exist and the minified code crashes.

**Solution:** before opening the modal, force blur of the active element with `(document.activeElement as HTMLElement)?.blur()`. Focus falls back to Obsidian's `body` which has `instanceOf`. Then monkey-patch `modal.onClose` to manually restore focus on the iframe after close:

```typescript
(document.activeElement as HTMLElement)?.blur();
const modal = new ChooseThemeModal(plugin, callback);
const origOnClose = modal.onClose.bind(modal);
modal.onClose = () => {
    origOnClose();
    iframe.focus();
};
modal.open();
```

This bypasses the fatal `instanceOf` while preserving user experience.

---

## Custom Monaco Themes Integration

**Context:** the `themes.ts` list contained ~50 theme names (Dracula, Monokai, Nord, etc.) but none were defined — Monaco silently ignored them and fell back to `vs-dark`.

**Solution:** installation of `monaco-themes` package which provides JSON definitions of all these themes. At build, esbuild copies `node_modules/monaco-themes/themes/` → `{buildPath}/monaco-themes/`. When loading a custom theme:

1. Fetch JSON via `app://`: `getResourcePath(${pluginBase}/monaco-themes/${theme}.json)`
2. Send stringified JSON in `initParams.themeData`
3. In `monacoEditor.html`, call `monaco.editor.defineTheme(theme, JSON.parse(themeData))` before `monaco.editor.create()`

On-the-fly theme change (via Monaco context menu) follows the same flow: fetch JSON, send via `change-theme`, call `defineTheme` then `monaco.editor.setTheme()`.

---

## Problem 12 — Missing Codicons icons (search bar, menus)

**Symptom:** Monaco's internal UI icons (Ctrl+F bar buttons, context menu icons, etc.) display as empty squares.

**Cause:** Monaco uses the **Codicons** font (VS Code's icon font) declared via `@font-face` in `editor.main.css`. In the `monaco-editor/min` package, this font is base64-encoded directly in the CSS. Obsidian's CSP blocks `data:` for fonts in child frames — the font never loads.

Additionally, the `monaco-editor/min/vs` folder (copied at build) doesn't contain a separate `.ttf` file — the font is only inline in the CSS.

**Solution in two parts:**

1. **Copy TTF at build** — the `codicon.ttf` file exists in `monaco-editor/esm/`. We add it in the build script to copy it to `vs/editor/`:

```typescript
// In esbuild.config.ts, after Monaco cp
const codiconSrc = path.join(pluginDir, 'node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.ttf');
const codiconTarget = path.join(buildPath, 'vs/editor/codicon.ttf');
await copyFile(codiconSrc, codiconTarget);
```

2. **Patch URL in CSS** — instead of removing `@font-face`, we replace the base64 URL with the absolute `app://` URL to the copied TTF:

```typescript
// In mountCodeEditor.ts, instead of replace @font-face
const codiconFontUrl = `${vsBase}/editor/codicon.ttf`;
cssText = cssText.replace(
    /(@font-face\s*\{[^}]*src:[^;]*)(url\([^)]+\)\s*format\(["']truetype["']\))/g,
    `$1url('${codiconFontUrl}') format('truetype')`
);
```

`app://` is allowed by `default-src` in the iframe's CSP, so the font loads without error.

---

## Adding External Configuration Files for Monaco HTML

**Context:** To keep Monaco HTML configuration maintainable, CSS styles and JavaScript variables can be externalized into separate files instead of being hardcoded in `monacoEditor.html`.

**Files created:**
- `src/editor/monacoHtml.css` — CSS styles for diff modal (overlay, toolbar, buttons, container)
- `src/editor/monacoHtml.js` — JavaScript configuration variables (diff editor options, timeouts, Prettier settings)

**Build process (esbuild.config.ts):**

These files must be copied to the build directory alongside Monaco files:

```typescript
const configJsSrc = path.join(pluginDir, 'src/editor/monacoHtml.js');
const configJsTarget = path.join(buildPath, 'monacoHtml.js');
const configCssSrc = path.join(pluginDir, 'src/editor/monacoHtml.css');
const configCssTarget = path.join(buildPath, 'monacoHtml.css');

await copyFile(configJsSrc, configJsTarget);
await copyFile(configCssSrc, configCssTarget);
```

**Loading process (monacoEditor.html):**

The files are loaded directly in the HTML:

```html
<!-- Configuration files -->
<link rel="stylesheet" href="./monacoHtml.css" />
<script src="./monacoHtml.js"></script>
```

The `./` paths are resolved to `app://` URLs by the iframe's base URL patching in `mountCodeEditor.ts`.

**Why this approach:**
- JavaScript files can be loaded externally via `<script src>` (CSP allows `app://` URLs)
- CSS files must be inlined because Obsidian's CSP blocks external `<link rel="stylesheet">` in child frames
- Both files remain in `src/editor/` for easy editing and version control
- The build process automatically copies them

**Note:** In `mountCodeEditor.ts`, the CSS is fetched and inlined, while the JS is loaded as an external script.

---

## Prettier and Mermaid Formatters Integration

**Context:** To support formatting for multiple languages, Prettier and Mermaid formatters are loaded in the Monaco iframe.

**Files structure:**
- All formatter files are copied to `{buildPath}/formatters/` directory at build time
- Includes: `prettier-standalone.js`, `prettier-markdown.js`, `prettier-estree.js`, `prettier-typescript.js`, `prettier-babel.js`, `prettier-postcss.js`, `prettier-html.js`, `prettier-yaml.js`, `prettier-graphql.js`, `mermaid-formatter.js`

**Loading process (monacoEditor.html):**

```html
<!-- Step 2.5: load Prettier and Mermaid formatters -->
<script src="./formatters/prettier-standalone.js"></script>
<script src="./formatters/prettier-markdown.js"></script>
<script src="./formatters/prettier-estree.js"></script>
<script src="./formatters/prettier-typescript.js"></script>
<script src="./formatters/prettier-babel.js"></script>
<script src="./formatters/prettier-postcss.js"></script>
<script src="./formatters/prettier-html.js"></script>
<script src="./formatters/prettier-yaml.js"></script>
<script src="./formatters/prettier-graphql.js"></script>
<script src="./formatters/mermaid-formatter.js"></script>
```

The `./formatters/` paths are resolved to `app://` URLs by the iframe's base URL patching in `mountCodeEditor.ts`.

**Exposed globals:**
- `window.prettier` — Prettier API
- `window.prettierPlugins.markdown` — Markdown parser
- `window.prettierPlugins.estree` — ESTree plugin (required for TypeScript/JavaScript/JSON)
- `window.prettierPlugins.typescript` — TypeScript parser
- `window.prettierPlugins.babel` — Babel parser (JavaScript/JSX)
- `window.prettierPlugins.postcss` — PostCSS plugin (CSS/SCSS/Less)
- `window.prettierPlugins.html` — HTML parser
- `window.prettierPlugins.yaml` — YAML parser
- `window.prettierPlugins.graphql` — GraphQL parser
- `window.mermaidFormatter` — Mermaid formatter

---

## Key Takeaways

The main constraint is **Obsidian's CSP** which applies to all child frames and cannot be overridden. It allows `app:` and `'self'` but blocks `data:` and `blob:` for fonts, and external stylesheets.

The solution that bypasses all this:

1. Load HTML via `fetch` (the `app://` URL with timestamp works for fetch)
2. Replace relative paths `./vs` with absolute `app://` URL (without timestamp)
3. Inline Monaco CSS in HTML (avoids blocked `<link>`)
4. Patch `@font-face` to use `app://` URL for Codicons font
5. Inject via blob URL (the blob iframe is not subject to parent's CSP for its own inline content)
6. Allow `data:` only for `img-src` (necessary for Monaco error decorations)
7. Load formatters from `./formatters/` directory (resolved to `app://` URLs)
