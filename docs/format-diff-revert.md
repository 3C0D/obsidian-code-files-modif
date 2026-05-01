# Format Diff Revert

## Summary
After formatting, view side-by-side diff with selective revert. Users can revert individual blocks or all changes. Uses Monaco's native diff editor with custom revert widgets.

## Features
- **Diff viewer** — original vs formatted side-by-side
- **Revert All** — toolbar button, undoes all formatting
- **Per-block revert** — hover-activated "↩ Revert" buttons in right pane

## Implementation

### Key Files
- `monacoEditor.html` — `openDiffModal()`, `buildRevertWidgets()`, revert logic
- `monacoHtml.css` — diff overlay, toolbar, widget styles
- `src/editor/iframe/config.ts` — `DIFF_EDITOR_OPTIONS` config

**Location:** `src/editor/iframe/config.ts`
```js
var DIFF_EDITOR_OPTIONS = {
    readOnly: true,              // Prevent direct edits
    renderSideBySide: true,      // Side-by-side view
    automaticLayout: true,
    ignoreTrimWhitespace: false  // Show whitespace changes
};
```

#### State Management
**Location:** `monacoEditor.html`
```js
var diffEditorInstance = null;  // Monaco DiffEditor singleton
var revertWidgets = [];         // ContentWidget instances
var lastFormatOriginal = null;  // Pre-format content
var lastFormatFormatted = null; // Post-format content
```

#### Per-Block Revert Widgets
**Function:** `buildRevertWidgets()`
1. Gets diff hunks via `diffEditorInstance.getLineChanges()`
2. Creates `ContentWidget` for each change
3. Positions at modified line in right pane
4. Adds hover behavior via `onMouseMove`

#### Revert Logic
**Function:** `revertBlock(change)`
1. Extracts original lines from original model
2. Replaces range in modified model using `pushEditOperations`
3. Updates main editor with `editor.setValue()`
4. Rebuilds widgets for new diff state

### Widget Structure
```js
var widget = {
    getId: function() { return 'revert-widget-' + idx; },
    getDomNode: function() { return domNode; },
    getPosition: function() {
        return {
            position: { lineNumber: targetLine, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
        };
    }
};
```

### Hover Behavior
```js
modifiedEditor.onMouseMove(function(e) {
    if (e.target.position && 
        e.target.position.lineNumber >= change.modifiedStartLineNumber && 
        e.target.position.lineNumber <= change.modifiedEndLineNumber) {
        domNode.style.opacity = '1';
    } else {
        domNode.style.opacity = '0';
    }
});
```

## Styling

### Overlay & Toolbar
```css
.diff-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
}
.diff-toolbar {
    position: absolute; top: 0; height: 40px;
    display: flex; justify-content: flex-end;
}
```

### Revert Widgets
```css
.diff-revert-widget {
    position: absolute; right: 8px;
    background: var(--color-red, #c0392b);
    opacity: 0; transition: opacity 0.12s;
    pointer-events: none;
}
.diff-revert-widget:hover {
    opacity: 1 !important;
    pointer-events: auto;
}
```

## User Flow
1. Format file (Shift+Alt+F)
2. Diff icon appears in tab header (10s)
3. Click icon → diff viewer opens
4. Hover over changes → revert buttons appear
5. Click per-block revert or "Revert All"

## Known Limitations
- **Memory leaks:** `onMouseMove` listeners not disposed
- **Widget positioning:** Right pane only (not left like VS Code)
- **No auto-close:** Diff doesn't close when all blocks reverted

---

**Revised:** ✓