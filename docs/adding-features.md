# Adding Features — Practical Guide

## 1. Adding a New Toggle Setting

### a. Declare the Field

`types.ts` — add to `MyPluginSettings`:
```typescript
/** Short description */
myOption: boolean;
```

Add the default value in `DEFAULT_SETTINGS`:
```typescript
myOption: true,
```

### b. Expose in the Gear Icon Modal

`editorSettingsModal.ts` — in `onOpen()`, after existing toggles:
```typescript
new Setting(toggleSection)
    .setName('My Option')
    .setDesc('Description.')
    .addToggle((t) =>
        t.setValue(this.plugin.settings.myOption).onChange(async (v) => {
            this.plugin.settings.myOption = v;
            await this.plugin.saveSettings();
            this.onSettingsChanged(); // triggers broadcastOptions() in the caller
        })
    );
```

### c. Send to Monaco if Applicable

If the option affects the Monaco editor, include it in `broadcastOptions()` (`broadcast.ts`):
```typescript
view.codeEditor?.send('change-options', {
    // ... existing options
    myOption: this.settings.myOption,
});
```

And in `initParams` (`mountCodeEditor.ts`):
```typescript
myOption: plugin.settings.myOption,
```

And handle it in `monacoEditor.html` in the message `switch` statement.

---

## 2. Adding a New Monaco Command (Context Menu + F1)

### a. Declare the Action in `monacoEditor.html`

In the initialization code, after existing actions:
```javascript
editor.addAction({
    id: 'code-files-my-action',
    label: '🔖 My Action',
    contextMenuGroupId: 'code-files',   // group in context menu
    contextMenuOrder: 4,                 // order within group
    run: function () {
        window.parent.postMessage(
            { type: 'open-my-action', context: context },
            '*'
        );
    }
});
```

> For keyboard shortcut only (no menu entry): use `editor.addCommand(keybinding, handler)`.

### b. Handle the Message in `mountCodeEditor.ts`

In the `switch` statement of `onMessage`:
```typescript
case 'open-my-action': {
    if (data.context === codeContext) {
        new MyModal(
            plugin,
            ...,
            () => send('focus', {})  // restoreFocus callback
        ).open();
    }
    break;
}
```

### c. Modal Focus Handling — Two Mechanisms

**1. modalPatch (automatic crash prevention)**

The plugin uses `patchModalClose()` (in `modalPatch.ts`) which monkey-patches `Modal.prototype.open` globally. This patch automatically blurs any focused iframe before Obsidian saves `document.activeElement`, preventing the "instanceOf is not a function" crash.

The patch is applied once in `main.ts` on plugin load:
```typescript
this.unpatchModal = patchModalClose();
```

And removed on unload:
```typescript
this.unpatchModal?.();
```

This means:
- **No manual `blur()` calls needed** before `modal.open()`
- **Works for all modals** opened from Monaco (including third-party plugins)
- **Prevents crashes** when modals close

**2. restoreFocus callback (focus restoration)**

When a modal closes, focus returns to Obsidian's main DOM, not to the Monaco iframe. To restore focus to Monaco and preserve cursor position, modals accept an optional `restoreFocus` callback:

**In the modal class:**
```typescript
constructor(
    private plugin: CodeFilesPlugin,
    ...,
    private restoreFocus?: () => void
) {
    super(plugin.app);
}

onClose(): void {
    super.onClose();
    // ... cleanup code ...
    this.restoreFocus?.();
}
```

**When opening the modal:**
```typescript
new MyModal(
    plugin,
    ...,
    () => send('focus', {})  // sends { type: 'focus' } to iframe
).open();
```

**In monacoEditor.html:**
```javascript
case 'focus':
    if (editor) editor.focus();
    break;
```

Monaco preserves cursor position internally, so calling `editor.focus()` is sufficient.

**Note:** For modals with input fields (like RenameExtensionModal), add a small delay to avoid cursor jump:
```typescript
() => setTimeout(() => send('focus', {}), 50)
```

---

## 3. New postMessage (parent → iframe)

### a. Send from Parent

```typescript
// via send() returned by mountCodeEditor
codeEditor.send('my-message', { myValue: 42 });

// or from CodeEditorView
this.codeEditor?.send('my-message', { myValue: 42 });
```

### b. Handle in `monacoEditor.html`

In the `switch` statement of `window.addEventListener('message', ...)`:
```javascript
case 'my-message':
    if (editor) {
        // use data.myValue
    }
    break;
```

---

## 4. Adding a New Modal or Dialog

No plugin-specific requirements — follow standard Obsidian patterns. See `ChooseThemeModal` for a `SuggestModal` with preview, `RenameExtensionModal` for a simple modal with input + button.

If the modal is opened from Monaco (via postMessage), the `modalPatch` handles focus automatically — no manual `blur()` needed.

---

## Summary Checklist

**New toggle setting:**
- [ ] Field in `MyPluginSettings` + `DEFAULT_SETTINGS`
- [ ] Toggle in `EditorSettingsModal` (gear icon)
- [ ] Optional: in `CodeFilesSettingsTab` if globally relevant
- [ ] If applicable to Monaco: in `initParams` + `broadcastOptions()` + handle in `monacoEditor.html`

**New Monaco command:**
- [ ] `editor.addAction()` in `monacoEditor.html`
- [ ] `case` in the `switch` of `onMessage` in `mountCodeEditor.ts`
- [ ] Modal accepts `restoreFocus?: () => void` parameter and calls it in `onClose()`
- [ ] Pass `() => send('focus', {})` when opening the modal (add delay if needed for input modals)

**New parent → iframe message:**
- [ ] `send('type', payload)` on parent side
- [ ] `case 'type':` in the `switch` of `monacoEditor.html`
