# Adding Code Formatters Guide

## Summary

This guide documents how WASM-based formatters (Ruff, gofmt, clang-format) were integrated into the Monaco editor. It explains the integration pattern and why Rust formatter couldn't be added.

## Integrated Formatters

### Successfully Integrated (WASM)
- **Ruff** (Python) - 1.72 MB - PEP 8 compliant, style-only formatting
- **gofmt** (Go) - 0.5 MB - Official Go formatter, zero config
- **clang-format** (C/C++) - 2.32 MB - LLVM formatter, configurable

### Not Integrated
- **Rust (rustfmt)** - No stable npm WASM package available
- **Java, C#, PHP** - No viable browser-standalone formatters

## Integration Pattern

All three formatters follow the same pattern:

### 1. Install Package
```bash
yarn add @wasm-fmt/ruff_fmt @wasm-fmt/gofmt @wasm-fmt/clang-format
```

Packages are in `devDependencies` (build-time only, WASM files are copied to plugin folder).

### 2. Create Bundle Entry Point

Each formatter needs a bundle entry file that exposes the WASM module to the global scope:

**Example: `src/ruff-formatter-bundle-entry.js`**
```javascript
import init, { format } from '@wasm-fmt/ruff_fmt/web';
window.ruffFormatter = { init, format };
```

Similar files for gofmt and clang-format.

### 3. Configure esbuild

In `scripts/esbuild.config.ts`, add build step for each formatter:

```typescript
// Bundle ruff-formatter (Python) for browser
await esbuild.build({
    entryPoints: [path.join(pluginDir, 'src/ruff-formatter-bundle-entry.js')],
    bundle: true,
    format: 'iife',
    outfile: path.join(formattersTarget, 'ruff-formatter.js'),
    platform: 'browser',
    minify: isProd,
    loader: { '.wasm': 'file' },
    metafile: true
});

// Copy WASM file to formatters/ folder
const wasmSrc = path.join(pluginDir, 'node_modules/@wasm-fmt/ruff_fmt/ruff_fmt_bg.wasm');
const wasmTarget = path.join(formattersTarget, 'ruff_fmt_bg.wasm');
await copyFile(wasmSrc, wasmTarget);
```

Repeat for gofmt and clang-format with their respective WASM file names.

### 4. Load in Monaco iframe

In `mountCodeEditor.ts`, add URLs and inject scripts:

```typescript
// Define URLs
const ruffFormatterUrl = res('formatters/ruff-formatter.js');
const ruffWasmUrl = res('formatters/ruff_fmt_bg.wasm');

// Inject into HTML
html = html.replace(
    '</head>',
    `<script src="${ruffFormatterUrl}"></script>
<script>window.__RUFF_WASM_URL__ = '${ruffWasmUrl}';</script>
// ... other scripts
</head>`
);
```

**Why `window.__WASM_URL__`?**
- WASM modules need to load a `.wasm` file at runtime
- The URL must be passed from TypeScript (which knows the app:// path) to the iframe
- Mermaid doesn't need this because it's pure JavaScript, not WASM

### 5. Register Formatter Provider

In `monacoEditor.html`, initialize WASM and register the formatter:

```javascript
// Python: Ruff Formatter
(async function() {
    if (!window.ruffFormatter) {
        console.warn('code-files: ruff-formatter not loaded');
        return;
    }

    try {
        await window.ruffFormatter.init(window.__RUFF_WASM_URL__);
        console.log('code-files: ruff-formatter initialized');
    } catch (e) {
        console.error('code-files: ruff-formatter init failed', e);
        return;
    }

    monaco.languages.registerDocumentFormattingEditProvider('python', {
        provideDocumentFormattingEdits: function(model) {
            try {
                var original = model.getValue();
                var formatted = window.ruffFormatter.format(original, null, {
                    indent_style: PRETTIER_USE_TABS ? 'tab' : 'space',
                    indent_width: PRETTIER_TAB_WIDTH,
                    line_width: PRETTIER_PRINT_WIDTH,
                    line_ending: 'lf',
                    quote_style: 'double',
                    magic_trailing_comma: 'respect'
                });
                
                if (formatted !== original) {
                    lastFormatOriginal = original;
                    lastFormatFormatted = formatted;
                    window.parent.postMessage(
                        { type: 'format-diff-available', context: context },
                        '*'
                    );
                }
                
                return [{ range: model.getFullModelRange(), text: formatted }];
            } catch(e) {
                console.warn('code-files: ruff format failed', e);
                return [];
            }
        }
    });
})();
```

Similar registration for Go and C/C++, with language-specific options.

### 6. Update Documentation

- `README.md`: Add to "Supported Languages" section
- `types.ts`: Update language-specific config templates
- Test files: Create `templates/format-test-samples-for-obsidian/sample.{py,go,c,cpp}`

## Formatter-Specific Notes

### Ruff (Python)
- **Limitation**: Style-only formatting (indentation, spacing, quotes)
- **Does NOT**: Reorganize imports, fix import order, or apply linting fixes
- **Options**: `indent_style`, `indent_width`, `line_width`, `quote_style`, `magic_trailing_comma`

### gofmt (Go)
- **Zero config**: Always uses tabs, specific formatting rules
- **No options**: Just `format(source)`, no configuration needed

### clang-format (C/C++)
- **Configurable**: Supports many options (IndentWidth, UseTab, ColumnLimit, etc.)
- **Both languages**: Single provider handles both C and C++ via `['c', 'cpp'].forEach()`

## Why Rust Wasn't Added

No stable npm package with browser-ready WASM build exists for rustfmt. The official rustfmt is part of the Rust toolchain and doesn't have a standalone WASM distribution suitable for browser use.

## Key Files Modified

- `package.json` - Added formatter packages to devDependencies
- `scripts/esbuild.config.ts` - Build and copy WASM files
- `src/editor/mountCodeEditor.ts` - Load formatter scripts and WASM URLs
- `src/editor/monacoEditor.html` - Register formatter providers
- `src/ruff-formatter-bundle-entry.js` - Ruff bundle entry
- `src/gofmt-formatter-bundle-entry.js` - gofmt bundle entry
- `src/clang-format-bundle-entry.js` - clang-format bundle entry
- `templates/format-test-samples-for-obsidian/` - Test files for each language
- `README.md` - Updated supported languages list
- `types.ts` - Updated language-specific config templates

## Testing

Each formatter was tested with:
1. Intentionally malformed test files in `templates/format-test-samples-for-obsidian/`
2. Format on demand (Shift+Alt+F)
3. Format on save (when enabled)
4. Format diff viewer with selective revert
5. Edge cases (empty files, syntax errors, large files)

## Resources

- **wasm-fmt packages**: https://github.com/wasm-fmt
- **Ruff**: https://github.com/astral-sh/ruff
- **gofmt**: https://go.dev/blog/gofmt
- **clang-format**: https://clang.llvm.org/docs/ClangFormat.html
