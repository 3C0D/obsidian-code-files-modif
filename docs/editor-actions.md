# Editor Actions and Context Menu

## Summary

Custom actions registered in Monaco Editor via `editor.addAction()`. They appear in the right-click context menu under the `code-files` group and in the F1 command palette. Some actions have fixed keybindings; others mirror configurable Obsidian hotkeys.

> See also: [monaco-commands.md](monaco-commands.md) — implementation guide and pitfalls.

---

## Registration Mechanisms

All actions are registered in `registerActions()` — `src/editor/iframe/actions.ts`. Each action defines an `id`, a `label` (with emoji), `contextMenuGroupId: 'code-files'`, a `contextMenuOrder`, an optional `keybindings` array, and a `run` function that posts a message to the parent window via `window.parent.postMessage()`.

Three registration patterns are used:

- `addAction` with `contextMenuGroupId` — context menu + F1 palette + optional keybinding display.
- `addAction` without `contextMenuGroupId` — F1 palette only.
- `addCommand` — keybinding only, no menu or palette entry.

### Dynamic Actions (Hotkeys)

Some actions use shortcuts configurable via Obsidian hotkeys (and overridable via the plugin settings tab). They are managed by:

1. `registerHotkeyActions()` — registers actions with their initial keybindings.
2. `updateHotkeys()` — updates stored hotkey values on configuration change.
3. `editor.onKeyDown()` — layout-independent fallback for dynamic shortcut matching.

---

## Hotkey Conversion

Obsidian hotkeys are converted to Monaco keybinding bitmasks via `hotkeyToMonacoKeybinding()` in `src/editor/iframe/keybindingUtils.ts`: maps keys (letters, digits, F-keys, punctuation, navigation) to Monaco `KeyCode` values, then combines with modifiers (Ctrl/Cmd, Shift, Alt).

---

## Two Types of Configurable Shortcuts

### Obsidian-linked (overridable)

These three shortcuts read their default value from Obsidian's hotkey configuration, but can be overridden in the plugin settings tab under "Monaco Hotkey Overrides". Displayed as "(Obsidian default)" in the plugin settings tab UI when no override is set.

| Action | Obsidian command ID | Default |
|--------|-------------------|---------|
| Command Palette | `command-palette:open` | Ctrl+P |
| Settings | `app:open-settings` | Ctrl+, |
| Delete File | `app:delete-file` | Ctrl+Delete |

### Direct (plugin settings tab only)

This shortcut has no Obsidian equivalent. It is set directly in the plugin settings tab and is not linked to any Obsidian command.

| Action | Default |
|--------|---------|
| Open Console | Ctrl+J |

Overrides are stored internally as `Mod+Key` (`Mod` = Ctrl on Windows/Linux, Cmd on Mac) and displayed with the platform-specific modifier in the plugin settings tab UI.

---

## Available Actions

| Order | Label | Keybinding | Notes |
|-------|-------|------------|-------|
| — | ↩️ Return to Default View | — | Only for unregistered extensions |
| 0.4 | ↔ Toggle Word Wrap | Alt+Z | Persists setting |
| 0.5 | 📝 Format Document | Shift+Alt+F | |
| 0.6 | ⟷ Show Format Diff | — | Shows last format diff |
| 1 | 🍋🟩 Rename Extension | — | |
| 2 | 🍒 Change Theme | — | |
| 3 | 📐 Formatter Config | — | |
| 4 | 🗑️ Delete File | Obsidian-linked, overridable | |
| 5 | 🖥️ Open Console | Direct, configurable (default Ctrl+J) | |
| 6 | 💾 Save | Ctrl+S | Runs format first if `formatOnSave` is set in Monaco editor config |
| — | 🎹 Obsidian Command Palette | Obsidian-linked, overridable | |
| — | 🔧 Obsidian Settings | Obsidian-linked, overridable | |

All actions communicate with Obsidian via `window.parent.postMessage()`.

---

## Dynamic Update Flow

1. `getObsidianHotkey()` reads the active shortcut for a given Obsidian command ID.
2. `parseHotkeyOverride()` parses any override set in the plugin settings tab; takes priority over Obsidian's value.
3. Final hotkeys are sent to the iframe via the `init` message (on mount) or `update-hotkeys` (after the Obsidian settings panel closes).
4. In the iframe, `updateHotkeys()` stores the current values; `registerHotkeyActions()` disposes previous registrations and re-registers with updated keybindings — no editor reload required.
5. `broadcastHotkeys()` (`src/utils/broadcast.ts`) detects changes via JSON comparison on `plugin._lastHotkeys` and sends `update-hotkeys` to all open editors.
6. `editor.onKeyDown()` provides a layout-independent fallback using `browserEvent.key` for all four configurable hotkeys.
