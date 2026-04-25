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

## Obsidian Shortcuts in Monaco — Dynamic Hotkey System

Monaco captures all keyboard events. To allow Obsidian shortcuts (Settings, Command Palette, Delete File) to work inside Monaco, we intercept them and forward to Obsidian via postMessage.

### Why Dynamic?

Users can change Obsidian hotkeys in settings. Monaco keybindings are registered statically at editor creation and cannot be updated. Solution: use `onKeyDown` with `browserEvent.key` to detect actual key presses, compare against current Obsidian hotkey config, and reload editor when hotkeys change.

### Implementation Steps (Example: Command Palette)

#### 1. Declare Global Variable
**Location:** `monacoEditor.html` (line 95)
```javascript
currentCommandPaletteHotkey = null;
```

#### 2. Initialize from Params
**Location:** `monacoEditor.html` → `applyParams()` (line 153)
```javascript
currentCommandPaletteHotkey = params.commandPaletteHotkey || null;
```

#### 3. Read Hotkey from Obsidian
**Location:** `mountCodeEditor.ts` (lines 164-170)
```typescript
import { getObsidianHotkey } from '../utils/hotkeyUtils.ts';

const commandPaletteHotkey = getObsidianHotkey(plugin.app, 'command-palette:open');
const settingsHotkey = getObsidianHotkey(plugin.app, 'app:open-settings');
const deleteFileHotkey = getObsidianHotkey(plugin.app, 'app:delete-file') ?? {
    modifiers: ['Mod'],
    key: 'Delete'
};
```

#### 4. Pass to Monaco via initParams
**Location:** `mountCodeEditor.ts` (lines 181-192)
```typescript
// Apply overrides if they exist (overrides are stored as 'Mod' internally)
const finalCommandPaletteHotkey = parseHotkeyOverride(
    plugin.settings.commandPaletteHotkeyOverride
) ?? commandPaletteHotkey ?? { modifiers: ['Mod'], key: 'p' };

// ... same for settings and delete file
```

#### 5. Intercept Keypress in Monaco
**Location:** `monacoActions.js` → `editor.onKeyDown()` (lines 171-184)
```javascript
if (currentCommandPaletteHotkey && (e.ctrlKey || e.metaKey)) {
    var hk = currentCommandPaletteHotkey;
    var needsShift = hk.modifiers.includes('Shift');
    var needsAlt = hk.modifiers.includes('Alt');
    var keyMatch = key.toLowerCase() === hk.key.toLowerCase();
    if (keyMatch && e.shiftKey === needsShift && e.altKey === needsAlt) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({ type: 'open-obsidian-palette', context: context }, '*');
        return;
    }
}
```

#### 6. Handle Message in Parent
**Location:** `mountCodeEditor.ts` → `onMessage` (lines 425-437)
```typescript
case 'open-obsidian-palette': {
    if (data.context === codeContext) {
        const cmdPalette = plugin.app.internalPlugins.getPluginById('command-palette');
        if (!cmdPalette) break;
        const modal = cmdPalette.instance.modal;
        const old = modal.onClose;
        modal.onClose = () => {
            modal.onClose = old;
            send('focus', {});
        };
        modal.open();
    }
    break;
}
```

#### 7. Add Action for F1 Palette
**Location:** `monacoActions.js` (lines 145-153)
```javascript
editor.addAction({
    id: 'code-files-obsidian-palette',
    label: '🎹 Obsidian Command Palette (Ctrl+P)',
    run: function () {
        window.parent.postMessage(
            { type: 'open-obsidian-palette', context: context },
            '*'
        );
    }
});
```

### Hotkey Change Detection

#### 1. Initialize State on Plugin Load
**Location:** `main.ts` → `onload()` (lines 54-63)
```typescript
const commandPaletteHotkey = getHotkey('command-palette:open') ?? { modifiers: ['Mod'], key: 'p' };
this._lastHotkeys = JSON.stringify({ commandPaletteHotkey });
```

#### 2. Detect Changes on Settings Close
**Location:** `mountCodeEditor.ts` → `open-settings` handler (lines 357-369)
```typescript
case 'open-settings': {
    if (data.context === codeContext) {
        const old = plugin.app.setting.onClose;
        plugin.app.setting.onClose = () => {
            plugin.app.setting.onClose = old;
            setTimeout(() => {
                broadcastHotkeys(plugin);
            }, 200);
            send('focus', {});
        };
        plugin.app.setting.open();
    }
    break;
}
```

#### 3. Broadcast Updates to Inactive Views
**Location:** `broadcast.ts` → `broadcastHotkeys()` (lines 195-203)
```typescript
for (const view of views) {
    if (view.leaf !== activeLeaf && view.editor) {
        view.editor.send('update-hotkeys', {
            commandPaletteHotkey: paletteHotkey,
            settingsHotkey: settingsHotkey,
            deleteFileHotkey: deleteFileHotkey
        });
    }
}
```

#### 4. Receive Update in Monaco
**Location:** `monacoEditor.html` → message listener (lines 327-331)
```javascript
case 'update-hotkeys':
    if (data.commandPaletteHotkey) currentCommandPaletteHotkey = data.commandPaletteHotkey;
    if (data.settingsHotkey) currentSettingsHotkey = data.settingsHotkey;
    if (data.deleteFileHotkey) currentDeleteFileHotkey = data.deleteFileHotkey;
    break;
```

#### 5. Reload Active View
**Location:** `broadcast.ts` → `broadcastHotkeys()` (lines 206-227)
```typescript
for (const view of views) {
    if (view.leaf === activeLeaf && view.file && view.editor) {
        const currentContent = view.editor.getValue();
        view.editor.destroy();
        view.contentEl.empty();
        await view.mountEditor(view.file);
        view.contentEl.append(view.editor!.iframe);
        if (currentContent !== view.data) {
            view.editor!.setValue(currentContent);
        }
        new Notice(`Editor hotkeys reloaded (...)`);
        break;
    }
}
```

### Summary: Files Modified for Each Hotkey

| File | What to Add |
|------|-------------|
| `monacoEditor.html` | Declare global variable (line 95), initialize in `applyParams()` (line 153), handle `update-hotkeys` message (line 327) |
| `monacoActions.js` | Add `onKeyDown` handler (line 171), add `addAction` for F1 palette (line 145) |
| `mountCodeEditor.ts` | Read hotkey with `getObsidianHotkey()` (line 192), pass in `initParams` (line 218), handle postMessage (line 425) |
| `main.ts` | Initialize `_lastHotkeys` (line 63) |
| `broadcast.ts` | Add hotkey to comparison (line 180), broadcast to inactive views (line 199), reload active view (line 229) |

### Behavior

- **Active view:** Reloaded immediately when hotkey changes (preserves content, loses undo/redo)
- **Inactive views:** Updated via `update-hotkeys` message without reload
- **New views:** Get current hotkeys from `initParams` on mount

---

**Revised:** ✓
