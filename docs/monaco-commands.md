# Adding Monaco Commands — Guide and Pitfalls

## Two Exposure Surfaces

Monaco offers two mechanisms to expose a user action:

### `editor.addCommand(keybinding, handler)`
Registers only a keyboard shortcut. The action **does not appear** in the context menu or Monaco command palette (F1). Use only for shortcuts without visible UI.

### `editor.addAction(descriptor)`
Registers a complete action. With `contextMenuGroupId` set, it appears **both** in the context menu and the F1 palette. This is the preferred method.

```javascript
editor.addAction({
  id: 'code-files-my-action',          // unique identifier
  label: 'My Action',                  // displayed text
  contextMenuGroupId: 'navigation',    // group in context menu
  contextMenuOrder: 1.9,               // order within group
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyX], // optional
  run: function() {
    window.parent.postMessage({ type: 'my-action', context: context }, '*');
  }
});
```

---

## Complete Flow of a Context Command

The flow for a command that opens an Obsidian modal from Monaco:

```
Monaco (iframe)
  └─ addAction.run() → postMessage { type: 'my-action', context }
       ↓
mountCodeEditor.ts (window.addEventListener 'message')
  └─ case 'my-action': → opens Obsidian modal
```

### 1. In `monacoEditor.html`

```javascript
editor.addAction({
  id: 'code-files-my-action',
  label: 'My Action',
  contextMenuGroupId: 'navigation',
  contextMenuOrder: 1.9,
  run: function() {
    window.parent.postMessage({ type: 'my-action', context: context }, '*');
  }
});
```

### 2. In `mountCodeEditor.ts`

```typescript
case 'my-action': {
  if (data.context === codeContext) {
    const modal = new MyModal(plugin, ...);
    const origOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      origOnClose();
      iframe.focus(); // restore focus to Monaco after closing
    };
    modal.open();
  }
  break;
}
```

---

## Modal Focus Handling — Automatic via modalPatch

The plugin uses `patchModalClose()` (in `modalPatch.ts`) which monkey-patches `Modal.prototype.open` globally. This patch automatically blurs any focused iframe before Obsidian saves `document.activeElement`, preventing the "instanceOf is not a function" crash.

### Why This Was Needed

Monaco runs in an **isolated iframe**. Its DOM is completely separated from Obsidian's DOM — iframe elements don't inherit the patches that Obsidian's minified code injects on `Node.prototype`, notably the `instanceOf` method.

When `modal.open()` (or `app.setting.open()`) is called, Obsidian saves `document.activeElement` to restore focus on close. If the active element is inside the Monaco iframe (the hidden `<textarea>`, a button, etc.), Obsidian attempts to validate it with `element.instanceOf(HTMLElement)` on close — a method that doesn't exist on iframe elements. Result:

```
Uncaught TypeError: n.instanceOf is not a function
    at e.close (app.js:1:...)
```

### The Solution

The `patchModalClose()` function intercepts all `modal.open()` calls and automatically blurs any focused iframe before Obsidian saves the active element:

```typescript
// In modalPatch.ts
proto.open = function (...args: unknown[]) {
    const active = document.activeElement;
    if (active?.tagName === 'IFRAME') {
        (active as HTMLElement).blur();
        document.body.focus();
    }
    return original.apply(this, args);
};
```

This means:
- **No manual `blur()` calls needed** before `modal.open()`
- **Works for all modals** (including third-party plugins)
- **Applied once** in `main.ts` on plugin load
- **Removed on unload** to leave no trace

---

## Pitfall 1 — `n.instanceOf is not a function` on Modal Close

**Cause:** See the "Modal Focus Handling" section above.

**Solution:** The `modalPatch` handles this automatically — no manual `blur()` needed.

**Focus restoration:** Monkey-patch `modal.onClose` to call `iframe.focus()` after closing, otherwise the user loses focus on the editor.

---

## Pitfall 2 — Command Only Executes Once

**Symptom:** The first execution works, subsequent ones are silently ignored.

**Cause:** The iframe's `codeContext` no longer matches the current file. This typically happens after an extension rename — the iframe keeps the old `codeContext` (e.g., `script.py`) while the file is now `script.js`. The filter `if (data.context === codeContext)` in `mountCodeEditor.ts` rejects all subsequent messages.

**Solution:** Implement `onRename(file: TFile)` in `CodeEditorView` to destroy the old iframe and mount a new one with the correct `codeContext`:

```typescript
async onRename(file: TFile): Promise<void> {
  super.onRename(file);
  this.codeEditor?.destroy();
  this.contentEl.empty();
  this.codeEditor = await mountCodeEditor(
    this.plugin,
    getLanguage(file.extension),
    this.data,
    this.getContext(file),
    () => this.requestSave(),
    () => this.save()
  );
  this.contentEl.append(this.codeEditor.iframe);
}
```

---

## Pitfall 3 — Updating Config at Runtime

Parameters sent via `initParams` at initialization are not automatically updated if settings change. You must send a dedicated message from `mountCodeEditor.ts` and handle it in `monacoEditor.html`.

Example with `change-editor-config`:

**In `mountCodeEditor.ts`** — after saving the config:
```typescript
send('change-editor-config', { config: newConfigJson });
```

**In `monacoEditor.html`** — in the message `switch`:
```javascript
case 'change-editor-config':
  if (editor) {
    var cfg = JSON.parse(data.config);
    editor.getModel().updateOptions({ tabSize: cfg.tabSize, insertSpaces: cfg.insertSpaces });
    editor.updateOptions({ formatOnType: !!cfg.formatOnType });
    formatOnSave = !!cfg.formatOnSave;
  }
  break;
```

The same pattern applies for `change-theme`, `change-language`, etc.

---

## Shortcuts to Native Obsidian Actions

Monaco captures all keyboard events in the iframe — Obsidian's global shortcuts (like `Ctrl+,` for settings) don't reach the parent. To reactivate them, intercept them in Monaco and relay via `postMessage`.

### Example — `Ctrl+,` to Open Obsidian Settings

**In `monacoEditor.html`** — intercept the shortcut before Monaco:

```javascript
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Comma, function() {
    window.parent.postMessage({ type: 'open-settings', context: context }, '*');
});
```

**In `mountCodeEditor.ts`** — handler on parent side:

```typescript
case 'open-settings': {
    if (data.context === codeContext) {
        plugin.app.setting.open();
    }
    break;
}
```

> **Note:** The Obsidian Settings window is not a standard Obsidian modal, but the `modalPatch` still handles the focus issue automatically. No need to monkey-patch `onClose` since Settings manages its own lifecycle.
