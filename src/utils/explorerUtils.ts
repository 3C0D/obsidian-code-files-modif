/**
 * Visual highlighting for the project root folder in the file explorer.
 * Adds/removes a CSS class to the folder title element to show which folder
 * is set as the project root for TypeScript/JavaScript cross-file navigation.
 * The highlight color is customizable via plugin settings.
 */
import type CodeFilesPlugin from '../main.ts';
import type { FileExplorerView, FileTreeItem, FolderTreeItem } from 'obsidian-typings';
import { TFile, TFolder } from 'obsidian';
import { getActiveExtensions } from './extensionUtils.ts';
import { getExtension } from './fileUtils.ts';

const PROJECT_ROOT_CLASS = 'code-files-project-root-folder';

/**
 * Core badge logic: applies extension badge and unregistered styling to a file.
 * Extracted to avoid duplication between FileTreeItem and DOM-based approaches.
 */
const applyBadgeLogic = (
  file: TFile,
  tagEl: HTMLElement | null,
  plugin: CodeFilesPlugin
): void => {
  if (!tagEl) return;

  tagEl.classList.remove('code-files-unregistered-badge');

  if (!file.extension) {
    const ext = getExtension(file.name);
    const activeExts = getActiveExtensions(plugin.settings);
    if (ext && activeExts.includes(ext) && !tagEl.textContent) {
      tagEl.textContent = ext.toUpperCase();
    }
    return;
  }

  if (!plugin.app.viewRegistry.typeByExtension[file.extension]) {
    tagEl.classList.add('code-files-unregistered-badge');
  }
};

/**
 * Applies badge styling to a FileTreeItem (relies on fileItems being populated).
 */
const applyBadge = (item: FileTreeItem, plugin: CodeFilesPlugin): void => {
  const file = item.file;
  if (!(file instanceof TFile)) return;

  const tagEl = item.selfEl?.querySelector<HTMLElement>('.nav-file-tag');
  applyBadgeLogic(file, tagEl, plugin);
};

/**
 * Applies badge styling directly to a file explorer DOM element.
 * Unlike applyBadge(), does not depend on fileItems being populated,
 * making it safe to call synchronously inside MutationObserver callbacks.
 */
const applyBadgeToEl = (el: HTMLElement, plugin: CodeFilesPlugin): void => {
  const path = el.dataset.path;
  if (!path) return;

  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;

  const tagEl = el.querySelector<HTMLElement>('.nav-file-tag');
  applyBadgeLogic(file, tagEl, plugin);
};

/** Helper to get the active file explorer view and its items */
export const getFileExplorerView = (
  plugin: CodeFilesPlugin
): FileExplorerView | undefined => {
  // Unsafe cast is intentional: FileExplorerView is an internal Obsidian API,
  // so we cast the generic view to our custom interface.
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
let previousView: FileExplorerView | null = null;

/**
 * Ensures dotfiles (.env, .gitignore) show their extension as a badge in the
 * file explorer, matching Obsidian's native behavior for regular files.
 * Uses a MutationObserver to catch folder expansions dynamically and apply
 * badges only to newly added nodes via their data-path attribute.
 *
 *  @param plugin - The plugin instance.
 */
export function setupExplorerBadges(plugin: CodeFilesPlugin): void {
  const applyBadgeForPath = (view: FileExplorerView, path: string): void => {
    const item = view.fileItems[path] as FileTreeItem | undefined;
    if (item) applyBadge(item, plugin);
  };

  /** Full scan — only on initial attach and layout-change. */
  const scanAll = (view: FileExplorerView): void => {
    for (const item of Object.values(view.fileItems)) {
      applyBadge(item as FileTreeItem, plugin);
    }
  };

  const reattachObservers = (): void => {
    const view = getFileExplorerView(plugin);
    if (!view) return;

    const viewChanged = view !== previousView;
    previousView = view;

    if (!explorerObserver) {
      explorerObserver = new MutationObserver((mutations) => {
        for (const mut of mutations) {
          for (const node of Array.from(mut.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;

            const targets = new Set<HTMLElement>();

            if (node.dataset.path) {
              targets.add(node);
            } else {
              // The node might be a child added later (e.g., span.nav-file-tag)
              const parent = node.closest<HTMLElement>('[data-path]');
              if (parent) targets.add(parent);

              // Or it might be a container of files
              node.querySelectorAll<HTMLElement>('[data-path]').forEach(el => targets.add(el));
            }

            for (const el of targets) {
              applyBadgeToEl(el, plugin); // DOM-based: no fileItems lookup, no defer needed
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
    if (viewChanged) {
      scanAll(view); // Apply badges to all currently visible items in the explorer
    }
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
  previousView = null;
}

/**
 * Re-scans all currently visible file explorer items to apply badges.
 * Call this after async operations that reveal new files (e.g. restoreRevealedFiles),
 * since the initial scanAll in setupExplorerBadges may have run before those files
 * were added to fileItems.
 *
 * @param plugin - The plugin instance.
 */
export function rescanExplorerBadges(plugin: CodeFilesPlugin): void {
  const view = getFileExplorerView(plugin);
  if (!view) return;
  for (const item of Object.values(view.fileItems)) {
    applyBadge(item as FileTreeItem, plugin);
  }
}


