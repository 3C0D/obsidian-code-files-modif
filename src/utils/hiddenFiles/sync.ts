/**
 * Synchronization utilities for hidden files.
 * Manages auto-reveal of dotfiles, cleaning stale entries, and batch operations.
 */
import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter } from './state.ts';
import { getExtension, getRealPathSafe } from '../fileUtils.ts';
import { getActiveExtensions } from '../extensionUtils.ts';
import { decorateFolders } from './badge.ts';
import { scanDotEntries } from './scan.ts';
import { revealItems, unrevealItems, revealFolderContents } from './operations.ts';
import { reconcileItem } from './reconcile.ts';

/** Yields control to the event loop to prevent UI blocking during long operations. */
const yieldToEventLoop = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Handles newly registered extensions by cleaning revealedItemsand auto-revealing
 * dotfiles matching the new extensions.
 *
 * @param plugin - The plugin instance.
 * @param extensions - The extensions to sync.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function syncAutoRevealedDotfiles(
  plugin: CodeFilesPlugin,
  extensions: string[]
): Promise<void> {
  if (!plugin.settings.isAutoRevealRegisteredDotfile) return;

  const extSet = new Set(extensions);

  // For each folder in revealedItems, remove entries now auto-managed
  let changed = false;
  for (const [folderPath, paths] of Object.entries(plugin.settings.revealedItems)) {
    const cleaned = paths.filter((p) => {
      const ext = getExtension(p.split('/').pop() || '');
      return !ext || !extSet.has(ext); // keep extension-less files (LICENSE, README) — not extension-managed
    });
    if (cleaned.length !== paths.length) {
      changed = true;
      if (cleaned.length > 0) {
        plugin.settings.revealedItems[folderPath] = cleaned;
      } else {
        delete plugin.settings.revealedItems[folderPath];
      }
      plugin._revealedItemsCache = null;
    }
  }
  if (changed) await plugin.saveSettings();

  // Auto-reveal dotfiles matching the new extensions
  const allFolders = plugin.app.vault.getAllFolders();
  for (let i = 0; i < allFolders.length; i++) {
    // Yield every 30 folders to avoid saturating the event loop on startup
    if (i > 0 && i % 30 === 0) await yieldToEventLoop();

    const folder = allFolders[i];
    const items = await scanDotEntries(plugin, folder.path);
    const toReveal = items
      .filter((item) => {
        if (item.isFolder) return false;
        const ext = getExtension(item.name);
        return ext && extSet.has(ext);
      })
      .map((item) => item.path);
    if (toReveal.length > 0) {
      await revealItems(plugin, folder.path, toReveal, false);
    }
  }

  decorateFolders(plugin);
}

/**
 * Automatically reveals dotfiles whose extensions are registered with Code Files.
 * Scans the entire vault for hidden files and reveals those matching active extensions.
 * Called on plugin startup after restoreRevealedFiles.
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function revealRegisteredDotfiles(plugin: CodeFilesPlugin): Promise<void> {
  if (!plugin.settings.isAutoRevealRegisteredDotfile) return;

  const activeExts = getActiveExtensions(plugin.settings);

  const allFolders = plugin.app.vault.getAllFolders();
  for (let i = 0; i < allFolders.length; i++) {
    // Yield every 30 folders to avoid saturating the event loop on startup
    if (i > 0 && i % 30 === 0) await yieldToEventLoop();

    const folder = allFolders[i];
    const items = await scanDotEntries(plugin, folder.path);
    const toReveal = items
      .filter((item) => {
        if (item.isFolder) return false;
        const ext = getExtension(item.name);
        if (!ext || !activeExts.includes(ext)) return false;
        const revealed = plugin.settings.revealedItems[folder.path] || [];
        return !revealed.includes(item.path);
      })
      .map((item) => item.path);

    if (toReveal.length > 0) {
      await revealItems(plugin, folder.path, toReveal, false);
    }
  }
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
      delete plugin.settings.revealedItems[folderPath];
      if (valid.length > 0) {
        plugin.settings.revealedItems[normFolderPath] = valid;
      }
      plugin._revealedItemsCache = null;
    }
  }

  if (changed) await plugin.saveSettings();
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
  if (!plugin._revealedItemsCache) {
    plugin._revealedItemsCache = new Set(Object.values(plugin.settings.revealedItems).flat());
  }
  const revealedPaths = plugin._revealedItemsCache;

  const toHide = new Map<string, string[]>();

  for (const file of plugin.app.vault.getFiles()) {
    // dotfiles have extension ""
    if (file.extension) continue; // only dotfiles
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
