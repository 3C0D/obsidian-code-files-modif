# Explorer Shortcuts Relay

## Summary

The Explorer Shortcuts Relay is an isolated feature that allows the third-party plugin `obsidian-explorer-shortcuts` (and similar plugins) to receive keyboard events when the user has focus inside a Monaco editor iframe opened by Code Files.

Because Monaco runs in a sandboxed iframe, native keyboard events never bubble to Obsidian's `document`. This module provides a clean, opt-in bridge using `postMessage` + synthetic `KeyboardEvent` dispatch, with strong isolation guarantees.

## Problem Context

- `explorer-shortcuts` listens for `Space + key` combinations on `document` in the capture phase.
- When focus is inside a Code Files Monaco editor, those events are trapped inside the iframe.
- Previous solutions either required coupling between plugins or polluted core files (`actions.ts`).

## Goals

- Zero impact when `explorer-shortcuts` is not installed.
- Zero impact on non-Desktop platforms.
- Clean separation: all relay logic lives in dedicated modules.
- Correct focus management after shortcut activation.
- Robust state reset when the editor loses focus.

## Architecture

Two symmetric modules were introduced:

| Side     | File                                              | Responsibility |
|----------|---------------------------------------------------|----------------|
| Parent   | `src/editor/mountCodeEditor/explorerShortcutsRelay.ts` | Hover tracking + key relay dispatch + focus transfer |
| Iframe   | `src/editor/iframe/explorerShortcutsRelay.ts`      | Key interception + `postMessage` relay |

### Activation Guard

Both sides are guarded by a single function:

```ts
isExplorerShortcutsEnabled(app)
```

This returns `true` only when:
- Running on Desktop (`Platform.isDesktop`)
- The plugin `explorer-shortcuts` appears in `app.plugins.enabledPlugins`

If the guard is false, **no** `mousemove` listener is installed on the parent document and **no** relay logic runs inside the iframe.

### Data Flow

1. Parent detects mouse over file explorer → sends `explorer-hover` message to iframe.
2. Iframe receives hover state.
3. When user presses `Space` while hover is active → iframe intercepts the key (`preventDefault` + `stopPropagation`), records state (`spaceDown`, `interceptedKeys`), and sends `keydown-relay`.
4. Parent receives relay message → dispatches synthetic `KeyboardEvent` on `document` → `explorer-shortcuts` reacts.
5. For follow-up keys (anything except Space) → parent automatically moves focus back to the file explorer.
6. On `keyup` of any tracked key → relay continues so the third-party plugin receives the complete sequence.
7. If Monaco loses focus (blur) → relay state is reset (`onDidBlurEditorWidget`).

## Key Design Decisions

- **Two separate relay modules** (one per side) instead of one shared file, because the environments are completely different (Obsidian API vs pure Monaco + postMessage).
- **State lives only in the iframe module** (`spaceDown`, `interceptedKeys`, `enableRelay`, `explorerHover`) because that is where the decision to intercept keys is made.
- **Focus transfer only for follow-up keys** (not Space itself) to avoid breaking normal typing when the mouse happens to be over the explorer.
- **Blur reset** as a safety net: if the user clicks away or focus moves for any reason, the relay state is cleared so the next Space press works correctly.
- **No changes to core hotkey system** (`actions.ts` hotkey matching for Obsidian commands remains untouched).

## Files Added

- `src/editor/mountCodeEditor/explorerShortcutsRelay.ts`
- `src/editor/iframe/explorerShortcutsRelay.ts`

## Files Modified

- `src/editor/mountCodeEditor/messageHandler.ts` — now only delegates to `handleKeyRelayMessage` and conditionally installs the hover tracker.
- `src/editor/mountCodeEditor/buildInitParams.ts` — passes `enableExplorerShortcuts` flag.
- `src/editor/iframe/init.ts` — wires the new relay registration and the enable flag.
- `src/editor/iframe/actions.ts` — completely cleaned of relay logic (returned to pure state).
- `src/types/types.ts` and `src/editor/iframe/types/types.ts` — added `enableExplorerShortcuts` (and `consoleHotkey` for consistency).

## Message Types Introduced

- `explorer-hover` (parent → iframe)
- `keydown-relay` / `keyup-relay` (iframe → parent)

These are defined in `src/types/iframeMessages.ts` and handled before context validation because they are not file-specific.

## Robustness Measures

- `interceptedKeys` Set ensures every key we blocked on `keydown` also gets its `keyup` relayed.
- `onDidBlurEditorWidget` reset prevents stuck `spaceDown` state.
- Conditional activation based on real plugin presence (no magic strings in production code for normal users).

## Future Considerations

- If more third-party plugins need similar relay capabilities, the `handleKeyRelayMessage` function can be generalized or the hover detection made configurable.
- Performance: one `mousemove` listener per open editor when the feature is enabled (acceptable because the listener is extremely cheap and only fires on actual mouse movement).

---

This document follows the project's documentation guidelines (see `docs/Rules-doc.md`).
