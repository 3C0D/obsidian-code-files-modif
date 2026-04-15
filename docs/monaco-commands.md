# Monaco Commands — Guide and Pitfalls

## Summary
Two ways to add Monaco commands: `addCommand()` (keyboard only) vs `addAction()` (context menu + F1). Includes automatic focus handling and common pitfalls.

## Command Types

### `editor.addCommand(keybinding, handler)`
- **Keyboard shortcut only**
- **No UI visibility** (context menu, F1 palette)
- Use for shortcuts without visible actions

### `editor.addAction(descriptor)` ✓ Preferred
- **Full action** with context menu + F1 palette
- **Optional keybinding**
- Complete UI integration

```javascript
editor.addAction({
    id: 'code-files-my-action',
    label: 'My Action',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.9,
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyX],
    run: function() {
        window.parent.postMessage({ type: 'my-action', context: context }, '*');
    }
});
```

## Complete Command Flow

```
Monaco iframe → addAction.run() → postMessage → mountCodeEditor.ts → Obsidian modal
```

### 1. Monaco Action
**Location:** `monacoEditor.html`
```javascript
editor.addAction({
    id: 'code-files-my-action',
    label: 'My Action',
    contextMenuGroupId: 'navigation',
    run: function() {
        window.parent.postMessage({ type: 'my-action', context: context }, '*');
    }
});
```

### 2. Message Handler
**Location:** `mountCodeEditor.ts`
```typescript
case 'my-action': {
    if (data.context === codeContext) {
        new MyModal(plugin, ...).open();
    }
    break;
}
```

## Focus Handling — Automatic via modalPatch

### The Problem
Monaco runs in **isolated iframe**. When modal opens, Obsidian saves `document.activeElement`. If it's an iframe element, Obsidian calls `element.instanceOf(HTMLElement)` on close — a method that doesn't exist on iframe elements.

**Result:** `TypeError: n.instanceOf is not a function`

### The Solution
**Location:** `modalPatch.ts` (applied in `main.ts`)

```typescript
proto.open = function(...args: unknown[]) {
    const active = document.activeElement;
    if (active?.tagName === 'IFRAME') {
        (active as HTMLElement).blur();
        document.body.focus();
    }
    return original.apply(this, args);
};
```

**Benefits:**
- **No manual blur() needed**
- **Works for all modals** (including third-party)
- **Applied once** on plugin load
- **Automatic crash prevention**

## Common Pitfalls

### 1. Modal Crash on Close ✓ Fixed
**Cause:** iframe elements lack `instanceOf` method
**Solution:** `modalPatch` handles automatically

### 2. Command Executes Only Once
**Cause:** `codeContext` mismatch after file rename
**Solution:** Implement `onRename()` in `CodeEditorView`
```typescript
async onRename(file: TFile): Promise<void> {
    super.onRename(file);
    this.codeEditor?.destroy();
    this.contentEl.empty();
    // Mount new editor with correct context
    this.codeEditor = await mountCodeEditor(...);
}
```

### 3. Config Not Updated at Runtime
**Cause:** `initParams` sent only once at initialization
**Solution:** Send dedicated update messages
```typescript
// Parent side
send('change-editor-config', { config: newConfigJson });

// iframe side
case 'change-editor-config':
    var cfg = JSON.parse(data.config);
    editor.updateOptions({ tabSize: cfg.tabSize });
    break;
```

## Obsidian Shortcuts in Monaco

Monaco captures all keyboard events. To reactivate Obsidian shortcuts:

### Example: Ctrl+, for Settings
**Location:** `monacoEditor.html`
```javascript
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Comma, function() {
    window.parent.postMessage({ type: 'open-settings', context: context }, '*');
});
```

**Location:** `mountCodeEditor.ts`
```typescript
case 'open-settings': {
    if (data.context === codeContext) {
        plugin.app.setting.open();
    }
    break;
}
```

---

**Revised:** ✓