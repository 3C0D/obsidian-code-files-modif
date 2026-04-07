# Prettier Markdown Formatting

This document explains how Prettier-based markdown formatting was integrated into the Code Files plugin.

## Overview

Markdown files opened in Monaco can now be formatted using Prettier via:
- **Shift+Alt+F** keyboard shortcut
- **Format Document** action in the context menu (F1 or right-click)
- **formatOnSave** option in Editor Config (formats automatically on Ctrl+S)

## Why Prettier?

Monaco Editor doesn't include a built-in markdown formatter. Prettier is the industry-standard formatter for markdown and many other languages, providing consistent, opinionated formatting.

## Implementation Challenges

### Challenge 1: CSP Restrictions

Obsidian's Content Security Policy (CSP) blocks external scripts in iframes. Loading Prettier from a CDN would fail with:
```
Refused to load the script 'https://cdn.../prettier.js' because it violates the following Content Security Policy directive: "script-src 'self' app:"
```

**Solution:** Load Prettier locally via `app://` URLs, just like Monaco itself.

### Challenge 2: Node.js vs Browser Environment

Prettier's Node.js version uses filesystem APIs that don't work in Obsidian's environment. Attempting to import it in TypeScript causes:
```
TypeError: The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined
```

**Solution:** Use Prettier's **standalone browser builds** (`standalone.js` and `plugins/markdown.js`), which are self-contained UMD modules designed for browser environments.

### Challenge 3: esbuild Bundling

Initially, we tried importing Prettier in TypeScript and letting esbuild bundle it. This failed because:
- Prettier's dynamic imports don't resolve correctly through esbuild
- The bundled code still tried to access Node.js APIs

**Solution:** Don't bundle Prettier. Instead, copy the standalone files directly and load them as external scripts in the iframe.

## Architecture

### 1. Build Step (`esbuild.config.ts`)

The `copy-to-plugins-folder` plugin copies Prettier files during build:

```typescript
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/standalone.js'),
    path.join(buildPath, 'prettier-standalone.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/markdown.js'),
    path.join(buildPath, 'prettier-markdown.js')
);
```

This places `prettier-standalone.js` and `prettier-markdown.js` alongside `main.js` in the plugin folder.

### 2. Script Injection (`mountCodeEditor.ts`)

When creating the Monaco iframe, we:

1. Resolve `app://` URLs for the Prettier files:
```typescript
const prettierBase = plugin.app.vault.adapter
    .getResourcePath(`${pluginBase}/prettier-standalone.js`)
    .replace(/\?.*$/, '');
const prettierMarkdownUrl = plugin.app.vault.adapter
    .getResourcePath(`${pluginBase}/prettier-markdown.js`)
    .replace(/\?.*$/, '');
```

2. Inject them as `<script>` tags in the iframe HTML before `</head>`:
```typescript
html = html.replace(
    '</head>',
    `<script src="${prettierBase}"></script>
<script src="${prettierMarkdownUrl}"></script>
</head>`
);
```

The UMD builds expose globals:
- `window.prettier` — the Prettier API
- `window.prettierPlugins.markdown` — the markdown parser plugin

### 3. Formatter Registration (`monacoEditor.html`)

After creating the Monaco editor, we register a `DocumentFormattingEditProvider` for markdown:

```javascript
monaco.languages.registerDocumentFormattingEditProvider('markdown', {
    provideDocumentFormattingEdits: async function(model) {
        try {
            var formatted = await prettier.format(model.getValue(), {
                parser: 'markdown',
                plugins: [prettierPlugins.markdown],
                proseWrap: 'always',
                printWidth: 80
            });
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier format failed', e);
            return [];
        }
    }
});
```

**Key points:**
- `prettier.format()` is **async** in v3, so we use `async/await`
- The function returns an array of text edits (Monaco's expected format)
- On error, we return an empty array (no formatting applied)

### 4. Context Menu Action (`monacoEditor.html`)

For discoverability, we add a context menu item for markdown files:

```javascript
if (params.lang === 'markdown') {
    editor.addAction({
        id: 'code-files-format-markdown',
        label: '📝 Format Document (Shift+Alt+F)',
        contextMenuGroupId: 'code-files',
        contextMenuOrder: 0.5,
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: function () {
            var formatAction = editor.getAction('editor.action.formatDocument');
            if (formatAction) formatAction.run();
        }
    });
}
```

This delegates to Monaco's built-in format action, which calls our registered provider.

## Configuration

Prettier options are hardcoded in the provider:
- `proseWrap: 'always'` — wrap prose at printWidth
- `printWidth: 80` — line length limit

These could be made configurable via `editorConfig` in the future.

## formatOnSave Integration

The existing `formatOnSave` logic in `monacoEditor.html` already works:

```javascript
editor.addAction({
    id: 'code-files-save',
    label: 'Save',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: function () {
        if (formatOnSave) {
            var formatAction = editor.getAction('editor.action.formatDocument');
            if (formatAction && formatAction.isSupported()) {
                formatAction.run().then(function () {
                    window.parent.postMessage({ type: 'save-document', context: context }, '*');
                });
                return;
            }
        }
        window.parent.postMessage({ type: 'save-document', context: context }, '*');
    }
});
```

When `formatOnSave` is enabled in Editor Config, pressing Ctrl+S:
1. Runs `editor.action.formatDocument` (which calls our Prettier provider)
2. Waits for formatting to complete
3. Sends `save-document` to the parent to persist changes

## Future Enhancements

1. **More Languages:** Add Prettier plugins for JavaScript, TypeScript, CSS, JSON, etc.
2. **Configurable Options:** Expose `printWidth`, `proseWrap`, `tabWidth` in Editor Config
3. **Format Selection:** Support formatting only selected text (requires `DocumentRangeFormattingEditProvider`)
4. **Error Reporting:** Show Prettier syntax errors in Monaco's problems panel

## Dependencies

- **prettier** (v3.x) — installed via `npm install prettier`
- Files used:
  - `node_modules/prettier/standalone.js` (browser build)
  - `node_modules/prettier/plugins/markdown.js` (markdown parser)

No additional dependencies are bundled into `main.js` — Prettier runs entirely in the iframe.

## Testing

To verify the integration:

1. Open a `.md` file in Monaco
2. Add some unformatted markdown (e.g., long lines, inconsistent spacing)
3. Press **Shift+Alt+F** or right-click → **Format Document**
4. The file should be reformatted according to Prettier's markdown rules

To test `formatOnSave`:

1. Open Editor Settings (gear icon)
2. Set `"formatOnSave": true` in the `.md` config
3. Make changes to a markdown file
4. Press **Ctrl+S**
5. The file should format before saving
