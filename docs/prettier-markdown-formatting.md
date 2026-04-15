# Prettier Multi-Language Formatting

## Summary
Prettier-based formatting for 10+ languages via Shift+Alt+F, context menu, and formatOnSave. Uses standalone browser builds loaded locally to bypass CSP restrictions.

## Supported Languages
- **Markdown** (markdown) — with Mermaid block formatting
- **JavaScript** (babel) — supports JSX
- **TypeScript** (typescript) — supports TSX
- **CSS/SCSS/Less** (css/scss/less)
- **HTML** (html)
- **JSON** (json)
- **YAML** (yaml)
- **GraphQL** (graphql)

## Implementation Challenges & Solutions

### CSP Restrictions
**Problem:** Obsidian blocks external scripts
**Solution:** Copy Prettier standalone files locally, load via `app://` URLs

### Node.js vs Browser
**Problem:** Prettier Node.js version uses filesystem APIs
**Solution:** Use standalone browser builds (UMD modules)

### esbuild Bundling
**Problem:** Dynamic imports don't resolve through esbuild
**Solution:** Don't bundle Prettier, load as external scripts

## Architecture

### Build Step
**Location:** `esbuild.config.ts`
```typescript
// Copy Prettier standalone and plugins to formatters/
await copyFile(
    'node_modules/prettier/standalone.js',
    path.join(formattersTarget, 'prettier-standalone.js')
);
// Similar for: typescript, markdown, babel, postcss, html, yaml, graphql
```

### Script Loading
**Location:** `monacoEditor.html`
```html
<script src="./formatters/prettier-standalone.js"></script>
<script src="./formatters/prettier-typescript.js"></script>
<!-- ... other plugins ... -->
```

Exposes globals:
- `window.prettier` — Prettier API
- `window.prettierPlugins.typescript` — TypeScript parser
- Similar for other languages

### Formatter Registration
**Example for TypeScript:**
```javascript
monaco.languages.registerDocumentFormattingEditProvider('typescript', {
    provideDocumentFormattingEdits: async function(model) {
        var original = model.getValue();
        var formatted = await prettier.format(original, {
            parser: 'typescript',
            plugins: [prettierPlugins.estree, prettierPlugins.typescript],
            printWidth: PRETTIER_PRINT_WIDTH,
            tabWidth: PRETTIER_TAB_WIDTH,
            useTabs: PRETTIER_USE_TABS
        });
        return [{ range: model.getFullModelRange(), text: formatted }];
    }
});
```

**Key patterns:**
- All formatters use same structure with different parser/plugins
- `prettier.format()` is async in v3
- Return empty array on error (no formatting)
- Configuration via global variables from Editor Config

### Context Menu Integration
**Function:** `runFormatWithDiff()`
1. Capture original content
2. Run Monaco's format action
3. Capture formatted content
4. Store both for diff viewer if changes made
5. Notify parent window

## Configuration
**Via Editor Config (gear icon):**
- `printWidth` — line length (default: 80)
- `tabSize` — tab width (synced with Monaco)
- `insertSpaces` — spaces vs tabs (synced with Monaco)
- `formatOnSave` — auto-format on Ctrl+S

Global (`*`) or per-extension (`.ts`, `.md`, etc.) overrides supported.

## formatOnSave Integration
When enabled, Ctrl+S:
1. Runs `editor.action.formatDocument`
2. Waits for completion
3. Sends `save-document` to parent

## Dependencies
- **prettier** (v3.x) — standalone browser builds only
- Files copied to `formatters/` directory during build
- No bundling into `main.js` — runs entirely in iframe

---

**Revised:** ✓