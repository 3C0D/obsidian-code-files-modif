# Monaco Local Integration

## Summary

Replaced external iframe (`embeddable-monaco.lukasbach.com`) with local Monaco Editor bundle. Overcame CSP restrictions through blob URLs, CSS inlining, and asset patching.

## Migration Overview

### Before: External Iframe

- **External dependency** — `https://embeddable-monaco.lukasbach.com`
- **Internet required** — no offline functionality
- **Limited control** — external service constraints

### After: Local Integration

- **Local assets** — ~21.4MB bundle in plugin
- **Offline functionality** — no external dependencies
- **Full control** — custom themes, formatters, features

## Implementation Strategy

### 1. Asset Bundling

**Location:** `esbuild.config.ts`

```typescript
// Copy Monaco files at build
node_modules/monaco-editor/min/vs/ → {buildPath}/vs/
src/editor/monacoEditor.html → {buildPath}/monacoEditor.html
node_modules/monaco-themes/themes/ → {buildPath}/monaco-themes/
// + formatters, CSS, JS config files
```

### 2. CSP Workarounds

**Problem:** Obsidian's Content Security Policy blocks external resources in iframes

**Solutions:**

- **Blob URL + Base Href** — fetch HTML, inject `<base href>` pointing to plugin directory, inject via blob
- **Asset Inlining** — fetch all scripts/CSS in parallel, inline as base64 data URLs
- **Font Patching** — replace `data:` fonts with `app://` URLs
- **Dynamic Link Blocking** — intercept `appendChild` to block `<link>` tags

### 3. Asset Optimization

**Location:** `buildBlobUrl.ts`

**Parallel Fetching:** All assets fetched simultaneously on host side (not sequentially in iframe), eliminating 5-10s rebuild delays.

```typescript
// All assets fetched in parallel — avoids sequential iframe round-trips
const [cssText, prettierBase, bundleJs, ...] = await Promise.all([
    fetchText(`${urls.vsBase}/editor/editor.main.css`),
    fetchText(urls.prettierBase),
    fetchText(urls.bundleJsUrl),
    // ... all formatters
]);
```

**Base64 Inlining:** Scripts inlined as base64 to avoid HTML parsing conflicts.

```typescript
// Buffer.from().toString('base64') avoids HTML parser conflicts
const inlineScript = (text: string): string => {
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    return `(0,eval)(atob("${b64}"))`;
};
```

**Blob Caching:** Identical blob URL reused across editor instances, revoked only on plugin unload.

### 4. Path Resolution

**Location:** `buildBlobUrl.ts`

```typescript
// Derive base URL from HTML asset path (strips filename)
const baseUrl = urls.htmlUrl.replace(/[^/]+$/, '');
html = html.replace('<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n\t\t<base href="${baseUrl}" />`);
```

### Key Problems Solved

1. **Blocked Resources** — CSP blocks `<link>` and `data:` fonts
    - Solution: inline CSS + patch font URLs to `app://`
2. **Relative Path Timestamps** — `getResourcePath()` adds timestamps breaking `./vs/loader.js`
    - Solution: `<base href>` injection + absolute `app://` URLs
3. **Missing Icons** — Codicons font blocked by CSP
    - Solution: copy TTF file, patch CSS to use `app://` URL
4. **Sequential Asset Loading** — iframe fetches scripts sequentially, causing 5-10s delays after rebuilds
    - Solution: parallel fetching on host side + blob caching
5. **HTML Parser Conflicts** — inline scripts containing HTML literals confuse parser
    - Solution: base64 encoding with `(0,eval)(atob(...))`
6. **Message Order Issues** — `ready` emitted after editor creation caused race conditions
    - Solution: `setTimeout(0)` defers AMD require until all inline scripts executed
7. **Hotkey Synchronization** — Obsidian hotkey changes need to propagate to Monaco
    - Solution: dynamic hotkey detection via `broadcastHotkeys()` with editor reload for active view

## Architecture Components

- **mountCodeEditor/** — modular Monaco integration
  - **mountCodeEditor.ts** — main entry point, fetch HTML, patch paths, create blob URL, manage postMessage
  - **messageHandler.ts** — postMessage protocol handling (all message types)
  - **buildInitParams.ts** — initialization parameters builder (hotkeys, config, theme)
  - **projectLoader.ts** — TypeScript/JavaScript project file loading for IntelliSense
  - **assetUrls.ts** — asset path resolution (Monaco, themes, formatters)
  - **buildBlobUrl.ts** — blob URL creation with optimizations (parallel fetching, base64 inlining, caching)
- **monacoEditor.html** — load Monaco, formatters, handle messages, create editor
- **themeUtils.ts** — theme resolution and loading (moved from mountCodeEditor.ts)
- **Language System** — `staticMap` in `getLanguage.ts` maps 80+ extensions to Monaco language IDs; unknown → `plaintext`

## Asset Structure

```
plugin-folder/
├── vs/                    # Monaco Editor (12MB)
├── monaco-themes/         # 50+ themes (2MB)
├── formatters/           # Prettier + Mermaid + clang/ruff/gofmt (2MB)
├── monacoEditor.html     # Iframe HTML (minimal, scripts inlined)
├── iframe/config.ts      # Configuration
└── monacoHtml.css        # Styles (inlined at runtime)
```

## Communication Flow

```
1. mountCodeEditor() fetches HTML + all assets in parallel, inlines as base64, creates cached blob URL
2. iframe loads from blob, all scripts execute inline, Monaco initializes, emits 'ready'
3. Parent receives 'ready', sends 'init' (config, hotkeys) and 'change-value' (content)
4. iframe creates editor with config, displays content
5. Parent optionally sends 'load-project-files' (TS/JS files for IntelliSense)
```

**Performance Optimizations:**
- **Parallel Fetching** — all assets downloaded simultaneously on host side
- **Base64 Inlining** — zero HTML parser conflicts, instant execution
- **Blob Caching** — identical blob URL reused, no re-fetching per editor
- **Deferred AMD** — `setTimeout(0)` ensures proper initialization order

```

## Benefits Achieved

- **Complete offline** — no external dependencies
- **Full control** — custom themes, formatters, features
- **Excellent performance** — parallel fetching + caching = instant loads
- **Enhanced security** — no external iframe vulnerabilities
- **Extensibility** — can add custom Monaco features
- **Robust inlining** — base64 encoding prevents any HTML parser conflicts

## Technical Challenges

- **CSP restrictions** — required blob URL + base64 inlining
- **Asset management** — ~21.4MB of local files with parallel optimization
- **Path resolution** — `<base href>` injection for blob context
- **Font loading** — Codicons font CSP workarounds
- **HTML parser conflicts** — solved with base64 encoding
- **Loading order** — solved with `setTimeout(0)` deferred AMD
- **Cache invalidation** — timestamp-based blob cache management

## Key Insights

**Obsidian's CSP cannot be overridden from child frames.** All solutions must work within these constraints:

- `script-src 'self' app:`
- `style-src 'self' app: 'unsafe-inline'`
- `font-src 'self' app:`
- `img-src 'self' app: data:`

**Blob URLs provide isolation but no implicit base URL.** The `<base href>` injection is crucial for relative path resolution.

**HTML parsers are aggressive even in `<script>` tags.** Base64 encoding is the only reliable way to inline arbitrary JavaScript without parser conflicts.

**Parallel asset fetching dramatically improves rebuild performance.** Sequential iframe requests caused 5-10s delays; host-side parallel fetching reduces this to milliseconds.

---

**Revised:** ✓ (Performance optimizations: parallel fetching, base64 inlining, blob caching)
```
