/**
 * Operations for revealing and unrevealing hidden files and folders.
 * Handles persistence, adapter patching, and cross-platform path resolution.
 */
import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter, setBypassPatch } from './state.ts';
import { decorateFolders } from './badge.ts';
import { viewType, type DataAdapterWithInternal } from '../../types/index.ts';
import { getExtension, getRealPathSafe } from '../fileUtils.ts';
import { getActiveExtensions } from '../extensionUtils.ts';
import { reconcileItem } from './reconcile.ts';

/**
 * Reveals all non-hidden (non-dot) children of a folder, recursively.
 * Called automatically when a dot-folder is revealed to make its contents visible in the vault.
 * Does not persist to settings — folder persistence is handled by the parent call.
 *
 * @internal
 * @param plugin - The plugin instance.
 * @param adapter - The data adapter.
 * @param folderPath - The normalized path of the folder whose contents to reveal.
 */
export async function revealFolderContents(
  plugin: CodeFilesPlugin,
  adapter: DataAdapterWithInternal,
  folderPath: string
): Promise<void> {
  let listed: { files: string[]; folders: string[] };
  try {
    listed = await adapter.list(folderPath);
  } catch (e) {
    console.error(`revealFolderContents: error listing ${folderPath}:`, e);
    return;
  }

  for (const rawPath of [...listed.files, ...listed.folders]) {
    const childPath = normalizePath(rawPath);
    const basename = childPath.split('/').pop() || '';
    if (basename.startsWith('.')) continue; // skip hidden children
    const isFolder = listed.folders.some((f) => normalizePath(f) === childPath);
    const realPath = getRealPathSafe(adapter, childPath);
    try {
      await reconcileItem(adapter, childPath, realPath, isFolder);
      if (isFolder) {
        await revealFolderContents(plugin, adapter, childPath);
      }
    } catch (e) {
      console.error(`revealFolderContents: error revealing ${childPath}:`, e);
    }
  }
}

/**
 * Reveals specified hidden files or folders in the Obsidian UI.
 * Uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The parent folder path (normalized vault-relative).
 * @param itemPaths - Array of vault-relative paths to the items (files or folders) to reveal.
 * @param persist - If true (default), saves revealed items to the revealedItems setting (manual reveal only).
 * @returns A Promise that resolves when all items have been processed.
 */
export async function revealItems(
  plugin: CodeFilesPlugin,
  folderPath: string,
  itemPaths: string[],
  persist = true
): Promise<void> {
  folderPath = normalizePath(folderPath);
  if (folderPath === '/') folderPath = '';
  itemPaths = itemPaths.map((p) => normalizePath(p));
  const adapter = getAdapter(plugin);

  for (const itemPath of itemPaths) {
    try {
      // check if the item exists (file or folder)
      const stat = await adapter.stat(itemPath);
      if (!stat) continue;

      const realPath = getRealPathSafe(adapter, itemPath);
      await reconcileItem(adapter, itemPath, realPath, stat.type === 'folder');

      if (stat.type === 'folder') {
        await revealFolderContents(plugin, adapter, itemPath);
      }
    } catch (e) {
      console.error(`Reveal error ${itemPath}:`, e);
    }
  }

  // Persist the revealed state in settings (only for manual reveals)
  if (persist) {
    const existing = plugin.settings.revealedItems[folderPath] ?? [];
    plugin.settings.revealedItems[folderPath] = [...new Set([...existing, ...itemPaths])];
    plugin._revealedItemsCache = null;
    await plugin.saveSettings();
  }

  decorateFolders(plugin);
}

/**
 * Hides previously revealed hidden files or folders from the Obsidian UI.
 * Uses getRealPathSafe which falls back to the original path on Mobile, making this function fully cross-platform.
 * If temporary is true, only removes the file from the vault index without
 * persisting any changes to settings, decorating folders, or showing a notice.
 * Use this for files revealed transiently (e.g. opened via ChooseHiddenFileModal).
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The parent folder path (normalized vault-relative).
 * @param itemPaths - Array of vault-relative paths (files or folders) to hide.
 * @param temporary - Defaults to false. If true, skip settings, notice, badges, and persist.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function unrevealItems(
  plugin: CodeFilesPlugin,
  folderPath: string,
  itemPaths: string[],
  temporary = false
): Promise<void> {
  folderPath = normalizePath(folderPath);
  if (folderPath === '/') folderPath = '';
  itemPaths = itemPaths.map((p) => normalizePath(p));
  const adapter = getAdapter(plugin);

  // Temporarily allow reconcileDeletion to work for dotfiles
  setBypassPatch(true);
  try {
    for (const itemPath of itemPaths) {
      const realPath = getRealPathSafe(adapter, itemPath);
      // Remove the item from Obsidian's vault index
      await adapter.reconcileDeletion(realPath, itemPath);
    }
  } finally {
    setBypassPatch(false);
  }

  if (temporary) return; // skip settings, notice, badges

  // Remove from persisted settings
  const remaining = (plugin.settings.revealedItems[folderPath] || []).filter(
    (p) => !itemPaths.includes(p)
  );

  if (remaining.length > 0) {
    plugin.settings.revealedItems[folderPath] = remaining;
  } else {
    delete plugin.settings.revealedItems[folderPath];
  }

  plugin._revealedItemsCache = null;
  await plugin.saveSettings();
  decorateFolders(plugin);
}

/**
 * Reveals a file temporarily (e.g. when restoring workspace state).
 * Tracks the file in temporaryRevealedPaths so it can be unrevealed on close.
 */
export async function handleTemporaryReveal(
  plugin: CodeFilesPlugin,
  filePath: string
): Promise<void> {
  const normalizedPath = normalizePath(filePath);
  const stat = await plugin.app.vault.adapter.stat(normalizedPath);
  if (!stat || stat.type === 'folder') return;
  if (!plugin.app.vault.getAbstractFileByPath(normalizedPath)) {
    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '';
    await revealItems(plugin, folderPath, [normalizedPath], false); // silent, no persist

    // Track as temporary unless managed by isAutoRevealRegisteredDotfile.
    // External files (configDir) are always tracked because they're never
    // managed by isAutoRevealRegisteredDotfile (which only scans dotfiles).
    const configDir = plugin.app.vault.configDir;
    const isExternalFile = normalizedPath.startsWith(configDir + '/');
    const ext = getExtension(normalizedPath.split('/').pop() || '');
    const isManagedByAutoReveal =
      !isExternalFile && ext && getActiveExtensions(plugin.settings).includes(ext);

    if (
      !isManagedByAutoReveal &&
      !plugin.settings.temporaryRevealedPaths.includes(normalizedPath)
    ) {
      plugin.settings.temporaryRevealedPaths.push(normalizedPath);
      await plugin.saveSettings();
    }
  }
}

/**
 * Cleans up a temporarily revealed file when it is closed.
 * Unreveals it unless it is covered by a manual reveal (file or ancestor folder).
 * External files (configDir) are never unrevealed, only removed from temporaryRevealedPaths.
 */
export async function cleanupTemporaryReveal(
  plugin: CodeFilesPlugin,
  filePath: string
): Promise<void> {
  const normalizedPath = normalizePath(filePath);
  const stat = await plugin.app.vault.adapter.stat(normalizedPath);
  if (!stat || stat.type === 'folder') return;
  const tmp = plugin.settings.temporaryRevealedPaths;
  if (tmp.includes(normalizedPath)) {
    // Don't unreveal if the file is still open in another leaf —
    // Obsidian may have reused this leaf to open another file, closing
    // the dotfile view without the user explicitly closing it.
    // Check via getViewState() to catch uninitialized leaves too.
    const stillOpen = plugin.app.workspace
      .getLeavesOfType(viewType)
      .some((l) => l.getViewState().state?.file === normalizedPath);
    if (stillOpen) return;

    // External files (configDir) should never be unrevealed, only removed from tracking
    const configDir = plugin.app.vault.configDir;
    const isExternalFile = normalizedPath.startsWith(configDir + '/');

    if (!isExternalFile) {
      const allRevealedItems = Object.values(plugin.settings.revealedItems).flat();
      const manuallyRevealed = allRevealedItems.some(
        (p) => normalizedPath === p || normalizedPath.startsWith(p + '/')
      );
      if (!manuallyRevealed) {
        const folderPath =
          normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '';
        await unrevealItems(plugin, folderPath, [normalizedPath], true);
      }
    }

    plugin.settings.temporaryRevealedPaths = tmp.filter((p) => p !== normalizedPath);
    await plugin.saveSettings();
  }
}

/**
 * Updates the revealedItems setting when a file or folder is renamed.
 * This ensures that manually revealed items stay revealed under their new name.
 * 
 * @param plugin - The plugin instance.
 * @param src - The original normalized path.
 * @param dest - The new normalized path.
 */
export async function updateRevealedItemsOnRename(
  plugin: CodeFilesPlugin,
  src: string,
  dest: string
): Promise<void> {
  const srcFolder = src.substring(0, src.lastIndexOf('/')) || '';
  const destFolder = dest.substring(0, dest.lastIndexOf('/')) || '';
  let changed = false;

  // Remove from source folder
  if (plugin.settings.revealedItems[srcFolder]) {
    const original = plugin.settings.revealedItems[srcFolder];
    const filtered = original.filter((p) => p !== src);
    if (filtered.length !== original.length) {
      // src was actually in revealedItems
      if (filtered.length > 0) {
        plugin.settings.revealedItems[srcFolder] = filtered;
      } else {
        delete plugin.settings.revealedItems[srcFolder];
      }
      changed = true;
    }
  }

  // Add to destination folder
  if (changed) {
    const existing = plugin.settings.revealedItems[destFolder] ?? [];
    plugin.settings.revealedItems[destFolder] = [...existing, dest];
  }

  if (changed) {
    await plugin.saveSettings();
    decorateFolders(plugin);
  }
}
