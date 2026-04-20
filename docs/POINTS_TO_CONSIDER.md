# Points to Consider & Technical Debt

This document tracks known edge cases, technical debt, and architectural trade-offs in the
Code Files plugin.

## 1. Vault Cache Synchronization (setTimeout Smell)
In `CreateCodeFileModal.ts` and `RenameExtensionModal.ts`, `setTimeout(resolve, 50)` is used after
calling `reconcileFileInternal`.

- **Reason**: Obsidian's vault cache does not always update immediately after a forced
  reconciliation of hidden/dotfiles.
- **Risk**: On extremely slow systems, 50ms might not be enough, leading to
  `getAbstractFileByPath` returning `null`.
- **Future Improvement**: Investigate if there's a more reliable event to hook into (like
  `vault.on('modify', ...)` or checking the cache in a loop with a timeout).

## 2. Hidden File vs. Extension Registration Edge Case
In `CreateCodeFileModal.ts`, a user might type a hidden file name (e.g., `.prettierrc`) in the
name field while the extension suggest/field still contains a value (e.g., `json`).

- **Current Behavior**: The plugin creates `.prettierrc` (ignoring the extension field for the
  filename) and skips registering `json` as a Code Files extension.
- **Rationale**: If the user intentionally typed a full hidden filename, they likely don't want
  to register a "dangling" extension that wasn't used for the created file.

## 3. Circular Dependency Workaround (Duck Typing)
In `EditorSettingsModal.ts`, duck typing (`'clearDirty' in view`) is used instead of a proper
`instanceof CodeEditorView` check.

- **Reason**: A circular dependency exists between `EditorSettingsModal` and `CodeEditorView`.
  Esbuild/JavaScript module resolution sometimes leaves the class `undefined` at runtime if
  imported directly.
- **Risk**: Fragile if the property name `clearDirty` changes or if other view types accidentally
  implement a property with the same name.
- **Future Improvement**: Refactor the architecture to break the circular dependency (e.g., using
  an interface, an event bus, or a separate controller).

## 4. Modal Close Button Selector
In `FenceEditModal.ts`, the close button is accessed via `.modal-close-button`.

- **Risk**: Since this is an internal Obsidian CSS class, it might change in future Obsidian
  updates.
- **Handling**: A safe check is implemented to prevent crashes, but the styling might stop
  working if the class name changes.

## 5. Monaco Mount Delay (setTimeout Smell)
In `mountCodeEditor.ts`, `setTimeout(..., 150)` is used after opening a file in a new tab.

- **Reason**: Monaco needs time to initialize and mount its internal editor after the iframe is
  appended to the DOM in a new tab.
- **Risk**: On slower systems or large files, 150ms might be insufficient to send the initial
  `scroll-to-position` command accurately.
- **Future Improvement**: Implement a 'monaco-ready' signal from the iframe specifically for
  newly mounted editors before sending position synchronization messages.

## 6. Monaco Iframe CSS Injection Patch (Element.prototype.appendChild)
Inside the Monaco iframe HTML blob in `mountCodeEditor.ts`, `Element.prototype.appendChild` is
patched.

- **Reason**: Monaco attempts to inject its CSS via `<link rel="stylesheet">` at runtime, which
  is blocked by Obsidian's Content Security Policy (CSP) for child frames (iframes).
- **Behavior**: The patch silently drops `<link>` nodes to prevent errors, while the actual CSS
  is inlined as `<style>` tags during the initial HTML build.
- **Risk**: If Monaco changes its internal loading mechanism to rely on features other than
  simple `<link>` insertion, this patch might become obsolete or break.

## 7. Safe Monkey-Patching (monkey-around)
In `mountCodeEditor.ts`, `monkey-around` is used to patch `plugin.app.setting.onClose` and the
command palette's `onClose`.

- **Reason**: Reassigning `onClose` manually is fragile and can lead to lost patches if multiple
  editor instances (or other plugins) attempt to patch the same method.
- **Benefit**: `monkey-around` allows patches to be stacked safely and provides an `uninstall`
  function to restore the original state cleanly.
