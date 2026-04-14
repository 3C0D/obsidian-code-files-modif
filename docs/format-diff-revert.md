# Format Diff Revert

## Overview

This document describes the selective revert feature in the format diff viewer. After formatting a file, users can view changes in a side-by-side diff and selectively revert individual blocks or all changes at once.

---

## Features

### Diff Viewer

When a file is formatted, the plugin captures the original and formatted versions. Users can open a side-by-side diff viewer showing:

- **Original code** (left pane) — pre-format state
- **Formatted code** (right pane) — post-format state
- **Inline diff markers** — Monaco's native diff highlighting

### Revert Controls

**Revert All Button** — Located in the diff toolbar, reverts all formatting changes and closes the diff viewer.

**Per-Block Revert Widgets** — Hover-activated "↩ Revert" buttons appear next to each changed block in the modified (right) pane. Clicking one reverts only that specific change.

---

## Implementation

### Files Modified

| File | Purpose |
|------|--------|
| `monacoEditor.html` | Core diff logic: `openDiffModal`, `buildRevertWidgets`, `revertBlock`, `revertAll` |
| `monacoHtml.css` | Styles for diff overlay, toolbar, and revert widgets |
| `monacoHtml.js` | Diff editor configuration (`DIFF_EDITOR_OPTIONS`) |

### Key Components

#### 1. Diff Editor Configuration

Defined in `monacoHtml.js`:

```js
var DIFF_EDITOR_OPTIONS = {
    readOnly: true,              // Prevent user edits in diff view
    renderSideBySide: true,      // Side-by-side comparison
    automaticLayout: true,       // Auto-resize on container changes
    ignoreTrimWhitespace: false  // Show whitespace changes
};
```

**Note:** `readOnly: true` prevents direct editing in the diff viewer. The `revertBlock` function works by applying changes to the main editor model, not the diff editor models.

#### 2. State Management

Global variables in `monacoEditor.html`:

```js
var diffEditorInstance = null;  // Monaco DiffEditor singleton
var diffOverlayEl = null;       // Overlay DOM element
var revertWidgets = [];         // Array of active ContentWidget instances
var lastFormatOriginal = null;  // Pre-format content
var lastFormatFormatted = null; // Post-format content
```

#### 3. Opening the Diff Viewer

The `openDiffModal` function:

1. Creates the overlay and toolbar on first call
2. Creates a Monaco `DiffEditor` instance
3. Sets up "Revert All" and "Close" buttons
4. Creates two models (original and modified) with the current language
5. Calls `buildRevertWidgets` to add per-block revert buttons

#### 4. Per-Block Revert Widgets

The `buildRevertWidgets` function:

1. Calls `diffEditorInstance.getLineChanges()` to get all diff hunks
2. For each change, creates a `ContentWidget` positioned at the modified line
3. Adds hover behavior via `onMouseMove` listener
4. Widget becomes visible when hovering over the changed lines

**Widget Structure:**

```js
var widget = {
    getId: function () { return 'revert-widget-' + idx; },
    getDomNode: function () { return domNode; },
    getPosition: function () {
        return {
            position: { lineNumber: targetLine, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
        };
    }
};
```

The widget is added to the **modified editor** (right pane) using `addContentWidget`.

#### 5. Reverting a Block

The `revertBlock` function:

1. Extracts original lines from the original model using `change.originalStartLineNumber` and `change.originalEndLineNumber`
2. Defines the range in the modified model to replace
3. Uses `pushEditOperations` to apply the change
4. Updates the main editor with `editor.setValue(modifiedModel.getValue())`
5. Updates `lastFormatFormatted` to reflect the partial revert
6. Rebuilds widgets to reflect the new diff state

**Technical Detail:** Since `readOnly: true` is set on the diff editor, `pushEditOperations` works because it's called on the model directly, not through user input.

#### 6. Reverting All Changes

The `revertAll` function:

1. Restores the main editor to `lastFormatOriginal`
2. Closes the diff viewer

This is a simple full restore, no partial logic needed.

#### 7. Hover Behavior

Each widget registers an `onMouseMove` listener on the modified editor:

```js
modifiedEditor.onMouseMove(function (e) {
    if (e.target.position && 
        e.target.position.lineNumber >= change.modifiedStartLineNumber && 
        e.target.position.lineNumber <= change.modifiedEndLineNumber) {
        domNode.style.opacity = '1';
        domNode.style.pointerEvents = 'auto';
    } else {
        domNode.style.opacity = '0';
        domNode.style.pointerEvents = 'none';
    }
});
```

**Limitation:** These listeners are not explicitly disposed, which could cause memory leaks if the diff viewer is opened/closed repeatedly. A future improvement would be to store disposables and clean them up in `closeDiffModal`.

---

## Styling

Defined in `monacoHtml.css`:

### Overlay

```css
.diff-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
}
```

### Toolbar

```css
.diff-toolbar {
    position: absolute;
    top: 0;
    height: 40px;
    display: flex;
    justify-content: flex-end;
}
```

### Revert All Button

```css
.diff-revert-all-btn {
    background: var(--color-orange, #e07b00);
    color: #fff;
    border-radius: 4px;
    transition: opacity 0.15s;
}
```

### Per-Block Revert Widget

```css
.diff-revert-widget {
    position: absolute;
    right: 8px;
    background: var(--color-red, #c0392b);
    color: #fff;
    opacity: 0;
    transition: opacity 0.12s;
    pointer-events: none;
}
.diff-revert-widget:hover {
    opacity: 1 !important;
    pointer-events: auto;
}
```

The widget starts invisible (`opacity: 0`) and becomes visible on hover.

---

## User Flow

1. User formats a file (Shift+Alt+F or formatOnSave)
2. Plugin captures original and formatted content
3. A diff icon appears in the tab header for 10 seconds
4. User clicks the diff icon or uses "Show Format Diff" from context menu
5. Diff viewer opens with side-by-side comparison
6. User hovers over changed blocks to reveal "↩ Revert" buttons
7. User can:
   - Click a per-block revert button to undo that specific change
   - Click "Revert All" to undo all formatting
   - Click "Close" to keep the formatted version

---

## Known Limitations

1. **Memory Leaks:** `onMouseMove` listeners are not disposed when closing the diff viewer
2. **Widget Positioning:** ContentWidgets are positioned on the modified (right) pane, not the original (left) pane like VS Code
3. **Pure Insertions:** When the formatter adds new lines (originalStartLineNumber = 0), the widget positioning uses `modifiedStartLineNumber`, which may not be ideal
4. **No Auto-Close:** If all blocks are reverted individually, the diff viewer doesn't automatically close

---

## Future Improvements

1. **Use GlyphMarginWidget:** If Monaco version ≥ 0.44, use `addGlyphMarginWidget` for proper gutter positioning
2. **Dispose Listeners:** Store `onMouseMove` disposables and clean them up in `closeDiffModal`
3. **Auto-Close on Full Revert:** Detect when all changes have been reverted and close the diff viewer automatically
4. **domReadOnly Instead of readOnly:** Use `domReadOnly: true` to allow programmatic edits while blocking user input, enabling direct edits in the diff viewer models
