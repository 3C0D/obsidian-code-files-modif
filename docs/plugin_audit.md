# Code Files Plugin — Deep Audit Report

---

## 1. Architecture & Module Boundaries

**[SEVERITY: minor]** `explorerUtils.ts` / `snippetUtils.ts` — Cross-module coupling via `onCssChange`
> `snippetUtils.ts` imports `onCssChange` from `explorerUtils.ts`. This couples snippet logic to explorer logic. `onCssChange` is a generic workspace event wrapper unrelated to explorer badges.
> **Recommendation:** Move `onCssChange()` to a new shared utility file (e.g. `utils/workspaceEvents.ts`) or into `snippetUtils.ts` itself, since it's only 3 lines. Remove the import from `explorerUtils.ts`.

**[SEVERITY: minor]** `themeUtils.ts` — Same coupling for `onCssChange`
> `themeUtils.ts` also imports `onCssChange` from `explorerUtils.ts`.
> **Recommendation:** Same as above — move `onCssChange()` to a shared utility.

**[SEVERITY: minor]** `messageHandler.ts` — File is 630 lines, doing too much
> `messageHandler.ts` handles postMessage routing, process management (spawn, kill, CWD tracking), CP850 decoding, drag-and-drop relay, and console history. The console concern alone is ~300 lines.
> **Recommendation:** Extract console-related code (lines 32–101 and cases `run-command`, `stop-command`, `send-stdin`, `send-stdin-eof`, `console-*`) into a dedicated `consoleHandler.ts` module. `buildMessageHandler` would delegate to it.

**[SEVERITY: minor]** `codeFilesSettingsTab.ts` — 538 lines, doing too much
> Settings tab handles extension management, editor config with embedded Monaco editor, hotkey overrides, and hidden files settings in a single file.
> **Recommendation:** Split into section renderers: `renderExtensionsSection`, `renderEditorConfigSection`, `renderHotkeySection`, `renderHiddenFilesSection` are already methods — consider extracting each into its own module file under `ui/settings/`.

**[SEVERITY: minor]** `types/variables.ts` — Mixed concerns
> Contains constants (`DEFAULT_SETTINGS`, `BUILTIN_THEMES`, `EXCLUDED_EXTENSIONS`), config templates (`getExtensionConfigTemplate()`), and the `viewType` constant. The template function has business logic.
> **Recommendation:** Move `getExtensionConfigTemplate()` to `settingsUtils.ts` where config building already lives. Keep pure constants in `variables.ts`.

**[SEVERITY: minor]** `hiddenFiles/` — No circular dependency risk, but barrel index re-exports everything
> The barrel `hiddenFiles/index.ts` re-exports from all 8 submodules. Consumers can pick what they need, but tree-shaking in esbuild may not prune unused re-exports in IIFE format.
> **Recommendation:** No action required — esbuild handles this well enough for the plugin size. Noting for awareness.

---

## 2. Correctness & Edge Cases

**[SEVERITY: critical]** `operations.ts` `cleanupTemporaryReveal()` L228 — Path comparison uses raw `filePath` instead of `normalizedPath`
> Line 228: `plugin.settings.temporaryRevealedPaths = tmp.filter((p) => p !== filePath);` compares against the original `filePath` argument, but the function uses `normalizedPath` everywhere else. If `filePath` contains a trailing slash or different casing, the filter won't match and the path stays in the list forever.
> **Recommendation:** In `operations.ts` line 228, replace `filePath` with `normalizedPath`:
> ```ts
> plugin.settings.temporaryRevealedPaths = tmp.filter((p) => p !== normalizedPath);
> ```

**[SEVERITY: major]** `messageHandler.ts` — `open-settings` monkey-patch `uninstall` may never be called
> The `around(plugin.app.setting, { onClose(...) })` patch at line 180 is created every time the user triggers `open-settings` from Monaco. If the user opens settings again before closing, a new patch is stacked on top of the old one. The old `uninstall` is never called — leaked monkey-patch.
> **Recommendation:** Track the uninstall function at `buildMessageHandler` scope level (like `_closeTimer`). Before creating a new patch, call the previous uninstall. Or use `{ once: true }` semantics by calling `uninstall()` inside the patched `onClose`.

**[SEVERITY: major]** `messageHandler.ts` — `open-obsidian-palette` same issue
> Line 223: Same `around()` stacking risk as `open-settings`. If the user opens the command palette repeatedly without closing it, patches accumulate.
> **Recommendation:** Same fix — track and clean up previous `uninstall` before creating a new one.

**[SEVERITY: major]** `patches.ts` `reconcileDeletion` — `allRevealedItems` rebuilt on every call (O(n))
> Line 51: `Object.values(plugin.settings.revealedItems).flat()` is called on every `reconcileDeletion` invocation. This is a hot path during vault operations (file watchers call this frequently).
> **Recommendation:** Cache `allRevealedItems` as a `Set<string>` and invalidate it when `revealedItems` changes. Or compute it lazily with a dirty flag.

**[SEVERITY: minor]** `editorOpeners.ts` `openInMonacoLeaf()` — 150ms hardcoded delay for `scroll-to-position`
> Line 80: `setTimeout(() => { ... }, existingLeaf ? 0 : 150)` is fragile. If Monaco takes longer to init, the position command is silently dropped.
> **Recommendation:** Instead of a hardcoded timeout, have the iframe send a `'editor-ready'` message once Monaco has fully initialized its model, and queue the scroll command until that message arrives.

**[SEVERITY: minor]** `openFilePatch.ts` — `openFile` patch returns `void` for blocked extensions
> Line 62-64: When `!isKnownToObsidian && !isKnownToMonaco`, the function returns without calling `next()` and without feedback. The user clicks a file and nothing happens.
> **Recommendation:** Show a `Notice` to explain why the file cannot be opened, e.g. `"Extension .xyz is not registered with Code Files or Obsidian"`.

**[SEVERITY: minor]** `settingsUtils.ts` `parseEditorConfig` — Regex strips `//` inside strings
> Line 32: The regex `//[^\n]*` will incorrectly strip `//` sequences inside JSON string values (e.g. `"url": "https://example.com"`). This is a JSONC parser edge case.
> **Recommendation:** Acceptable for editor config where URLs in values are unlikely. Document the limitation in the JSDoc. Not worth replacing with a full JSONC parser for this use case.

**[SEVERITY: minor]** `explorerUtils.ts` `onCssChange` L239-241 — Event listener leak potential
> `app.workspace.on('css-change', handler)` returns an `EventRef`, but the unregister uses `app.workspace.off('css-change', handler)`. Obsidian's `off()` matches by reference and works, but `on()` returns an `EventRef` that should be used with `offref()` for correctness.
> **Recommendation:** Use `const ref = app.workspace.on(...)` and `return () => app.workspace.offref(ref)` for proper cleanup.

---

## 3. Performance

**[SEVERITY: major]** `explorerUtils.ts` `setupExplorerBadges` — `layout-change` fires frequently, triggering full `scanAll`
> Line 186: Every `layout-change` event triggers `reattachObservers()`, which calls `scanAll()` — iterating all `view.fileItems`. `layout-change` fires on pane resize, tab switch, sidebar toggle, etc.
> **Recommendation:** Guard `scanAll` to only run if the file explorer view reference has actually changed (track the previous view instance). If the same `view` object is still alive, skip `scanAll` — the MutationObserver is already watching.

**[SEVERITY: minor]** `patches.ts` `patchRegisterExtensions` → `unregisterExtensions` — iterates all vault files
> Line 208: `plugin.app.vault.getFiles()` iterates every file in the vault on each `unregisterExtensions` call to find matching dotfiles. In a large vault (10k+ files), this is expensive.
> **Recommendation:** Pre-filter using a Set of known dotfile paths from `revealedItems` rather than scanning all files. Or use the vault's built-in file index with extension filtering.

**[SEVERITY: minor]** `broadcast.ts` `broadcastEditorConfig` — `getActiveExtensions` called per-view
> Line 76: `getActiveExtensions` creates a new Set and filters on every call. With many open views, this is redundant.
> **Recommendation:** Cache the result at the beginning of `broadcastEditorConfig` and pass it down, or call it once before the loop.

**[SEVERITY: minor]** `sync.ts` `syncAutoRevealedDotfiles` — `scanDotEntries` calls `adapter.list()` + `adapter.stat()` per folder
> Each folder triggers a `list()` call and then a `stat()` per entry. For deep vaults, this is many I/O operations.
> **Recommendation:** Already mitigated by yielding every 30 folders. Consider batching stat calls or using `listRecursive` if available.

**[SEVERITY: minor]** `buildBlobUrl.ts` — 16 parallel fetches on first editor open
> Lines 81-98: All formatter scripts and CSS are fetched in parallel. This is intentionally fast but creates a burst of 16 concurrent `fetch()` calls hitting Electron's `app://` handler.
> **Recommendation:** Already well-optimized with `Promise.all`. No change needed.

---

## 4. TypeScript Quality

**[SEVERITY: major]** `messageHandler.ts` — Extensive use of `as` casts on `data.*` properties
> Throughout the message handler, `data.value as string`, `data.wordWrap as 'on' | 'off'`, `data.height as number`, etc. are used without runtime validation. A malformed message from the iframe could cause silent type mismatches.
> **Recommendation:** Define a discriminated union type for all incoming iframe messages:
> ```ts
> type IframeMessage =
>   | { type: 'change'; context: string; value: string }
>   | { type: 'word-wrap-toggled'; context: string; wordWrap: 'on' | 'off' }
>   | { type: 'run-command'; context: string; cmd: string }
>   // ...etc
> ```
> Then cast `data` once at the top: `const msg = data as IframeMessage;` and use `msg.value` etc. with proper narrowing.

**[SEVERITY: minor]** `explorerUtils.ts` L73 — Unsafe cast `as FileExplorerView | undefined`
> `plugin.app.workspace.getLeavesOfType('file-explorer').first()?.view as FileExplorerView | undefined` — no runtime check.
> **Recommendation:** Acceptable for Obsidian plugins where typing internal APIs requires casts. Add a comment noting this is intentional.

**[SEVERITY: minor]** `state.ts` L29-30 — Double cast `as unknown as DataAdapterWithInternal`
> **Recommendation:** Acceptable — bridging between `obsidian-typings` and custom extended interface. Keep as-is.

**[SEVERITY: minor]** `hotkeyUtils.ts` `serializeMonacoHotkeys` — Doesn't account for console hotkey override
> Line 141: Console hotkey is hardcoded `{ modifiers: ['Mod'], key: 'j' }` instead of using `plugin.settings.consoleHotkey`. This function is used for change detection, so overrides won't trigger a reload.
> **Recommendation:** In `serializeMonacoHotkeys()`, accept the app AND plugin settings, and resolve the console hotkey the same way as in `broadcastHotkeys()`:
> ```ts
> const consoleHotkey = parseHotkeyOverride(plugin.settings.consoleHotkey) ?? { modifiers: ['Mod'], key: 'j' };
> ```
> Note: This requires changing the function signature from `(app: App)` to `(app: App, settings: MyPluginSettings)`.

**[SEVERITY: minor]** `headerBadges.ts` — `createEl` called as global function
> Lines 25, 31, 51: `createEl('span', ...)` is called without a DOM element context. This is Obsidian's global helper but TypeScript doesn't validate it — it's available on `HTMLElement.prototype` via Obsidian's augmentations. Works, but fragile.
> **Recommendation:** No change needed — this is standard Obsidian plugin API usage.

---

## 5. Obsidian API Usage

**[SEVERITY: major]** `menuPatch.ts` — Prototype patch on `Menu.hide` without cleanup via `this.register()`
> Line 39-48: `patchMenuOverlay` uses `plugin.register(around(Menu.prototype, ...))` which is correct — the `around` return value is registered for cleanup. However, line 51 uses `plugin.registerDomEvent(document.body, 'contextmenu', ...)` which is correctly cleaned up by Obsidian.
> **Recommendation:** No issue here — cleanup is properly handled. ✅

**[SEVERITY: minor]** `explorerUtils.ts` L239-241 — `onCssChange` uses `workspace.on`/`workspace.off` directly
> Events registered via `workspace.on()` without `plugin.registerEvent()` are not automatically cleaned up on plugin unload. If the caller forgets to call the returned cleanup function, the handler leaks.
> **Recommendation:** The current callers (`themeUtils.ts` L97, `snippetUtils.ts` L43) do store and call the cleanup, so this works. But consider converting to `plugin.registerEvent()` pattern for safety by accepting the plugin instance.

**[SEVERITY: minor]** `codeEditorView/index.ts` `onLoadFile` — commented-out `this.cleanup()` and `this.contentEl.empty()`
> Lines 331-332: Commented-out code suggests uncertainty about the lifecycle.
> **Recommendation:** Remove the commented lines. `onLoadFile` is called once per file load; `onUnloadFile` handles cleanup before the next load.

**[SEVERITY: minor]** `vaultConfigUtils.ts` — Modifying Obsidian's internal config without checking ownership
> `vault.setConfig('showUnsupportedFiles' as ConfigItem, true)` forcefully enables a global Obsidian setting. If the user has intentionally disabled it, the plugin overrides their choice on every startup.
> **Recommendation:** Already handled — the notice informs the user on first enable. Consider adding a plugin setting to disable this behavior for users who don't want it.

---

## 6. Code Quality & Consistency

**[SEVERITY: minor]** `extensionUtils.ts` `addExtension` — Returns `boolean`, `removeExtension` returns `void`
> Asymmetric API: `addExtension` tells the caller if it succeeded, `removeExtension` does not.
> **Recommendation:** Make `removeExtension` return `boolean` (true if the extension was actually removed). Currently the caller in `contextMenus.ts` doesn't check, but it's better API design.

**[SEVERITY: minor]** `patches.ts` L104-132 — Rename patch update logic is complex and partially duplicated
> The rename patch manually updates `revealedItems` with src/dest manipulation. This is also done in `operations.ts`. Potential for drift.
> **Recommendation:** Extract a `updateRevealedItemsOnRename(plugin, src, dest)` helper in `operations.ts` and call it from the rename patch.

**[SEVERITY: minor]** `explorerUtils.ts` — `previousProjectRootPath` is module-level mutable state
> Line 79: Module-level `let previousProjectRootPath` is fine for a singleton plugin but inconsistent with the pattern of passing `plugin` everywhere.
> **Recommendation:** Store it on the plugin instance (e.g. `plugin._previousProjectRootPath`) for consistency with `_registeredExts`, `_lastHotkeys`, etc. Or keep as-is since it's a purely visual concern.

**[SEVERITY: minor]** `main.ts` — Public properties that should be private
> `_registeredExts`, `_lastHotkeys`, `_origReconcileDeletion` are public (`_` prefix convention only). They're accessed from `extensionUtils.ts`, `broadcast.ts`, `patches.ts`.
> **Recommendation:** Acceptable with the `_` convention for a plugin codebase. No change needed unless you want stricter encapsulation.

**[SEVERITY: minor]** `editorSettingsModal.ts` — Not audited (not shown in full)
> 13.5 KB file — likely contains complex UI logic for the settings gear modal.
> **Recommendation:** Review separately if issues are reported.

---

## Priority List — Top 10 Changes by Impact

| # | Severity | File | Change |
|---|----------|------|--------|
| 1 | **Critical** | `operations.ts` L228 | Fix `filePath` → `normalizedPath` in `cleanupTemporaryReveal` filter. One-line fix. |
| 2 | **Major** | `messageHandler.ts` L180,223 | Track and clean up previous `around()` uninstall for `open-settings` and `open-obsidian-palette` to prevent monkey-patch stacking. |
| 3 | **Major** | `messageHandler.ts` | Define a discriminated union type for iframe messages to replace `as` casts on `data.*`. Create `src/types/iframeMessages.ts`. |
| 4 | **Major** | `explorerUtils.ts` L186 | Guard `reattachObservers`/`scanAll` to skip when the file explorer view instance hasn't changed, reducing unnecessary DOM traversals on `layout-change`. |
| 5 | **Major** | `patches.ts` L51 | Cache `allRevealedItems` as a `Set<string>` instead of rebuilding `Object.values(...).flat()` on every `reconcileDeletion` call. |
| 6 | **Minor** | `messageHandler.ts` | Extract console-related code (~300 lines) into `consoleHandler.ts` for maintainability. |
| 7 | **Minor** | `explorerUtils.ts` L239-241 | Fix `onCssChange` to use `offref()` instead of `off()`, and move to a shared utility file to decouple from explorer module. |
| 8 | **Minor** | `hotkeyUtils.ts` L141 | Fix `serializeMonacoHotkeys` to use plugin settings for console hotkey override instead of hardcoding the default. |
| 9 | **Minor** | `editorOpeners.ts` L80 | Replace 150ms hardcoded timeout for `scroll-to-position` with an event-driven approach (wait for `editor-ready` message). |
| 10 | **Minor** | `openFilePatch.ts` L62-64 | Add a `Notice` when a file with an unknown extension is silently blocked from opening. |
