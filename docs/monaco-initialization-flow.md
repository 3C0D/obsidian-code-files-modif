# Monaco Initialization & Sync Flow

This document explains how Obsidian's main window synchronizes with the isolated Monaco iframe to guarantee the editor is ready before any interaction.

## The Pattern: "Deferred Promise"

Initialization is asynchronous and crosses two isolated environments. To handle this, we use a promise whose resolution is delegated to the message handler.

### 1. Creation (mountCodeEditor.ts)
When mounting an editor, we create a "pending" promise and capture its resolution function (`resolve`):

```ts
let resolveReady: () => void = () => {};
const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
```

### 2. Iframe Signal (init.ts)
The iframe loads Monaco. Once Monaco is ready in its own environment, it sends a signal:
`window.parent.postMessage({ type: 'ready' }, '*')`

**Note:** This message does not contain a `context` because at this stage, the iframe doesn't yet know which file it's editing.

### 3. Handshake (messageHandler.ts)
The `messageHandler` receives the `'ready'` signal and performs two critical actions:
1. **Initialization**: Sends `initParams` (containing the context/file path) to the iframe.
2. **Resolution**: Calls `resolveReady()`. Thanks to **closure**, `onMessage` always has access to the `resolve` function created in step 1.

### 4. Consumption (Parent)
The caller (e.g., `CodeEditorView`) can then await full resolution:
```ts
const handle = await mountCodeEditor(...);
await handle.ready; 
// Here, Monaco is initialized, content is loaded, and context is defined.
```

## Why Wait for `ready`?

It is crucial to await `handle.ready` for all "fire and forget" commands that must execute immediately after opening but require Monaco to be fully operational.

### Concrete Use Cases:

- **Cross-file navigation (Jump to line)**:
  In `openInMonacoLeaf()`, we await `ready` before sending `scroll-to-position`. If sent earlier, the message would be ignored by the still-loading iframe.

- **Initial focus**:
  Ensures the editor takes focus only after it has finished loading the text.

- **External interactions**:
  Any third-party plugin wishing to interact with a Monaco instance must await this signal to avoid sending messages into the void.

## Typing and Safety

The `IframeMessage` type includes `{ type: 'ready' }` without a `context` property. The `messageHandler` uses TypeScript's Control Flow Analysis:
1. Cast the message to `IframeMessage`.
2. Handle the `ready` case and `return`.
3. For the rest of the code, TypeScript "knows" by elimination that the message is no longer a `ready` and therefore necessarily has a valid `context` property.

---

**Revised:** ✓
