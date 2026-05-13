# Monaco Commands — Guide and Pitfalls

## Summary
Two ways to add Monaco commands: `addCommand()` (keyboard only) vs `addAction()` (context menu + F1). Includes automatic focus handling and common pitfalls.

> See also: [editor-actions.md](editor-actions.md) — overview of all registered actions and hotkey configuration.

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
**Location:** `src/editor/iframe/actions.ts`
Define action with `id`, `label`, `contextMenuGroupId`, and a `run` that calls `window.parent.postMessage()` with a typed message and `getParentOrigin()`.

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
Monaco runs in **isolated iframe**. When a modal opens, Obsidian saves `document.activeElement`. If it's an iframe element, Obsidian calls `element.instanceOf(HTMLElement)` on close — a method that doesn't exist on iframe elements.

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

### 3. Monaco Editor Config Not Updated at Runtime
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

Monaco captures all keyboard events. To allow Obsidian shortcuts (Obsidian settings panel, Command Palette, Delete File) to work inside Monaco, we intercept them and forward to Obsidian via postMessage.

### Why Dynamic?

Users can change Obsidian hotkeys in the Obsidian settings panel. Monaco keybindings are registered statically at editor creation. Solution: `registerHotkeyActions()` disposes and re-registers the affected actions with updated keybindings, and `onKeyDown` with `browserEvent.key` handles in-session key matching independently of keyboard layout.

### Implementation Steps (Example: Command Palette)

#### 1. Declare Module Variable
**Location:** `src/editor/iframe/actions.ts`
`let currentCommandPaletteHotkey: HotkeyConfig | null = null;` — similar variables for settings, deleteFile, console.

#### 2. Initialize from Params
**Location:** `src/editor/iframe/init.ts` → `applyParams()`
Calls `updateHotkeys(params.commandPaletteHotkey, params.settingsHotkey, params.deleteFileHotkey, params.consoleHotkey)`.

#### 3. Read Hotkey from Obsidian
**Location:** `src/editor/mountCodeEditor/buildInitParams.ts`
```typescript
import { getObsidianHotkey } from '../../utils/hotkeyUtils.ts';

const commandPaletteHotkey = getObsidianHotkey(plugin.app, 'command-palette:open');
const settingsHotkey = getObsidianHotkey(plugin.app, 'app:open-settings');
const deleteFileHotkey = getObsidianHotkey(plugin.app, 'app:delete-file') ?? {
    modifiers: ['Mod'],
    key: 'Delete'
};
```

#### 4. Apply Plugin Settings Tab Overrides
**Location:** `src/editor/mountCodeEditor/buildInitParams.ts`
Overrides defined in the plugin settings tab ("Monaco Hotkey Overrides") take priority over Obsidian hotkeys. The console hotkey has no Obsidian fallback — it is read only from the plugin settings tab.
```typescript
const finalCommandPaletteHotkey = parseHotkeyOverride(
    plugin.settings.commandPaletteHotkeyOverride  // set in plugin settings tab
) ?? commandPaletteHotkey ?? { modifiers: ['Mod'], key: 'p' };

// consoleHotkey: no Obsidian fallback
const finalConsoleHotkey = parseHotkeyOverride(plugin.settings.consoleHotkey)
    ?? { modifiers: ['Mod'], key: 'j' };
```

#### 5. Intercept Keypress in Monaco
**Location:** `src/editor/iframe/actions.ts` → `editor.onKeyDown()`
Uses `matchesHotkey(e, currentCommandPaletteHotkey)` — checks `browserEvent.key` (actual character, layout-independent) against the stored config. Same pattern for settings, deleteFile, console.

#### 6. Handle Message in Parent
**Location:** `mountCodeEditor.ts` → `onMessage`
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

#### 7. Register Action for F1 Palette
**Location:** `src/editor/iframe/actions.ts` → `registerHotkeyActions()`
Uses `editor.addAction()` with the keybinding bitmask from `hotkeyToMonacoKeybinding()`. Disposables are stored in `hotkeyActionDisposables[]` for re-registration on update.

### Hotkey Change Detection

#### 1. Initialize State on Plugin Load
**Location:** `main.ts` → `onload()`
`plugin._lastHotkeys` stores a JSON snapshot of all four resolved hotkeys for change detection.

#### 2. Detect Changes on Obsidian Settings Panel Close
**Location:** `mountCodeEditor.ts` → `open-settings` handler
Patches `plugin.app.setting.onClose` to call `broadcastHotkeys(plugin)` with a short delay after the Obsidian settings panel closes.

#### 3. Broadcast Updates
**Location:** `src/utils/broadcast.ts` → `broadcastHotkeys()`
Sends `update-hotkeys` (all four hotkeys including `consoleHotkey`) to **all** open views. Skips broadcast if the JSON snapshot hasn't changed.

#### 4. Receive Update in Monaco
**Location:** `src/editor/iframe/init.ts` → `case 'update-hotkeys'`
Calls `updateHotkeys()` with all four keys, then `registerHotkeyActions({ commandPalette, settings, deleteFile, console })` to dispose and re-register actions with updated keybindings. No editor reload required.

### Summary: Files Modified for Each Hotkey

| File | What to Add |
|------|-------------|
| `src/editor/iframe/init.ts` | Initialize hotkeys in `applyParams()`, handle `update-hotkeys` message |
| `src/editor/iframe/actions.ts` | `onKeyDown` handler, `registerHotkeyActions()` with disposables |
| `src/editor/mountCodeEditor/buildInitParams.ts` | Read hotkeys via `getObsidianHotkey()`, apply plugin settings tab overrides, pass in `initParams` |
| `main.ts` | Initialize `_lastHotkeys` |
| `src/utils/broadcast.ts` | JSON comparison, broadcast to all views |

### Behavior

- **All views:** Updated via `update-hotkeys`, actions re-registered via `registerHotkeyActions()` (no reload, undo/redo preserved).
- **New views:** Get current hotkeys from `initParams` on mount.

---

**Revised:** ✓
