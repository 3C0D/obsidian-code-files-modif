# Monaco Diff Editor — Singleton Pattern Fix

## Files Modified

- **`src/editor/monacoEditor.html`** — singleton pattern implementation in `openDiffModal()`
- **`src/types/monacoHtml.css`** — added `display: none` to `.diff-overlay`

---

## Problem

After adding Prettier formatting for TypeScript/JavaScript, a critical error appeared:

```
Uncaught Error: InstantiationService has been disposed
```

**Trigger:** Open the diff modal (diff button after formatting), close the modal, then right-click in the main editor.

**Stack trace:**
```
at _onContextMenu (editor.api-CalNCsUg.js:52)
at emitContextMenu (editor.api-CalNCsUg.js:55)
at InstantiationService (editor.api-CalNCsUg.js:893)
```

---

## Root Cause

Monaco Editor uses a **global `StandaloneServices` singleton** shared between all editor instances in the same JavaScript context (iframe). This singleton contains the `InstantiationService` which manages the creation of Monaco's internal services.

**Initial (buggy) approach:**

```js
function openDiffModal(original, formatted) {
    var overlay = document.createElement('div');
    // ... création de l'overlay et du container
    
    var diffEditor = monaco.editor.createDiffEditor(container, options);
    diffEditor.setModel({ original, modified });
    
    closeBtn.onclick = function() {
        overlay.remove();
        diffEditor.dispose(); // ← PROBLÈME ICI
    };
}
```

**Why it breaks:**

1. `monaco.editor.createDiffEditor()` creates a diff editor that **shares** the `StandaloneServices` with the main editor
2. When calling `diffEditor.dispose()`, Monaco disposes **all shared services**, including the `InstantiationService`
3. The main editor ends up with a dead `InstantiationService`
4. On the next right-click, Monaco tries to use this service to create the context menu → error

---

## Fix Attempts (Ineffective)

### Attempt 1: Dispose only the models

```js
closeBtn.onclick = function() {
    var model = diffEditor.getModel();
    if (model) {
        model.original?.dispose();
        model.modified?.dispose();
    }
    overlay.remove();
    diffEditor = null;
};
```

**Result:** Error persists. Disposing models while they're still attached to the editor causes internal issues.

### Attempt 2: Add `contextmenu: false`

```js
var DIFF_EDITOR_OPTIONS = {
    readOnly: true,
    renderSideBySide: true,
    automaticLayout: true,
    ignoreTrimWhitespace: false,
    contextmenu: false // ← inefficace
};
```

**Result:** Ineffective. This option disables the main editor's context menu, but the diff editor has its own instantiation cycle and ignores this option.

### Attempt 3: Block contextmenu event at DOM level

```js
container.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
}, true);
```

**Result:** Ineffective. The problem isn't the diff editor's context menu, but the main editor's menu after closing the diff.

### Attempt 4: 150ms delay before opening the diff

```js
case 'trigger-show-diff':
    if (lastFormatOriginal && lastFormatFormatted) {
        setTimeout(function() {
            openDiffModal(lastFormatOriginal, lastFormatFormatted);
        }, 150);
    }
    break;
```

**Result:** Ineffective. The delay doesn't solve the service sharing problem.

---

## Solution: Singleton Pattern

**Principle:** Create the diff editor **once** on first call, then **reuse it** for all subsequent calls. Never dispose the editor itself, only its models.

### Implementation

```js
// Global variables in the iframe
var diffEditorInstance = null;
var diffOverlayEl = null;

function closeDiffModal() {
    if (diffOverlayEl) diffOverlayEl.style.display = 'none';
}

function openDiffModal(original, formatted) {
    // Lazy creation: only once
    if (!diffOverlayEl) {
        diffOverlayEl = document.createElement('div');
        diffOverlayEl.className = 'diff-overlay';

        var toolbar = document.createElement('div');
        toolbar.className = 'diff-toolbar';
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Close';
        closeBtn.className = 'diff-close-btn';
        closeBtn.onclick = closeDiffModal; // ← Just hide, don't destroy
        toolbar.appendChild(closeBtn);

        var container = document.createElement('div');
        container.className = 'diff-container';

        diffOverlayEl.appendChild(toolbar);
        diffOverlayEl.appendChild(container);
        document.body.appendChild(diffOverlayEl);

        // Created once, never disposed
        diffEditorInstance = monaco.editor.createDiffEditor(container, DIFF_EDITOR_OPTIONS);
    }

    // Show the overlay
    diffOverlayEl.style.display = 'block';

    // Detach old models BEFORE disposing them
    var oldModel = diffEditorInstance.getModel();
    if (oldModel) {
        diffEditorInstance.setModel(null); // ← CRITICAL: detach first
        oldModel.original?.dispose();
        oldModel.modified?.dispose();
    }

    // Attach new models
    diffEditorInstance.setModel({
        original: monaco.editor.createModel(original, currentLang),
        modified: monaco.editor.createModel(formatted, currentLang)
    });

    // Layout after display
    requestAnimationFrame(function() {
        var container = diffOverlayEl.querySelector('.diff-container');
        diffEditorInstance.layout({
            width: container.clientWidth,
            height: container.clientHeight
        });
    });
}
```

### Associated CSS

```css
.diff-overlay {
    display: none; /* Hidden by default, shown via JS */
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
}
```

---

## Key Points of the Solution

### 1. Single Creation

The diff editor is created **once** on the first call to `openDiffModal()`. Subsequent calls reuse the same instance.

### 2. Show/Hide via CSS

Instead of creating/destroying the overlay each time, we use `display: block/none`. The overlay stays in the DOM.

### 3. Critical Order for Models

```js
diffEditorInstance.setModel(null);  // 1. Detach first
oldModel.original?.dispose();        // 2. Then dispose
oldModel.modified?.dispose();
```

**Why this order?** Disposing a model while it's still attached to an editor causes internal Monaco errors. You must first detach with `setModel(null)`.

### 4. No Dispose of the Diff Editor

The diff editor is **never** disposed. It stays in memory for the entire lifetime of the iframe. Only the models (text content) are disposed and recreated on each opening.

### 5. StandaloneServices Stability

By keeping the diff editor alive, the `StandaloneServices` singleton remains stable. The main editor keeps its services intact and the context menu works normally.

---

## Benefits

1. **No InstantiationService error** — the singleton is never corrupted
2. **Performance** — no diff editor recreation on each opening
3. **Simplicity** — less creation/destruction logic
4. **No memory leak** — models are properly disposed

---

## Lesson Learned

**Monaco Editor shares its internal services between all editor instances in the same JavaScript context.** Creating then destroying editors (especially diff editors) can corrupt this shared singleton.

**General solution:** For any secondary editor (diff, modal, etc.), prefer the **singleton pattern**: create once, reuse, never dispose the editor itself.
