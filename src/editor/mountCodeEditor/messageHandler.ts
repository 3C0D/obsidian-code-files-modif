/**
 * Message handler for the mounted code editor.
 * Handles incoming messages from the editor view and processes them.
 */
import type { MessageHandlerContext, IframeMessage } from '../../types/index.ts';

import { CodeEditorView } from '../codeEditorView/index.ts';
import { broadcastHotkeys } from '../../utils/broadcast.ts';
import { around } from 'monkey-around';
import { openInMonacoLeaf } from '../codeEditorView/editorOpeners.ts';
import { Platform } from 'obsidian';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import { handleConsoleMessage, cleanupConsole, initConsole } from './consoleHandler.ts';
import { getExtension } from '../../utils/fileUtils.ts';

// Desktop-only imports for drag-and-drop functionality
let webUtils: { getPathForFile(file: File): string } | undefined;

if (Platform.isDesktop) {
  webUtils = require('electron').webUtils;
}

/**
 * Builds the postMessage handler for a Monaco iframe instance.
 * This is the central bridge between the isolated iframe and the Obsidian/Node.js environment.
 *
 * @param ctx - The context containing refs to the iframe, current file, and plugin instance.
 */
export function buildMessageHandler(ctx: MessageHandlerContext): {
  handler: (event: MessageEvent) => Promise<void>;
  cleanup: () => void;
} {
  const {
    iframe,
    send,
    valueRef,
    codeContext,
    plugin,
    initParams,
    loadProjectFiles,
    autoFocus,
    onChange,
    onSave,
    onFormatDiff,
    onFormatDiffReverted,
    onOpenEditorConfig,
    onOpenThemePicker,
    onOpenRenameExtension,
    onConsoleVisibilityChanged,
    initialConsoleOpen: _initialConsoleOpen,
    resolveReady
  } = ctx;

  // Track uninstall functions for monkey patches to prevent stacking when user opens modals multiple times
  let _settingsUninstall: (() => void) | null = null;
  let _paletteUninstall: (() => void) | null = null;

  /**
   * Main message listener function.
   * Processes all events sent by the iframe via window.parent.postMessage.
   */
  const onMessage = async ({ data, source }: MessageEvent): Promise<void> => {
    // SECURITY: Ensure we only process messages intended for THIS specific iframe instance.
    if (source !== iframe.contentWindow) return;

    const msg = data as IframeMessage;
    if (!msg || !msg.type) return;

    // Handle 'ready' signal: Triggered when Monaco is fully loaded in the iframe.
    if (msg.type === 'ready') {
      send('init', initParams);
      send('change-value', { value: valueRef.current });
      if (autoFocus) send('focus', {});
      if (Platform.isDesktop) {
        if (_initialConsoleOpen) send('console-show', {});
        initConsole(plugin, codeContext, send);
      }
      await loadProjectFiles(send);
      resolveReady();
      return;
    }

    // DISPATCHING: All remaining messages must provide a 'context' matching this file path.
    if (msg.context !== codeContext) return;

    switch (msg.type) {
      case 'open-formatter-config': {
        const ext = getExtension(codeContext);
        onOpenEditorConfig?.(ext);
        break;
      }

      case 'open-theme-picker': {
        onOpenThemePicker?.();
        break;
      }

      case 'open-settings': {
        // Clean up any previous settings modal patch to prevent stacking
        if (_settingsUninstall) _settingsUninstall();
        const uninstall = around(plugin.app.setting, {
          onClose(old) {
            return function (this: unknown) {
              const result = old.apply(this);
              uninstall();
              // Clear the tracker since this patch is now uninstalled
              _settingsUninstall = null;
              // Defer hotkey broadcast: settings modal teardown is asynchronous in Obsidian,
              // so we wait 200 ms to ensure the panel is fully closed before re-syncing.
              setTimeout(() => {
                broadcastHotkeys(plugin);
              }, 200);
              send('focus', {});
              return result;
            };
          }
        });
        // Track the uninstall function for cleanup on next modal open or view destruction
        _settingsUninstall = uninstall;
        plugin.app.setting.open();
        plugin.app.setting.openTabById(plugin.manifest.id);
        // Scroll the left sidebar to show the active plugin tab
        setTimeout(() => {
          plugin.app.setting.containerEl
            .querySelector('.vertical-tab-nav-item.is-active')
            ?.scrollIntoView({ block: 'center' });
        }, 50);
        break;
      }

      case 'delete-file': {
        const file = plugin.app.vault.getFileByPath(codeContext);
        if (!file) break;
        const leaf = plugin.app.workspace
          .getLeavesOfType('code-editor')
          .find(
            (l) => l.view instanceof CodeEditorView && l.view.file?.path === codeContext
          );
        leaf?.detach();
        await plugin.app.vault.trash(file, true);
        break;
      }

      case 'open-obsidian-palette': {
        // Clean up any previous command palette modal patch to prevent stacking
        if (_paletteUninstall) _paletteUninstall();
        const cmdPalette = plugin.app.internalPlugins.getPluginById('command-palette');
        if (!cmdPalette) break;
        const modal = cmdPalette.instance.modal;
        const uninstall = around(modal, {
          onClose(old) {
            return function (this: unknown) {
              const result = old.apply(this);
              uninstall();
              // Clear the tracker since this patch is now uninstalled
              _paletteUninstall = null;
              send('focus', {});
              return result;
            };
          }
        });
        _paletteUninstall = uninstall;
        modal.open();
        break;
      }

      case 'open-rename-extension': {
        onOpenRenameExtension?.();
        break;
      }

      /**
       * Re-opens the current file with Obsidian's default viewer (i.e. exits the Monaco leaf).
       */
      case 'return-to-default-view': {
        const file = plugin.app.vault.getFileByPath(codeContext);
        if (!file) break;
        const leaf = plugin.app.workspace
          .getLeavesOfType('code-editor')
          .find(
            (l) => l.view instanceof CodeEditorView && l.view.file?.path === codeContext
          );
        if (leaf) {
          await leaf.openFile(file);
        }
        break;
      }

      /**
       * Prettier found a diff: notify the parent to show the diff action in the toolbar.
       */
      case 'format-diff-available': {
        onFormatDiff?.();
        break;
      }

      /**
       * User reverted the format diff: hide the toolbar action.
       */
      case 'format-diff-reverted': {
        onFormatDiffReverted?.();
        break;
      }

      /**
       * Editor content changed: sync the internal value ref and notify the parent view.
       */
      case 'change': {
        if (valueRef.current !== msg.value) {
          valueRef.current = msg.value;
          onChange?.();
        }
        break;
      }

      /**
       * User triggered a save (Ctrl+S): delegate to the onSave callback (writes to vault).
       */
      case 'save-document': {
        onSave?.();
        break;
      }

      /**
       * Word-wrap toggle: persist the new state immediately so it survives a reload.
       */
      case 'word-wrap-toggled': {
        plugin.settings.wordWrap = msg.wordWrap;
        await plugin.saveSettings();
        break;
      }

      /**
       * Cross-file navigation request from Monaco (e.g. Cmd+Click on an import).
       * Opens the target vault file in a Monaco leaf, restoring cursor position if provided.
       */
      case 'open-file': {
        const vaultPath = msg.path;
        const position = msg.position;
        const file = plugin.app.vault.getFileByPath(vaultPath);
        if (!file) break;
        await openInMonacoLeaf(file, plugin, true, position, true);
        break;
      }

      default: {
        // Delegate remaining messages to the console handler
        const handled = await handleConsoleMessage(
          msg,
          codeContext,
          plugin,
          send,
          onConsoleVisibilityChanged
        );
        if (!handled) {
          console.warn(`[code-files] Unhandled message type: "${msg.type}"`);
        }
        break;
      }
    }
  };

  /**
   * Drag-and-drop relay: enables dropping files or folders onto the console from the OS.
   *
   * Problem: the Monaco iframe is a separate browsing context. Any drag that enters
   * the iframe area is consumed by the iframe's document — the parent's `drop` event
   * never fires over that region. `webUtils.getPathForFile` (Electron API) is also
   * unavailable inside the sandboxed iframe.
   *
   * Solution: on `dragenter`, a transparent overlay div is placed over the iframe
   * in the parent DOM (z-index: 9999). It intercepts the drop at the Electron level,
   * where `webUtils.getPathForFile` is accessible, then forwards the resolved paths
   * to the iframe via `send('console-drop-paths')`.
   * The overlay is single-use and removes itself after the drop or on drag cancel.
   */
  let _removeDragRelay: (() => void) | undefined;

  if (Platform.isDesktop) {
    /**
     * Drag-and-drop relay for the sandboxed iframe.
     * file.path and text/uri-list are both blocked inside the iframe.
     * A transparent overlay is placed over the iframe on dragenter to intercept
     * the drop at the parent (Electron) level, where file.path is accessible.
     * The overlay is single-use: it removes itself after the first drop or leave.
     */
    let dragOverlay: HTMLDivElement | null = null;
    let dropping = false; // Guard against immediate re-trigger after drop

    const hideOverlay = (): void => {
      dragOverlay?.remove();
      dragOverlay = null;
    };

    const showOverlay = (): void => {
      if (dragOverlay) return;
      const rect = iframe.getBoundingClientRect();
      dragOverlay = document.createElement('div');
      dragOverlay.style.cssText = `
        position: fixed;
        left: ${rect.left}px; top: ${rect.top}px;
        width: ${rect.width}px; height: ${rect.height}px;
        z-index: 9999;
        background: transparent;
      `;

      // Required: without preventDefault on dragover, the browser rejects the drop event entirely.
      dragOverlay.addEventListener('dragover', (e) => e.preventDefault());

      dragOverlay.addEventListener(
        'drop',
        (e) => {
          e.preventDefault();
          e.stopPropagation(); // Prevent event from reaching the iframe
          if (dropping) return;
          dropping = true;
          setTimeout(() => {
            dropping = false;
          }, 300);

          hideOverlay();

          const files = Array.from(e.dataTransfer?.files ?? []);
          const basePath = getDataAdapterEx(plugin.app).basePath;
          const paths: string[] = [];

          for (const f of files) {
            const absPath: string = webUtils?.getPathForFile(f) ?? '';
            if (!absPath) continue;
            // If the file is inside the vault, convert to a vault-relative path.
            // Otherwise keep the absolute path (e.g. file dropped from outside the vault).
            const resolved = absPath.startsWith(basePath)
              ? absPath.slice(basePath.length).replace(/^[/\\]/, '')
              : absPath;
            // Quote paths containing spaces
            paths.push(resolved.includes(' ') ? `"${resolved}"` : resolved);
          }
          if (paths.length) send('console-drop-paths', { paths });
        },
        { once: true }
      );

      document.body.appendChild(dragOverlay);
    };

    const onDragEnter = (e: DragEvent): void => {
      // `.files` is empty during dragenter (security restriction) — only `.items` is available here.
      // The actual file data is only accessible in the `drop` event handler below.
      // `kind === 'file'` covers both files and directories when dragged from the OS under Electron.
      const hasFiles = Array.from(e.dataTransfer?.items ?? []).some(
        (i) => i.kind === 'file'
      );
      if (hasFiles) showOverlay();
    };

    // Fallback: drag cancelled (Escape) or dropped outside any valid target
    const onDragEnd = (): void => hideOverlay();

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragend', onDragEnd);

    _removeDragRelay = (): void => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragend', onDragEnd);
      hideOverlay();
    };
  }

  return {
    handler: onMessage,
    /**
     * Cleanup Function.
     * Called when the editor view is destroyed.
     * Ensures we don't leave zombie background processes running.
     */
    cleanup: () => {
      // Clean up any remaining modal patches when the Monaco view is destroyed
      if (_settingsUninstall) _settingsUninstall();
      if (_paletteUninstall) _paletteUninstall();
      cleanupConsole(codeContext);
      _removeDragRelay?.();
    }
  };
}
