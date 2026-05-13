# Performance Optimizations

This document outlines the key performance optimizations implemented in the Code Files plugin to ensure a smooth, non-blocking user experience, particularly during Obsidian startup and editor initialization.

## 1. Editor Initialization (esbuild & Blob Caching)

The Monaco editor runs inside an isolated iframe to avoid DOM conflicts with Obsidian. To optimize its loading speed, two major mechanisms are in place:

*   **esbuild Bundling**: Previously, the iframe loaded multiple separate JavaScript files (`config`, `diff`, `formatters`, `actions`) and evaluated inline code. This was refactored to use a second `esbuild` context that compiles a single IIFE bundle (`monacoBundle.js`). This drastically reduces parsing overhead and the number of requests the iframe needs to make, leading to a much faster editor startup.
*   **Blob URL Caching**: The HTML and CSS required for the iframe are processed (path rewriting, inline CSS injection) and converted into a Blob URL via `buildBlobUrl.ts`. This Blob URL is cached globally. Subsequent code editors opened in new tabs reuse this cached URL, eliminating redundant string manipulation and file reads.

## 2. Vault Startup Scan (Yielding)

During `onLayoutReady`, the plugin synchronizes the visibility of dotfiles (`syncAutoRevealedDotfiles` and `revealRegisteredDotfiles`). This requires scanning the entire vault directory by directory using `adapter.list()`, which involves significant disk I/O.

*   **Event Loop Yielding**: To prevent this massive scan from blocking Obsidian's main UI thread on startup, the loops over `getAllFolders()` include an asynchronous yield (`await new Promise(r => setTimeout(r, 0))`) every 30 iterations. This allows the browser to process UI rendering and other plugin initializations concurrently, preventing Obsidian from freezing (the "spinning wheel" effect).

## 3. DOM Manipulation (Targeted Queries)

The plugin adds a visual "eye" badge to folders containing revealed hidden files (`decorateFolders` in `badge.ts`).

*   **Targeted DOM Updates**: Instead of iterating over every single item rendered in the File Explorer (`view.fileItems` which can contain thousands of entries), the function now uses a `Set` for quick lookups and standard `document.querySelectorAll` to target only the existing badges and the specific folders that need them.

## 4. Vault Events (Debouncing)

The file explorer badges need to stay up to date when files are created, deleted, or renamed.

*   **Debounced Execution**: Attaching synchronous DOM updates to every `vault.on('create/delete/rename')` event can cause severe UI lag during bulk operations (e.g., a Git pull or large file duplication). The `decorateFolders` function is now wrapped in a `400ms` debounce in `main.ts`. If 100 files are created at once, the DOM is only updated once after the operation settles.
