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

Monaco captures all keyboard events. To reactivate Obsidian shortcuts, we intercept them in Monaco and forward them to Obsidian via postMessage.

### Dynamic Hotkey Synchronization

**Problem:** Users can change Obsidian hotkeys in settings, but Monaco keybindings are registered statically at editor creation and cannot be updated dynamically.

**Solution:** Automatic detection and view reload when hotkeys change.

#### Implementation

**1. Initialize with Current Hotkeys**
**Location:** `main.ts` → `onload()`
```typescript
// Store initial hotkey state on plugin load
const settingsHotkey = getHotkey('app:open-settings') ?? { modifiers: ['Mod'], key: ',' };
this._lastHotkeys = JSON.stringify({ settingsHotkey });
```

**2. Detect Changes on Settings Close**
**Location:** `mountCodeEditor.ts` → `open-settings` handler
```typescript
case 'open-settings': {
    if (data.context === codeContext) {
        // Patch settings modal onClose to detect hotkey changes
        const old = plugin.app.setting.onClose;
        plugin.app.setting.onClose = () => {
            plugin.app.setting.onClose = old;
            // Wait 200ms for Obsidian to save hotkey changes
            setTimeout(() => {
                void broadcastHotkeys(plugin);
            }, 200);
            send('focus', {});
        };
        plugin.app.setting.open();
    }
    break;
}
```

**3. Reload Active View if Hotkey Changed**
**Location:** `broadcast.ts` → `broadcastHotkeys()`
```typescript
export async function broadcastHotkeys(plugin: CodeFilesPlugin): Promise<void> {
    const settingsHotkey = getHotkey('app:open-settings') ?? { modifiers: ['Mod'], key: ',' };
    const currentHotkeys = JSON.stringify({ settingsHotkey });
    
    // Compare with last known state
    if (currentHotkeys !== plugin._lastHotkeys) {
        plugin._lastHotkeys = currentHotkeys;
        
        const views = getCodeEditorViews(plugin.app);
        const activeLeaf = plugin.app.workspace.activeLeaf;
        
        // Reload active view to apply new hotkeys immediately
        for (const view of views) {
            if (view.leaf === activeLeaf && view.file && view.editor) {
                // Save current content (preserves unsaved changes)
                const currentContent = view.editor.getValue();
                
                // Destroy and remount editor with new hotkeys
                view.editor.destroy();
                view.contentEl.empty();
                await (view as CodeEditorView).mountEditor(view.file);
                view.contentEl.append(view.editor!.iframe);
                
                // Restore content if modified
                if (currentContent !== view.data) {
                    view.editor!.setValue(currentContent);
                }
                break;
            }
        }
    }
}
```

#### Behavior

- **Active view:** Reloaded immediately when hotkey changes (preserves content, loses undo/redo history)
- **Inactive views:** Updated automatically on next activation (via `onLoadFile`)
- **Content preservation:** Unsaved changes are preserved during reload
- **History limitation:** Undo/redo history is lost on reload (Monaco limitation — keybindings cannot be changed without recreating the editor)

#### User Experience

1. User opens Obsidian settings from Monaco (Ctrl+,)
2. User changes the settings hotkey (e.g., Ctrl+, → Alt+Mod+O)
3. User closes settings modal
4. Active Monaco view reloads automatically with new hotkey
5. New hotkey works immediately (Alt+Mod+O opens settings)
6. Inactive views get new hotkeys when user switches to them

### Example: Ctrl+, for Settings
**Location:** `monacoEditor.html`
```javascript
// Initialize hotkeys from params
var currentSettingsHotkey = params.settingsHotkey || { modifiers: ['Mod'], key: ',' };

// Register command with initial hotkey
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Comma, function() {
    window.parent.postMessage({ type: 'open-settings', context: context }, '*');
});
```

**Location:** `mountCodeEditor.ts`
```typescript
case 'open-settings': {
    if (data.context === codeContext) {
        // Patch onClose to detect hotkey changes
        const old = plugin.app.setting.onClose;
        plugin.app.setting.onClose = () => {
            plugin.app.setting.onClose = old;
            setTimeout(() => void broadcastHotkeys(plugin), 200);
            send('focus', {});
        };
        plugin.app.setting.open();
    }
    break;
}
```

---

**Revised:** ✓
