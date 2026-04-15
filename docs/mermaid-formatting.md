# Mermaid Formatting

## Summary
Mermaid diagrams (.mmd, .mermaid) and Mermaid blocks in markdown files can be formatted using `mermaid-formatter`. Supports Shift+Alt+F, context menu, and formatOnSave.

## Features
- **Standalone files** — .mmd/.mermaid files formatted with `mermaid-formatter`
- **Markdown blocks** — ```mermaid blocks inside .md files formatted automatically
- **All diagram types** — flowcharts, sequence, class, state, ER, Gantt, etc.

## Implementation

### Why Mermaid Can Be Bundled (Unlike Prettier)
**Mermaid-formatter** is a simple Node.js package that:
- **No filesystem APIs** — pure text transformation
- **No dynamic imports** — straightforward dependencies
- **Browser-compatible code** — works with esbuild bundling

**Prettier** cannot be bundled because:
- **Dynamic imports** don't resolve through esbuild
- **Node.js APIs** in some code paths
- **Complex plugin system** — requires standalone builds

**Solution for Mermaid:** Bundle with esbuild → single `mermaid-formatter.js` file
**Solution for Prettier:** Copy standalone builds → multiple plugin files

### Build Integration
**Location:** `esbuild.config.ts`
```typescript
// Bundle mermaid-formatter for browser
await esbuild.build({
    entryPoints: ['src/mermaid-formatter-bundle-entry.js'],
    bundle: true,
    format: 'iife',
    outfile: path.join(formattersTarget, 'mermaid-formatter.js'),
    platform: 'browser'
});
```

### Bundle Entry Point
**Location:** `src/mermaid-formatter-bundle-entry.js`
```javascript
import { formatMermaid, formatMarkdownMermaidBlocks } from 'mermaid-formatter';
window.mermaidFormatter = { formatMermaid, formatMarkdownMermaidBlocks };
```

### Script Loading
**Location:** `monacoEditor.html`
```html
<script src="./formatters/mermaid-formatter.js"></script>
```

### Formatter Registration

#### Standalone Mermaid Files
```javascript
monaco.languages.registerDocumentFormattingEditProvider('mermaid', {
    provideDocumentFormattingEdits: function(model) {
        var original = model.getValue();
        var formatted = window.mermaidFormatter.formatMermaid(original);
        return [{ range: model.getFullModelRange(), text: formatted }];
    }
});
```

#### Mermaid Blocks in Markdown
Enhanced existing Prettier markdown formatter:
```javascript
// After Prettier formats markdown structure
if (window.mermaidFormatter?.formatMarkdownMermaidBlocks) {
    formatted = window.mermaidFormatter.formatMarkdownMermaidBlocks(formatted);
}
```

### Language Mapping
**Location:** `getLanguage.ts`
```typescript
mmd: 'mermaid',
mermaid: 'mermaid',
```

---

**Revised:** ✓
