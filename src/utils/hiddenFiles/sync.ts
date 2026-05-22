/**
 * Synchronization utilities for hidden files.
 * Manages auto-reveal of dotfiles, cleaning stale entries, and batch operations.
 */
import { normalizePath, type TAbstractFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter, getRevealedItemsCache } from './state.ts';
import { getRealPathSafe } from '../fileUtils.ts';
import { getExtension, getActiveExtensions } from '../extensionUtils.ts';
import { decorateFolders } from './badge.ts';
import { scanDotEntries } from './scan.ts';
import {
  revealItems,
  unrevealItems,
  revealFolderContents,
  setRevealedItemsEntry
} from './operations.ts';
import { reconcileItem } from './reconcile.ts';
import { unrevealProjectDotfiles } from '../projectUtils.ts';
import { updateProjectFolderHighlight } from '../explorerUtils.ts';

/** Yields control to the event loop to prevent UI blocking during long operations. */
const yieldToEventLoop = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

async function forEachVaultFolder(
  plugin: CodeFilesPlugin,
  callback: (folderPath: string) => Promise<void>
): Promise<void> {
  const allFolders = plugin.app.vault.getAllFolders();
  for (let i = 0; i < allFolders.length; i++) {
    if (i > 0 && i % 30 === 0) await yieldToEventLoop();
    await callback(allFolders[i].path);
  }
}

/**
 * Handles newly registered extensions by cleaning revealedItems and auto-revealing
 * dotfiles matching the new extensions. Uses active extensions from plugin settings.
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function syncAutoRevealedDotfiles(
  plugin: CodeFilesPlugin
): Promise<void> {
  if (!plugin.settings.isAutoRevealRegisteredDotfile) return;

  const extensions = getActiveExtensions(plugin.settings);
  const extSet = new Set(extensions);

  // For each folder in revealedItems, remove entries now auto-managed
  let changed = false;
  for (const [folderPath, paths] of Object.entries(plugin.settings.revealedItems)) {
    const cleaned = paths.filter((p) => {
      const ext = getExtension(p.split('/').pop()!);
      return ext && !extSet.has(ext); // keep not extension-managed
    });
    if (cleaned.length !== paths.length) {
      changed = true;
      setRevealedItemsEntry(plugin, folderPath, cleaned);
    }
  }
  if (changed) await plugin.saveSettings();

  // Scan the entire vault and auto-reveal dotfiles.
  await forEachVaultFolder(plugin, async (folderPath) => {
    const items = await scanDotEntries(plugin, folderPath);
    const toReveal = items
      .filter((item) => {
        if (item.isFolder) return false;
        const ext = getExtension(item.name);
        return ext && extSet.has(ext);
      })
      .map((item) => item.path);
    if (toReveal.length > 0) {
      await revealItems(plugin, folderPath, toReveal, false);
    }
  });

  decorateFolders(plugin);
}

/**
 * Re-reveals all files stored in the plugin settings.
 * This is called on plugin startup to restore the user's view.
 * Uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function restoreRevealedFiles(plugin: CodeFilesPlugin): Promise<void> {
  const adapter = getAdapter(plugin);

  for (const [, itemPaths] of Object.entries(plugin.settings.revealedItems)) {
    for (const itemPath of itemPaths) {
      const realPath = getRealPathSafe(adapter, itemPath);
      try {
        const stat = await adapter.stat(itemPath);
        if (!stat) continue;

        await reconcileItem(adapter, itemPath, realPath, stat.type === 'folder');

        if (stat.type === 'folder') {
          await revealFolderContents(plugin, adapter, itemPath);
        }
      } catch {
        // File or folder no longer exists or access denied
      }
    }
  }
}

/**
 * Cleans up the list of revealed files by removing entries that no longer exist on disk.
 * Also normalizes paths in settings to ensure consistency.
 *
 * This version uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function cleanStaleRevealedFiles(plugin: CodeFilesPlugin): Promise<void> {
  const adapter = getAdapter(plugin);
  let changed = false;

  for (const [folderPath, itemPaths] of Object.entries(plugin.settings.revealedItems)) {
    let normFolderPath = normalizePath(folderPath);
    if (normFolderPath === '/') normFolderPath = '';

    // Verify each revealed file still exists using the cross-platform adapter
    const valid: string[] = [];
    for (const p of itemPaths) {
      const normItemPath = normalizePath(p);
      if (await adapter.exists(normItemPath)) {
        valid.push(normItemPath);
      }
    }

    // Update settings if any path was normalized or a stale entry was removed
    if (folderPath !== normFolderPath || valid.length !== itemPaths.length) {
      changed = true;
      if (folderPath !== normFolderPath) {
        setRevealedItemsEntry(plugin, folderPath, []);
      }
      setRevealedItemsEntry(plugin, normFolderPath, valid);
    }
  }

  if (changed) await plugin.saveSettings();
}

/**
 * Handles cleanup of settings (revealedItems, projectRootFolder) when a file or folder is deleted.
 * Registered as a 'delete' event on the vault.
 *
 * @param plugin - The plugin instance.
 * @param file - The file or folder that was deleted.
 */
export async function handleFileDeletion(
  plugin: CodeFilesPlugin,
  file: TAbstractFile
): Promise<void> {
  const itemPath = file.path;
  let changed = false;

  // 1. Clean up revealedItems
  for (const [folderPath, paths] of Object.entries(plugin.settings.revealedItems)) {
    const filtered = paths.filter((p) => p !== itemPath && !p.startsWith(itemPath + '/'));
    if (filtered.length !== paths.length) {
      changed = true;
      setRevealedItemsEntry(plugin, folderPath, filtered);
    }
  }

  // 2. Clear projectRootFolder if the deleted item was the project root
  if (itemPath === plugin.settings.projectRootFolder) {
    const oldRoot = plugin.settings.projectRootFolder;
    plugin.settings.projectRootFolder = '';
    if (plugin.settings.showHiddenFiles) {
      await unrevealProjectDotfiles(plugin, oldRoot);
    }
    updateProjectFolderHighlight(plugin);
    changed = true;
  }

  if (changed) {
    await plugin.saveSettings();
  }
}

/**
 * Registers the vault 'delete' event handler to clean up hidden files settings.
 * @param plugin - The plugin instance.
 */
export function registerHiddenFilesDeleteHandler(plugin: CodeFilesPlugin): void {
  plugin.registerEvent(
    plugin.app.vault.on('delete', (file) => {
      void handleFileDeletion(plugin, file);
    })
  );
}

/**
 * Hides all auto-revealed dotfiles (those with registered extensions that are not manually revealed).
 * Called when the auto-reveal toggle is turned off.
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function hideAutoRevealedDotfiles(plugin: CodeFilesPlugin): Promise<void> {
  const activeExts = getActiveExtensions(plugin.settings);
  const revealedPaths = getRevealedItemsCache(plugin);

  const toHide = new Map<string, string[]>();

  for (const file of plugin.app.vault.getFiles()) {
    if (!file.name.startsWith('.')) continue; // only dotfiles
    const ext = getExtension(file.name);
    if (!ext || !activeExts.includes(ext)) continue;
    if (revealedPaths.has(file.path)) continue;
    const folder = file.parent?.path ?? '';
    if (!toHide.has(folder)) toHide.set(folder, []);
    toHide.get(folder)!.push(file.path);
  }

  for (const [folderPath, paths] of toHide) {
    await unrevealItems(plugin, folderPath, paths);
  }
}

/**
 * Unreveals all items that were previously revealed but are now excluded
 * via the excludedFolders setting. Called when the user adds entries to excludedFolders.
 *
 * @param plugin - The plugin instance.
 * @param newlyExcluded - Folder basenames just added to excludedFolders (e.g. ['.obsidian']).
 */
export async function unrevealExcludedFolders(
  plugin: CodeFilesPlugin,
  newlyExcluded: string[]
): Promise<void> {
  const excludedSet = new Set(newlyExcluded);
  // Snapshot to avoid mutation during iteration
  const snapshot = { ...plugin.settings.revealedItems };

  for (const [folderPath, itemPaths] of Object.entries(snapshot)) {
    // Case 1: folderPath is rooted inside a newly excluded folder
    // e.g. '.obsidian' or '.obsidian/plugins' when '.obsidian' is excluded
    const firstSegment = folderPath.split('/')[0];
    if (firstSegment && excludedSet.has(firstSegment)) {
      await unrevealItems(plugin, folderPath, [...itemPaths]);
      continue;
    }
    // Case 2: some revealed items in this folder are now-excluded dot-folders
    const toUnreveal = itemPaths.filter((p) => excludedSet.has(p.split('/').pop() || ''));
    if (toUnreveal.length > 0) {
      await unrevealItems(plugin, folderPath, toUnreveal);
    }
  }
}
