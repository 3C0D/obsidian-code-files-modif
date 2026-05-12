# Documentation Guidelines

## Document Types

### Problem-Solving Documents
For implementation challenges (e.g., diff editor installation):
- LLM provides overview of work done
- Problems encountered and solutions
- Move to `Archives/` once resolved

### Architecture & Implementation Notes
For understanding how features work:
- Which files are affected
- Code sections involved (without full code reproduction)
- Implementation strategies and requirements

## Writing Rules

### Terminology — Settings Disambiguation

The word "settings" is ambiguous in this codebase. Always use the precise term:

- **Obsidian settings panel** : the native Obsidian settings UI (opened via Ctrl+,)
- **Plugin settings tab** : the plugin's configuration tab displayed inside the Obsidian settings panel (hotkey overrides, toggles, etc.)
- **Monaco editor config** : the editor configuration object (`tabSize`, `formatOnSave`, etc.) sent to the iframe via `change-editor-config`

Never write just "settings" when one of these three terms applies.

### Code Examples
- **General reference docs**: Replace full code blocks with concise references to locations and key options, followed by a brief explanation of what the feature does. E.g., under each section title, add 1-2 sentences explaining the purpose, then the code reference.
- **Repetitive concepts**: Show first example, reference others with similar code
- **CSS styles**: Show only important parts or beginning, indicate location
- **Non-critical code**: Reference location instead of full reproduction

### Document Structure
- **Summary at top**: Easy understanding overview
- **Concise content**: Focus on essential information
- **Clear references**: Point to specific files/locations

## Revised Files
- [x] Rules-doc.md ✓
- [x] architecture.md ✓
- [x] cross-file-navigation.md ✓
- [x] format-diff-revert.md ✓
- [x] mermaid-formatting.md ✓
- [x] prettier-markdown-formatting.md ✓
- [x] adding-features.md ✓
- [x] monaco-commands.md ✓
- [x] editor-actions.md ✓
- [x] config-migration-strategy.md ✓
- [x] diff-editor-singleton-fix.md ✓
- [x] settings-refactor.md ✓
- [x] monaco-local-integration.md ✓
- [x] files-without-extension.md ✓
- [x] hidden-files-eye-badge-system.md ✓
