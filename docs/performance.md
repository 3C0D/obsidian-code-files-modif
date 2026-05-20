# Performance Architecture

## Summary
The plugin is designed to minimize Obsidian's startup time and provide instant editor opens. Key strategies: deferred initialization, parallel asset loading, blob URL caching, and guarded DOM operations.

## 1. Deferred Startup

The plugin does NOT load Monaco at startup. Heavy work is deferred:
- **Extension registration** is synchronous and instant (just tells Obsidian which file types to route)
- **Hidden files restore** runs in `onLayoutReady` (after Obsidian's UI is ready)
- **Monaco assets** are only fetched when the first editor is opened
- **Blob URL** is built once, then cached for the session

**Result:** Plugin load adds ~5ms to Obsidian startup (measured: extension registration + patches).

## 2. Parallel Asset Loading (`buildBlobUrl.ts`)

When the first editor opens, 16 assets are fetched in parallel via `Promise.all`:
- Monaco CSS + codicon font path
- Prettier base + 7 language plugins
- 4 formatter scripts (mermaid, clang, ruff, gofmt)
- monacoBundle.js

This eliminates sequential round-trips through Electron's `app://` handler that previously caused 5-10s load times after cache invalidation.

## 3. Blob URL Caching

The constructed blob URL is cached at module level (`_cachedBlobUrl`). Subsequent editor opens reuse it instantly (no re-fetch, no re-build). The cache key is `bundleJsUrl` — if assets change (rebuild), the cache is automatically invalidated.

**Lifecycle:**
- First editor open: build blob URL (~200ms)
- Subsequent opens: instant (reuse cached blob)
- Plugin unload: `revokeBlobUrlCache()` frees memory

## 4. Ready Promise (No Hardcoded Timeouts)

Each editor instance exposes `editor.ready: Promise<void>`. Callers like `openInMonacoLeaf()` await this promise before sending commands (e.g., `scroll-to-position`). This replaced fragile `setTimeout(150)` patterns that failed on slow systems.

## 5. Explorer Badge Guards

`setupExplorerBadges()` in `explorerUtils.ts` uses a `MutationObserver` to apply badges incrementally (only to newly added DOM nodes). The full `scanAll()` only runs when the file explorer view instance actually changes — not on every `layout-change` event (which fires on pane resize, tab switch, etc.).

## 6. Revealed Items Cache

`getRevealedItemsCache(plugin)` returns a `Set<string>` of all revealed dotfile paths, cached at the plugin instance level. It's invalidated only when `revealedItems` settings change. This avoids rebuilding `Object.values(...).flat()` on every `reconcileDeletion` call (hot path during vault file watching).

## 7. Console Process Management

- Processes are spawned with `detached: true` on Unix (process groups for clean kill)
- Output decoding handles CP850 (Windows cmd.exe) and UTF-8 transparently
- Exit handling uses a 50ms delay to flush remaining stdout/stderr data events
- Console output is auto-truncated at 5000 lines to prevent DOM bloat

## 8. Deferred Folder Decoration

`decorateFolders()` (eye badge updates) is debounced at 400ms on vault create/delete/rename events, preventing rapid successive calls during bulk operations.

## 9. Auto-Reveal Yielding

`syncAutoRevealedDotfiles()` yields every 30 folders during scanning to avoid blocking the UI thread in large vaults.

---

**Revised:** ✓
