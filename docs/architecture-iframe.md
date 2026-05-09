# Monaco Iframe Architecture

## Overview

The `src/editor/iframe/` folder contains the isolated Monaco application embedded inside the editor iframe.

The parent Obsidian view and the iframe communicate through `postMessage`:

- the parent sends initialization and runtime update messages
- the iframe owns Monaco, the integrated console UI, the formatters, and the diff modal
- the iframe sends user actions and editor state changes back to the parent

`init.ts` is the orchestration entry point. It initializes Monaco, wires the modules together, and dispatches incoming messages to the right submodule.

---

## File Tree

```text
src/editor/iframe/
├── actions.ts
├── console.ts
├── diff.ts
├── formatters.ts
├── init.ts
├── utils.ts
└── types/
    ├── console.ts
    ├── index.ts
    ├── types.ts
    └── variables.ts
```

---

## Module Responsibilities

### `init.ts`

Central orchestrator for the iframe application.

- sends the initial `ready` message to the parent
- receives the `init` payload and applies `InitParams`
- creates the Monaco model and editor instance
- applies theme, language, diagnostics, project root, and runtime config
- initializes shared state in other modules
- registers actions, formatters, diff support, and console support
- dispatches subsequent parent messages such as `change-value`, `change-theme`, `update-hotkeys`, `load-project-files`, and console messages

### `actions.ts`

Editor-level commands, actions, and dynamic keyboard handling.

- registers Monaco actions shown in menus or command palette
- handles save, format, show diff, settings, command palette, delete file, and console toggle actions
- translates matching shortcuts and actions into `postMessage` calls to the parent
- stores per-iframe action state such as `editor`, `context`, `formatOnSave`, and current hotkeys

### `formatters.ts`

Formatting provider registration.

- registers Monaco formatting providers per language
- uses Prettier standalone for many languages
- uses dedicated formatters for specific languages when needed
- updates format diff state directly for non-standard formatter flows

### `diff.ts`

Diff modal and selective revert system.

- stores the last `original` / `formatted` pair
- opens and closes the Monaco diff editor modal
- builds revert widgets for individual diff hunks
- syncs reverted or modified diff content back into the main editor

### `console.ts`

Integrated terminal-like panel inside the iframe.

- initializes the console UI and DOM event listeners
- handles input, history, stdin mode, paste, drag-and-drop, and resize
- emits process-related messages to the parent
- receives console state/output messages from the parent via `handleConsoleMessage()`

### `utils.ts`

Shared helpers used across iframe modules.

- stores the parent origin after `init` for safe `postMessage` targeting
- exposes `throttle()` for UI operations such as resize/layout updates

### `types/types.ts`

Main iframe type definitions and global declarations.

- defines `InitParams`, `EditorConfig`, `HotkeyConfig`, `ProjectFile`, and `PrettierOptions`
- declares global runtime objects injected before Monaco starts

### `types/console.ts`

Console message contracts.

- defines message shapes exchanged between iframe and parent for terminal features

### `types/variables.ts`

Runtime constants and mutable shared config values.

- diff editor options
- format timeout
- mutable Prettier settings used at runtime

### `types/index.ts`

Public barrel file for iframe modules.

- re-exports the iframe types and runtime variables
- now also acts as the direct import surface for shared runtime config used by `init.ts`, `diff.ts`, and `formatters.ts`

---

## Communication Model

### Parent -> iframe

Main messages include:

- `init`
- `change-value`
- `change-language`
- `change-theme`
- `change-editor-config`
- `change-options`
- `change-word-wrap`
- `change-background`
- `focus`
- `scroll-to-position`
- `trigger-show-diff`
- `update-hotkeys`
- `load-project-files`
- console-specific messages

### Iframe -> parent

Main messages include:

- `ready`
- `change`
- `save-document`
- `open-file`
- `format-diff-available`
- `open-obsidian-palette`
- `open-settings`
- `delete-file`
- `toggle-console`
- console-specific messages
- UI state notifications such as word wrap or console height/visibility changes

---

## Shared State Strategy

The iframe does not use a centralized store.

Instead, each module owns a small module-level state and `init.ts` wires them together explicitly through setup functions such as:

- `setSharedState(...)`
- `setFormatterContext(...)`
- `setActionsState(...)`
- `updateHotkeys(...)`

This keeps modules isolated while still allowing controlled shared context.

---

## Summary

The iframe is a self-contained Monaco mini-application:

- `init.ts` orchestrates everything
- `actions.ts` handles editor interactions
- `formatters.ts` handles formatting
- `diff.ts` handles diff/revert UI
- `console.ts` handles the integrated terminal
- `utils.ts` and `types/` provide the supporting infrastructure

The parent remains responsible for plugin-level actions and persistence, while the iframe owns the local interactive editing experience.
