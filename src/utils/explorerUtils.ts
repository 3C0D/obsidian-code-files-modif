/**
 * Visual highlighting for the project root folder in the file explorer.
 * Adds/removes a CSS class to the folder title element to show which folder
 * is set as the project root for TypeScript/JavaScript cross-file navigation.
 * The highlight color is customizable via plugin settings.
 */
import type CodeFilesPlugin from '../main.ts';
import type { FileExplorerView, FileTreeItem, FolderTreeItem } from 'obsidian-typings';
import { TFile, TFolder, type App } from 'obsidian';
import { getActiveExtensions } from './extensionUtils.ts';
import { getExtension } from './fileUtils.ts';

const PROJECT_ROOT_CLASS = 'code-files-project-root-folder';

/** Helper to get the active file explorer view and its items */
export const getFileExplorerView = (
  plugin: CodeFilesPlugin
): FileExplorerView | undefined => {
  const view = plugin.app.workspace.getLeavesOfType('file-explorer').first()?.view as
    | FileExplorerView
    | undefined;
  return view?.fileItems ? view : undefined;
};

let previousProjectRootPath: string | null = null;

/** Updates the visual highlight of the project root folder in the file explorer.
 *
 *  Why: Provides visual feedback to show which folder is set as the project root
 *  for TypeScript/JavaScript cross-file navigation.
 *
 *  How: Adds a CSS class to the folder title element in Obsidian's file explorer.
 *  The class is styled in monacoHtml.css to show a green highlight.
 *
 *  @param plugin - The plugin instance.
 */
export function updateProjectFolderHighlight(plugin: CodeFilesPlugin): void {
  const view = getFileExplorerView(plugin);
  if (!view) return;

  // Remove class from the previous root folder
  if (previousProjectRootPath) {
    const prevItem = view.fileItems[previousProjectRootPath] as
      | FolderTreeItem
      | undefined;
    if (prevItem?.file instanceof TFolder) {
      prevItem.el
        ?.querySelector<HTMLElement>('.nav-folder-title-content')
        ?.classList.remove(PROJECT_ROOT_CLASS);
    }
    previousProjectRootPath = null;
  }

  // Add class to the new root folder
  const projectRootPath = plugin.settings.projectRootFolder;
  if (!projectRootPath) return;

  const item = view.fileItems[projectRootPath] as FolderTreeItem | undefined;
  if (item?.file instanceof TFolder) {
    item.el
      ?.querySelector<HTMLElement>('.nav-folder-title-content')
      ?.classList.add(PROJECT_ROOT_CLASS);
    previousProjectRootPath = projectRootPath;
  }
}

let explorerObserver: MutationObserver | null = null;

/**
 * Ensures dotfiles (.env, .gitignore) show their extension as a badge in the
 * file explorer, matching Obsidian's native behavior for regular files.
 * Uses a MutationObserver to catch folder expansions dynamically and apply
 * badges only to newly added nodes via their data-path attribute.
 *
 *  @param plugin - The plugin instance.
 */
export function setupExplorerBadges(plugin: CodeFilesPlugin): void {
  const applyBadge = (item: FileTreeItem): void => {
    const file = item.file;
    if (!(file instanceof TFile)) return;

    const selfEl = item.selfEl || item.el;
    const tagEl = selfEl?.querySelector('.nav-file-tag');

    // Unregistered badge cleanup
    if (tagEl) tagEl.classList.remove('code-files-unregistered-badge');

    // Dotfile badge
    if (!file.extension) {
      const ext = getExtension(file.name);
      const activeExts = getActiveExtensions(plugin.settings);
      if (ext && activeExts.includes(ext) && tagEl && !tagEl.textContent) {
        tagEl.textContent = ext.toUpperCase();
      }
      return; // dotfiles are not "unregistered"
    }

    // Unregistered badge
    if (!plugin.app.viewRegistry.typeByExtension[file.extension]) {
      tagEl?.classList.add('code-files-unregistered-badge');
    }
  };

  const applyBadgeForPath = (view: FileExplorerView, path: string): void => {
    const item = view.fileItems[path] as FileTreeItem | undefined;
    if (item) applyBadge(item);
  };

  /** Full scan — only on initial attach and layout-change. */
  const scanAll = (view: FileExplorerView): void => {
    for (const item of Object.values(view.fileItems)) {
      applyBadge(item as FileTreeItem);
    }
  };

  const reattachObservers = (): void => {
    const view = getFileExplorerView(plugin);
    if (!view) return;

    if (!explorerObserver) {
      explorerObserver = new MutationObserver((mutations) => {
        const v = getFileExplorerView(plugin);
        if (!v) return;
        for (const mut of mutations) {
          for (const node of Array.from(mut.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            // node itself may carry data-path, or its descendants do (e.g. folder children wrapper)
            const targets: HTMLElement[] = node.dataset.path
              ? [node]
              : Array.from(node.querySelectorAll<HTMLElement>('[data-path]'));
            for (const el of targets) {
              if (el.dataset.path) applyBadgeForPath(v, el.dataset.path);
            }
          }
        }
      });
    } else {
      // update explorer observer :
      explorerObserver.disconnect();
    }

    explorerObserver.observe(view.containerEl, {
      childList: true,
      subtree: true
    });
    scanAll(view); // Apply badges to all currently visible items in the explorer
  };

  // Reattach observer whenever the layout changes (explorer closed/reopened, pane moved)
  plugin.registerEvent(plugin.app.workspace.on('layout-change', reattachObservers));

  // MutationObserver only catches added nodes, not attribute changes — handle rename explicitly
  plugin.registerEvent(
    plugin.app.vault.on('rename', (file) => {
      const view = getFileExplorerView(plugin);
      if (view) applyBadgeForPath(view, file.path);
    })
  );

  // Initial attach if layout is already ready
  if (plugin.app.workspace.layoutReady) {
    reattachObservers();
  } else {
    plugin.app.workspace.onLayoutReady(reattachObservers);
  }
}

/**
 * Disconnects the MutationObserver and clears any pending debounce timer.
 * Called on plugin unload to prevent memory leaks.
 */
export function cleanupExplorerBadges(): void {
  if (explorerObserver) {
    explorerObserver.disconnect();
    explorerObserver = null;
  }
}

/**
 * Utility to register a handler for Obsidian's 'css-change' event.
 * Returns a cleanup function to unregister the handler.
 *
 * @param app - The Obsidian App instance.
 * @param handler - The callback to execute on CSS change.
 * @returns A function that unregisters the handler when called.
 */
export function onCssChange(app: App, handler: () => void): () => void {
  app.workspace.on('css-change', handler);
  return () => app.workspace.off('css-change', handler);
}
