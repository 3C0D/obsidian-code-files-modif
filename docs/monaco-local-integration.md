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

- **Blob URL** — fetch HTML, patch paths, inject via blob
- **CSS Inlining** — fetch Monaco CSS, inline in HTML
- **Font Patching** — replace `data:` fonts with `app://` URLs
- **Dynamic Link Blocking** — intercept `appendChild` to block `<link>` tags

### 3. Path Resolution

**Location:** `mountCodeEditor.ts`

```typescript
// Replace relative paths with absolute app:// URLs
const vsBase = getResourcePath(`${pluginBase}/vs`).replace(/\?.*$/, '');
html = html.replace("'./vs'", `'${vsBase}'`);

// Inline CSS to bypass CSP
const cssText = await fetch(`${vsBase}/editor/editor.main.css`);
html = html.replace('</head>', `<style>${cssText}</style></head>`);
```

### Key Problems Solved

1. **Blocked Resources** — CSP blocks `<link>` and `data:` fonts
    - Solution: inline CSS + patch font URLs to `app://`
2. **Relative Path Timestamps** — `getResourcePath()` adds timestamps breaking `./vs/loader.js`
    - Solution: strip timestamps, use absolute `app://` URLs
3. **Missing Icons** — Codicons font blocked by CSP
    - Solution: copy TTF file, patch CSS to use `app://` URL
4. **Message Order Issues** — `ready` emitted after editor creation caused race conditions
    - Solution: send `init` immediately after `ready`, before any content changes
5. **Hotkey Synchronization** — Obsidian hotkey changes need to propagate to Monaco
    - Solution: dynamic hotkey detection via `broadcastHotkeys()` with editor reload for active view

## Architecture Components

- **mountCodeEditor/** — modular Monaco integration
  - **mountCodeEditor.ts** — main entry point, fetch HTML, patch paths, create blob URL, manage postMessage
  - **messageHandler.ts** — postMessage protocol handling (all message types)
  - **buildInitParams.ts** — initialization parameters builder (hotkeys, config, theme)
  - **projectLoader.ts** — TypeScript/JavaScript project file loading for IntelliSense
  - **assetUrls.ts** — asset path resolution (Monaco, themes, formatters)
  - **buildBlobUrl.ts** — blob URL creation with CSP workarounds (CSS inlining, font patching)
- **monacoEditor.html** — load Monaco, formatters, handle messages, create editor
- **themeUtils.ts** — theme resolution and loading (moved from mountCodeEditor.ts)
- **Language System** — `staticMap` in `getLanguage.ts` maps 80+ extensions to Monaco language IDs; unknown → `plaintext`

## Asset Structure

```
plugin-folder/
├── vs/                    # Monaco Editor (12MB)
├── monaco-themes/         # 50+ themes (2MB)
├── formatters/           # Prettier + Mermaid (2MB)
├── monacoEditor.html     # Iframe HTML
├── iframe/config.ts      # Configuration
└── monacoHtml.css        # Styles
```

## Communication Flow

```
1. mountCodeEditor() fetches HTML, patches paths, creates blob URL
2. iframe loads, Monaco initializes, emits 'ready'
3. Parent receives 'ready', sends 'init' (config, hotkeys) and 'change-value' (content)
4. iframe creates editor with config, displays content
5. Parent optionally sends 'load-project-files' (TS/JS files for IntelliSense)
```

1. mountCodeEditor() fetches HTML, patches paths, creates blob URL
2. iframe loads, Monaco initializes, emits 'ready'
3. Parent receives 'ready', sends 'init' (config, hotkeys) and 'change-value' (content)
4. iframe creates editor with config, displays content
5. Parent optionally sends 'load-project-files' (TS/JS files for IntelliSense)

```

## Benefits Achieved

- **Complete offline** — no external dependencies
- **Full control** — custom themes, formatters, features
- **Better performance** — local assets, no network requests
- **Enhanced security** — no external iframe vulnerabilities
- **Extensibility** — can add custom Monaco features

## Technical Challenges

- **CSP restrictions** — required blob URL + CSS inlining
- **Asset management** — ~21.4MB of local files
- **Path resolution** — timestamp handling, relative → absolute
- **Font loading** — Codicons font CSP workarounds
- **Message coordination** — proper initialization sequence

## Key Insight

**Obsidian's CSP cannot be overridden from child frames.** All solutions must work within these constraints:

- `script-src 'self' app:`
- `style-src 'self' app: 'unsafe-inline'`
- `font-src 'self' app:`
- `img-src 'self' app: data:`

The blob URL approach bypasses most restrictions while maintaining security.

---

**Revised:** ✓
```
