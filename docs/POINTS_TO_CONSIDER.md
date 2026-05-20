# Points to Consider

Technical debt, edge cases, and architectural decisions to keep in mind when modifying the plugin.

## Active Concerns

### 1. Console Output Memory
The console auto-truncates at 5000 lines, but large volumes of rapid output (e.g., build tools with ANSI colors) can still cause temporary DOM bloat before truncation kicks in.

**Potential improvement:** Virtual scrolling or output chunking instead of raw DOM insertion.

### 2. Blob URL Cache Invalidation
The blob URL cache is keyed on `bundleJsUrl`. If a formatter asset changes but the bundle stays the same, the cache won't invalidate. This is unlikely in practice (rebuild always touches the bundle) but worth noting.

### 3. Cross-Platform Path Handling
The plugin normalizes paths using `/` internally but must handle Windows `\` from `adapter.getBasePath()` and Node.js `child_process`. The `normalizePath()` utility handles most cases, but edge cases may exist with UNC paths or drive-letter-relative paths.

### 4. Monaco Worker Memory
Each open editor shares the same iframe blob URL but creates its own workers (language service, etc.). With many tabs open (10+), memory usage may grow. Monaco's built-in worker recycling helps, but no explicit limit is enforced.

### 5. File Size Limits
No explicit file size check before opening in Monaco. Very large files (>10MB) may cause the editor to lag. The hidden files modal already filters by configurable max size, but the main open path does not.

### 6. Process Tree Kill on Windows
`consoleHandler.ts` uses `taskkill /F /T /PID` on Windows to kill process trees. This is reliable for most cases but may fail for elevated processes or system-protected PIDs (graceful degradation: the process exits naturally when the console closes).

### 7. CSS Snippet Toggle State
When editing a CSS snippet and toggling it off/on, the toggle state is synced to Obsidian's snippet configuration. If the user has the Obsidian settings page open simultaneously, there may be a brief visual desync (non-critical, cosmetic).

## Resolved (Previously Tracked)

- ~~Hardcoded 150ms timeout for editor ready~~ → Replaced with ready promise
- ~~reconcileDeletion uses O(n) array scan~~ → Now uses Set cache
- ~~monkey-patch stacking on settings/palette~~ → Now tracks uninstall functions
- ~~console logic inline in messageHandler~~ → Extracted to consoleHandler.ts
- ~~onCssChange event leak~~ → Now uses offref() with proper cleanup
- ~~operations.ts filePath vs normalizedPath~~ → Fixed, uses normalizedPath
- ~~layout-change triggers expensive scanAll~~ → Guarded by view-change check

---

**Revised:** ✓
