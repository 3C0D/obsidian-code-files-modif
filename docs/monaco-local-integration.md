# Monaco Local Integration

## Summary
Replaced external iframe (`embeddable-monaco.lukasbach.com`) with local Monaco Editor bundle. Overcame CSP restrictions through blob URLs, CSS inlining, and asset patching.

## Migration Overview

### Before: External Iframe
- **External dependency** — `https://embeddable-monaco.lukasbach.com`
- **Internet required** — no offline functionality
- **Limited control** — external service constraints

### After: Local Integration
- **Local assets** — 17.5MB bundle in plugin
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

## Key Problems Solved

### 1. Blocked Resources
**Problem:** CSP blocks `<link rel="stylesheet">` and `data:` fonts
**Solution:** Inline CSS + patch font URLs to `app://`

### 2. Relative Path Timestamps
**Problem:** `getResourcePath()` adds timestamps, breaking `./vs/loader.js`
**Solution:** Strip timestamps, use absolute `app://` URLs

### 3. Missing Icons
**Problem:** Codicons font blocked by CSP
**Solution:** Copy TTF file, patch CSS to use `app://` URL

### 4. Dynamic Language Map
**Problem:** Static language list outdated
**Solution:** Query `monaco.languages.getLanguages()`, persist in `data.json`

### 5. Message Order Issues
**Problem:** `ready` emitted after editor creation caused race conditions
**Solution:** Emit `ready` immediately after Monaco loads

## Architecture Components

### mountCodeEditor.ts
- **Fetches HTML** via `app://` URL
- **Patches paths** from relative to absolute
- **Inlines CSS** to bypass CSP
- **Creates blob URL** for iframe
- **Manages postMessage** communication

### monacoEditor.html
- **Loads Monaco** from local `./vs/loader.js`
- **Loads formatters** from `./formatters/`
- **Emits ready** when Monaco loaded
- **Handles messages** for configuration

### Language System
- **Static fallback** — common extensions immediately available
- **Dynamic map** — complete Monaco language list
- **Persistence** — saved in `data.json` for startup

## Asset Structure
```
plugin-folder/
├── vs/                    # Monaco Editor (12MB)
├── monaco-themes/         # 50+ themes (2MB)
├── formatters/           # Prettier + Mermaid (2MB)
├── monacoEditor.html     # Iframe HTML
├── monacoHtml.js         # Configuration
└── monacoHtml.css        # Styles
```

## Communication Flow
```
1. mountCodeEditor() fetches HTML, patches paths
2. Creates blob URL → iframe loads
3. Monaco loads → emits 'ready'
4. Parent sends 'init' + 'get-languages' + 'change-value'
5. iframe creates editor, returns language map, displays content
```

## Benefits Achieved
- **Complete offline** — no external dependencies
- **Full control** — custom themes, formatters, features
- **Better performance** — local assets, no network requests
- **Enhanced security** — no external iframe vulnerabilities
- **Extensibility** — can add custom Monaco features

## Technical Challenges
- **CSP restrictions** — required blob URL + CSS inlining
- **Asset management** — 17.5MB of local files
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