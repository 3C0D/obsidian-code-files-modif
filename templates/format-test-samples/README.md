# Format Test Samples

This folder contains test files to verify Prettier formatting in Obsidian Code Files plugin.

## ⚠️ Important

These files contain **intentional formatting errors** to demonstrate the formatter. They are excluded from auto-formatting via `.prettierignore` to preserve the errors for testing.

## How to use

1. Copy this `format-test-samples` folder to your Obsidian vault
2. Open each file in Monaco Editor
3. Use **Shift+Alt+F** or enable **formatOnSave** to format
4. Observe the formatting changes in the diff viewer
5. Test the selective revert feature (↩ buttons in the gutter)

## Files included

- **sample.js** - JavaScript with formatting errors
- **sample.ts** - TypeScript with formatting errors
- **sample.css** - CSS with formatting errors
- **sample.scss** - SCSS with formatting errors
- **sample.html** - HTML with formatting errors
- **sample.json** - JSON with formatting errors
- **sample.yaml** - YAML with formatting errors
- **sample.graphql** - GraphQL with formatting errors
- **sample.md** - Markdown with formatting errors and Mermaid blocks
- **sample.mmd** - Mermaid standalone with formatting errors
- **sample.c** - C with formatting errors (Monaco native formatter, not Prettier)
- **sample.cpp** - C++ with formatting errors (Monaco native formatter, not Prettier)

## Languages supported by Prettier

✅ JavaScript (parser: babel)
✅ TypeScript (parser: typescript)
✅ CSS (parser: css)
✅ SCSS (parser: scss)
✅ Less (parser: less)
✅ HTML (parser: html)
✅ JSON (parser: json)
✅ YAML (parser: yaml)
✅ GraphQL (parser: graphql)
✅ Markdown (parser: markdown)
✅ Mermaid (mermaid-formatter)

Each file intentionally contains formatting errors to demonstrate the formatter's effect.
