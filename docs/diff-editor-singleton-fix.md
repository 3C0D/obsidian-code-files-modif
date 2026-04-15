# Monaco Diff Editor — Singleton Pattern Fix

## Summary
Fixed "InstantiationService has been disposed" error by implementing singleton pattern for diff editor. Create once, reuse, never dispose the editor itself.

## Problem
After adding Prettier formatting, critical error appeared:
```
Uncaught Error: InstantiationService has been disposed
```

**Trigger:** Open diff modal → close → right-click in main editor

## Root Cause
Monaco uses **global `StandaloneServices` singleton** shared between all editors in iframe. Disposing diff editor corrupts shared services, breaking main editor's context menu.

**Buggy approach:**
```js
var diffEditor = monaco.editor.createDiffEditor(container, options);
// ...
closeBtn.onclick = function() {
    diffEditor.dispose(); // ← BREAKS shared services
    overlay.remove();
};
```

## Failed Attempts
1. **Dispose only models** — models still attached to editor
2. **`contextmenu: false`** — doesn't affect service sharing
3. **Block contextmenu events** — problem is main editor, not diff
4. **150ms delay** — doesn't solve service sharing

## Solution: Singleton Pattern

### Implementation
**Location:** `monacoEditor.html`

```js
// Global variables
var diffEditorInstance = null;
var diffOverlayEl = null;

function openDiffModal(original, formatted) {
    // Create once, reuse forever
    if (!diffOverlayEl) {
        diffOverlayEl = document.createElement('div');
        diffOverlayEl.className = 'diff-overlay';
        // ... create toolbar, container
        document.body.appendChild(diffOverlayEl);
        
        // Created once, never disposed
        diffEditorInstance = monaco.editor.createDiffEditor(container, options);
    }
    
    // Show overlay
    diffOverlayEl.style.display = 'block';
    
    // CRITICAL: Detach before disposing
    var oldModel = diffEditorInstance.getModel();
    if (oldModel) {
        diffEditorInstance.setModel(null); // 1. Detach first
        oldModel.original?.dispose();      // 2. Then dispose
        oldModel.modified?.dispose();
    }
    
    // Attach new models
    diffEditorInstance.setModel({
        original: monaco.editor.createModel(original, currentLang),
        modified: monaco.editor.createModel(formatted, currentLang)
    });
}

function closeDiffModal() {
    if (diffOverlayEl) diffOverlayEl.style.display = 'none';
}
```

### CSS
```css
.diff-overlay {
    display: none; /* Hidden by default */
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
}
```

## Key Points

### 1. Single Creation
Diff editor created **once** on first call, reused for all subsequent calls.

### 2. Show/Hide via CSS
Use `display: block/none` instead of creating/destroying overlay.

### 3. Critical Model Order
```js
diffEditorInstance.setModel(null);  // 1. Detach first
oldModel.original?.dispose();        // 2. Then dispose
```
**Why:** Disposing attached models causes internal Monaco errors.

### 4. Never Dispose Editor
Diff editor stays in memory for iframe lifetime. Only models are disposed/recreated.

### 5. StandaloneServices Stability
Keeping diff editor alive preserves shared services, main editor context menu works.

## Benefits
- **No InstantiationService error** — singleton never corrupted
- **Better performance** — no recreation on each opening
- **Simpler logic** — less creation/destruction
- **No memory leaks** — models properly disposed

## Lesson Learned
**Monaco shares internal services between all editors in same context.** Creating/destroying editors can corrupt shared singleton.

**General rule:** For secondary editors (diff, modal, etc.), use **singleton pattern**: create once, reuse, never dispose editor itself.

---

**Revised:** ✓