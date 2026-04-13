# Prettier Multi-Language Formatting

This document explains how Prettier-based formatting was integrated into the Code Files plugin for multiple languages.

## Overview

Files opened in Monaco can be formatted using Prettier via:
- **Shift+Alt+F** keyboard shortcut
- **Format Document** action in the context menu (F1 or right-click)
- **formatOnSave** option in Editor Config (formats automatically on Ctrl+S)

## Supported Languages

Prettier formatting is available for:
- **Markdown** (parser: markdown)
- **JavaScript** (parser: babel) — supports JSX
- **TypeScript** (parser: typescript) — supports TSX
- **CSS** (parser: css)
- **SCSS** (parser: scss)
- **Less** (parser: less)
- **HTML** (parser: html)
- **JSON** (parser: json)
- **YAML** (parser: yaml)
- **GraphQL** (parser: graphql)

## Why Prettier?

Monaco Editor doesn't include built-in formatters for most languages. Prettier is the industry-standard formatter, providing consistent, opinionated formatting across multiple languages.

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

**Solution:** Use Prettier's **standalone browser builds** (`standalone.js` and language-specific plugin files), which are self-contained UMD modules designed for browser environments.

### Challenge 3: esbuild Bundling

Initially, we tried importing Prettier in TypeScript and letting esbuild bundle it. This failed because:
- Prettier's dynamic imports don't resolve correctly through esbuild
- The bundled code still tried to access Node.js APIs

**Solution:** Don't bundle Prettier. Instead, copy the standalone files directly and load them as external scripts in the iframe.

## Architecture

### 1. Build Step (`esbuild.config.ts`)

The `copy-to-plugins-folder` plugin copies Prettier files to a `formatters/` directory during build:

```typescript
const formattersTarget = path.join(buildPath, 'formatters');
await fs.promises.mkdir(formattersTarget, { recursive: true });

// Copy Prettier standalone and all language plugins
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/standalone.js'),
    path.join(formattersTarget, 'prettier-standalone.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/markdown.js'),
    path.join(formattersTarget, 'prettier-markdown.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/estree.js'),
    path.join(formattersTarget, 'prettier-estree.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/typescript.js'),
    path.join(formattersTarget, 'prettier-typescript.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/babel.js'),
    path.join(formattersTarget, 'prettier-babel.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/postcss.js'),
    path.join(formattersTarget, 'prettier-postcss.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/html.js'),
    path.join(formattersTarget, 'prettier-html.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/yaml.js'),
    path.join(formattersTarget, 'prettier-yaml.js')
);
await copyFile(
    path.join(pluginDir, 'node_modules/prettier/plugins/graphql.js'),
    path.join(formattersTarget, 'prettier-graphql.js')
);
```

This places all Prettier files in the `formatters/` subdirectory alongside `main.js` in the plugin folder.

### 2. Script Injection (`monacoEditor.html`)

The Prettier files are loaded directly in the iframe HTML as `<script>` tags:

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

The UMD builds expose globals:
- `window.prettier` — the Prettier API
- `window.prettierPlugins.markdown` — the markdown parser plugin
- `window.prettierPlugins.estree` — the estree plugin (required for TypeScript/JavaScript/JSON)
- `window.prettierPlugins.typescript` — the TypeScript parser plugin
- `window.prettierPlugins.babel` — the Babel parser plugin (JavaScript/JSX)
- `window.prettierPlugins.postcss` — the PostCSS plugin (CSS/SCSS/Less)
- `window.prettierPlugins.html` — the HTML parser plugin
- `window.prettierPlugins.yaml` — the YAML parser plugin
- `window.prettierPlugins.graphql` — the GraphQL parser plugin
- `window.mermaidFormatter` — the Mermaid formatter (custom integration)

### 3. Formatter Registration (`monacoEditor.html`)

After creating the Monaco editor, we register `DocumentFormattingEditProvider` for each supported language.

#### Markdown
```javascript
monaco.languages.registerDocumentFormattingEditProvider('markdown', {
    provideDocumentFormattingEdits: async function(model) {
        try {
            var original = model.getValue();
            var formatted = await prettier.format(original, {
                parser: 'markdown',
                plugins: [prettierPlugins.markdown],
                proseWrap: PRETTIER_PROSE_WRAP,
                printWidth: PRETTIER_PRINT_WIDTH,
                tabWidth: PRETTIER_TAB_WIDTH,
                useTabs: PRETTIER_USE_TABS
            });
            // Format mermaid blocks inside the markdown
            if (window.mermaidFormatter && window.mermaidFormatter.formatMarkdownMermaidBlocks) {
                formatted = window.mermaidFormatter.formatMarkdownMermaidBlocks(formatted);
            }
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier format failed', e);
            return [];
        }
    }
});
```

#### TypeScript
```javascript
monaco.languages.registerDocumentFormattingEditProvider('typescript', {
    provideDocumentFormattingEdits: async function(model) {
        try {
            var original = model.getValue();
            var formatted = await prettier.format(original, {
                parser: 'typescript',
                plugins: [prettierPlugins.estree, prettierPlugins.typescript],
                printWidth: PRETTIER_PRINT_WIDTH,
                tabWidth: PRETTIER_TAB_WIDTH,
                useTabs: PRETTIER_USE_TABS
            });
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier typescript format failed', e);
            return [];
        }
    }
});
```

#### JavaScript
```javascript
monaco.languages.registerDocumentFormattingEditProvider('javascript', {
    provideDocumentFormattingEdits: async function(model) {
        try {
            var original = model.getValue();
            var formatted = await prettier.format(original, {
                parser: 'babel',
                plugins: [prettierPlugins.babel, prettierPlugins.estree],
                printWidth: PRETTIER_PRINT_WIDTH,
                tabWidth: PRETTIER_TAB_WIDTH,
                useTabs: PRETTIER_USE_TABS
            });
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier javascript format failed', e);
            return [];
        }
    }
});
```

#### CSS / SCSS / Less
```javascript
['css', 'scss', 'less'].forEach(function(lang) {
    monaco.languages.registerDocumentFormattingEditProvider(lang, {
        provideDocumentFormattingEdits: async function(model) {
            try {
                var original = model.getValue();
                var formatted = await prettier.format(original, {
                    parser: lang,
                    plugins: [prettierPlugins.postcss],
                    printWidth: PRETTIER_PRINT_WIDTH,
                    tabWidth: PRETTIER_TAB_WIDTH,
                    useTabs: PRETTIER_USE_TABS
                });
                return [{ range: model.getFullModelRange(), text: formatted }];
            } catch(e) {
                console.warn('code-files: prettier ' + lang + ' format failed', e);
                return [];
            }
        }
    });
});
```

#### HTML
```javascript
monaco.languages.registerDocumentFormattingEditProvider('html', {
    provideDocumentFormattingEdits: async function(model) {
        try {
            var original = model.getValue();
            var formatted = await prettier.format(original, {
                parser: 'html',
                plugins: [prettierPlugins.html],
                printWidth: PRETTIER_PRINT_WIDTH,
                tabWidth: PRETTIER_TAB_WIDTH,
                useTabs: PRETTIER_USE_TABS
            });
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier html format failed', e);
            return [];
        }
    }
});
```

#### JSON
```javascript
monaco.languages.registerDocumentFormattingEditProvider('json', {
    provideDocumentFormattingEdits: async function(model) {
        try {
            var original = model.getValue();
            var formatted = await prettier.format(original, {
                parser: 'json',
                plugins: [prettierPlugins.babel, prettierPlugins.estree],
                printWidth: PRETTIER_PRINT_WIDTH,
                tabWidth: PRETTIER_TAB_WIDTH,
                useTabs: PRETTIER_USE_TABS
            });
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier json format failed', e);
            return [];
        }
    }
});
```

#### YAML
```javascript
monaco.languages.registerDocumentFormattingEditProvider('yaml', {
    provideDocumentFormattingEdits: async function(model) {
        // Skip formatting for .lock files (yarn.lock, package-lock.json, etc.)
        if (context && /\.lock$/i.test(context)) {
            return [];
        }
        try {
            var original = model.getValue();
            var formatted = await prettier.format(original, {
                parser: 'yaml',
                plugins: [prettierPlugins.yaml],
                printWidth: PRETTIER_PRINT_WIDTH,
                tabWidth: PRETTIER_TAB_WIDTH,
                useTabs: PRETTIER_USE_TABS
            });
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier yaml format failed', e);
            return [];
        }
    }
});
```

#### GraphQL
```javascript
monaco.languages.registerDocumentFormattingEditProvider('graphql', {
    provideDocumentFormattingEdits: async function(model) {
        try {
            var original = model.getValue();
            var formatted = await prettier.format(original, {
                parser: 'graphql',
                plugins: [prettierPlugins.graphql],
                printWidth: PRETTIER_PRINT_WIDTH,
                tabWidth: PRETTIER_TAB_WIDTH,
                useTabs: PRETTIER_USE_TABS
            });
            return [{ range: model.getFullModelRange(), text: formatted }];
        } catch(e) {
            console.warn('code-files: prettier graphql format failed', e);
            return [];
        }
    }
});
```

**Key points:**
- `prettier.format()` is **async** in v3, so we use `async/await`
- The function returns an array of text edits (Monaco's expected format)
- On error, we return an empty array (no formatting applied)
- Configuration variables (`PRETTIER_PRINT_WIDTH`, `PRETTIER_TAB_WIDTH`, `PRETTIER_USE_TABS`, `PRETTIER_PROSE_WRAP`) are defined in `monacoHtml.js` and can be updated dynamically via Editor Config

### 4. Context Menu Action (`monacoEditor.html`)

A universal context menu item is added for all file types:

```javascript
editor.addAction({
    id: 'code-files-format-document',
    label: '📝 Format Document',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 0.5,
    keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
    run: function () {
        runFormatWithDiff();
    }
});
```

The `runFormatWithDiff()` function:
1. Captures the original content
2. Runs Monaco's built-in format action (which calls our registered provider)
3. Captures the formatted content
4. If changes were made, stores both versions for the diff viewer
5. Notifies the parent window that a diff is available

This delegates to Monaco's built-in format action, which calls our registered provider for the current language.

## Configuration

Prettier options can be configured via Editor Config (gear icon in tab header):

- `printWidth` — line length limit (default: 80)
- `tabSize` — tab width (default: 4, synced with Monaco)
- `insertSpaces` — use spaces instead of tabs (default: true, synced with Monaco)
- `formatOnSave` — automatically format on Ctrl+S (default: false)

Configuration variables are defined in `monacoHtml.js`:
```javascript
var PRETTIER_PROSE_WRAP = 'always';  // Markdown only: 'always', 'never', or 'preserve'
var PRETTIER_PRINT_WIDTH = 80;
var PRETTIER_TAB_WIDTH = 4;
var PRETTIER_USE_TABS = false;
```

These values are updated dynamically when you change Editor Config settings.

### Per-Extension Configuration

To customize formatting for specific file types, use the Editor Config panel:

```jsonc
{
    "printWidth": 100,  // Wrap at 100 characters instead of 80
    "tabSize": 2,       // Use 2-space indentation
    "formatOnSave": true
}
```

You can set global defaults (`*`) or per-extension overrides (`.md`, `.ts`, `.css`, etc.).

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
                runFormatWithDiff().then(function () {
                    window.parent.postMessage(
                        { type: 'save-document', context: context },
                        '*'
                    );
                });
                return;
            }
        }
        window.parent.postMessage(
            { type: 'save-document', context: context },
            '*'
        );
    }
});
```

When `formatOnSave` is enabled in Editor Config, pressing Ctrl+S:
1. Runs `editor.action.formatDocument` (which calls our Prettier provider)
2. Waits for formatting to complete
3. Sends `save-document` to the parent to persist changes

## Future Enhancements

1. **Configurable proseWrap:** Expose `proseWrap` option in Editor Config (currently hardcoded to `'always'` for Markdown)
2. **Format Selection:** Support formatting only selected text (requires `DocumentRangeFormattingEditProvider`)
3. **Error Reporting:** Show Prettier syntax errors in Monaco's problems panel
4. **Additional Languages:** Consider adding more Prettier plugins as they become available

## Dependencies

- **prettier** (v3.x) — installed via `npm install prettier`
- Files used:
  - `node_modules/prettier/standalone.js` (browser build)
  - `node_modules/prettier/plugins/markdown.js` (markdown parser)
  - `node_modules/prettier/plugins/estree.js` (required for TypeScript/JavaScript/JSON)
  - `node_modules/prettier/plugins/typescript.js` (TypeScript parser)
  - `node_modules/prettier/plugins/babel.js` (JavaScript/JSX parser)
  - `node_modules/prettier/plugins/postcss.js` (CSS/SCSS/Less parser)
  - `node_modules/prettier/plugins/html.js` (HTML parser)
  - `node_modules/prettier/plugins/yaml.js` (YAML parser)
  - `node_modules/prettier/plugins/graphql.js` (GraphQL parser)

No additional dependencies are bundled into `main.js` — Prettier runs entirely in the iframe.

All Prettier files are copied to the `formatters/` subdirectory during the build process.

## Testing

To verify the integration:

1. Open a file in Monaco (`.md`, `.ts`, `.js`, `.css`, `.html`, `.json`, `.yaml`, `.graphql`)
2. Add some unformatted code (e.g., long lines, inconsistent spacing, missing semicolons)
3. Press **Shift+Alt+F** or right-click → **Format Document**
4. The file should be reformatted according to Prettier's rules for that language
5. Click the diff icon (⟷) in the tab header to view the changes

To test `formatOnSave`:

1. Open Editor Settings (gear icon)
2. Set `"formatOnSave": true` in the config for your file extension
3. Make changes to the file
4. Press **Ctrl+S**
5. The file should format before saving, and the diff icon should appear

The `format-test-samples/` folder in the repository contains example files with intentional formatting errors for testing all supported languages.
