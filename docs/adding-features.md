# Adding Features — Practical Guide

## Summary
Step-by-step guide for adding toggle settings, Monaco commands, postMessage handlers, and modals. Includes automatic focus handling via modalPatch.

## 1. Adding Toggle Setting

### Declare Field
**Location:** `types.ts`
```typescript
// In MyPluginSettings
myOption: boolean;

// In DEFAULT_SETTINGS
myOption: true,
```

### Add to Gear Modal
**Location:** `editorSettingsModal.ts`
```typescript
new Setting(toggleSection)
    .setName('My Option')
    .setDesc('Description.')
    .addToggle((t) =>
        t.setValue(this.plugin.settings.myOption).onChange(async (v) => {
            this.plugin.settings.myOption = v;
            await this.plugin.saveSettings();
            this.onSettingsChanged(); // triggers broadcastOptions()
        })
    );
```

### Send to Monaco (if applicable)
**Locations:** `broadcast.ts`, `mountCodeEditor.ts`, `monacoEditor.html`
```typescript
// In broadcastOptions()
view.codeEditor?.send('change-options', {
    myOption: this.settings.myOption,
});

// In initParams
myOption: plugin.settings.myOption,

// In monacoEditor.html message switch
case 'change-options':
    // handle data.myOption
    break;
```

## 2. Adding Monaco Command

### Declare Action
**Location:** `monacoEditor.html`
```javascript
editor.addAction({
    id: 'code-files-my-action',
    label: '🔖 My Action',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 4,
    run: function() {
        window.parent.postMessage(
            { type: 'open-my-action', context: context },
            '*'
        );
    }
});
```

### Handle Message
**Location:** `mountCodeEditor.ts`
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

### Modal Focus Handling

#### Automatic Crash Prevention
**Location:** `modalPatch.ts` (applied in `main.ts`)
- Monkey-patches `Modal.prototype.open` globally
- Automatically blurs focused iframe before modal opens
- Prevents "instanceOf is not a function" crash
- **No manual blur() calls needed**

#### Focus Restoration
**Modal constructor:**
```typescript
constructor(
    private plugin: CodeFilesPlugin,
    ...,
    private restoreFocus?: () => void
) {}

onClose(): void {
    super.onClose();
    this.restoreFocus?.();
}
```

**When opening modal:**
```typescript
new MyModal(
    plugin,
    ...,
    () => send('focus', {})  // restores focus to Monaco
).open();
```

**For input modals, add delay:**
```typescript
() => setTimeout(() => send('focus', {}), 50)
```

## 3. New postMessage (parent → iframe)

### Send from Parent
```typescript
// Via mountCodeEditor return value
codeEditor.send('my-message', { myValue: 42 });

// From CodeEditorView
this.codeEditor?.send('my-message', { myValue: 42 });
```

### Handle in iframe
**Location:** `monacoEditor.html`
```javascript
case 'my-message':
    if (editor) {
        // use data.myValue
    }
    break;
```

## 4. Adding Modal/Dialog

Follow standard Obsidian patterns. See examples:
- `ChooseThemeModal` — SuggestModal with preview
- `RenameExtensionModal` — modal for renaming files (name + extension) with dotfile support

If opened from Monaco, `modalPatch` handles focus automatically.

## Summary Checklist

**New toggle setting:**
- [ ] Field in `MyPluginSettings` + `DEFAULT_SETTINGS`
- [ ] Toggle in `EditorSettingsModal`
- [ ] If Monaco-related: `initParams` + `broadcastOptions()` + handle in iframe

**New Monaco command:**
- [ ] `editor.addAction()` in `monacoEditor.html`
- [ ] Message handler in `mountCodeEditor.ts`
- [ ] Modal accepts `restoreFocus` callback
- [ ] Pass `() => send('focus', {})` when opening

**New postMessage:**
- [ ] `send('type', payload)` on parent
- [ ] `case 'type':` in iframe message switch

---

**Revised:** ✓