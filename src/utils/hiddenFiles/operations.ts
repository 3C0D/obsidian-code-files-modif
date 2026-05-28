/**
 * Operations for revealing and unrevealing hidden files and folders.
 * Handles persistence, adapter patching, and cross-platform path resolution.
 */
import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter, setBypassPatch } from './state.ts';
import { decorateFolders } from './badge.ts';
import { viewType, type DataAdapterWithInternal } from '../../types/index.ts';
import { getRealPathSafe, isHiddenPath } from '../fileUtils.ts';
import { getExtension, getActiveExtensions } from '../extensionUtils.ts';
import { reconcileItem } from './reconcile.ts';

/**
 * Updates or removes a folder's entry in revealedItems and invalidates the cache.
 * Does NOT save settings — callers handle persistence when batching multiple updates.
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The key (folder path) under which to store the list, as currently keyed in settings (may be non-normalized only during migration).
 * @param paths - The list of revealed item paths for that folder. Empty list removes the entry.
 */
export function setRevealedItemsEntry(
  plugin: CodeFilesPlugin,
  folderPath: string,
  paths: string[]
): void {
  if (paths.length > 0) {
    plugin.settings.revealedItems[folderPath] = paths;
  } else {
    delete plugin.settings.revealedItems[folderPath];
  }
  plugin._revealedItemsCache = null;
}

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
    const realPath = getRealPathSafe(adapter, childPath);
    try {
      const kind = await reconcileItem(adapter, childPath, realPath);
      if (kind === 'folder') {
        await revealFolderContents(plugin, adapter, childPath);
      }
    } catch (e) {
      console.error(`revealFolderContents: error revealing ${childPath}:`, e);
    }
  }
}

/**
 * Reveals an array of items by reconciling each with Obsidian's vault index.
 * Folders are revealed recursively via revealFolderContents.
 * Errors per-item are forwarded to the optional onError callback.
 *
 * @param plugin - The plugin instance.
 * @param adapter - The data adapter.
 * @param itemPaths - Normalized vault-relative paths to reconcile.
 * @param onError - Optional per-item error handler.
 */
export async function reconcileAndRevealAll(
  plugin: CodeFilesPlugin,
  adapter: DataAdapterWithInternal,
  itemPaths: string[],
  onError?: (itemPath: string, e: unknown) => void
): Promise<void> {
  for (const itemPath of itemPaths) {
    try {
      const realPath = getRealPathSafe(adapter, itemPath);
      const kind = await reconcileItem(adapter, itemPath, realPath);
      if (kind === 'folder') {
        await revealFolderContents(plugin, adapter, itemPath);
      }
    } catch (e) {
      onError?.(itemPath, e);
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

  await reconcileAndRevealAll(plugin, adapter, itemPaths, (itemPath, e) =>
    console.error(`Reveal error ${itemPath}:`, e)
  );

  // Persist the revealed state in settings (only for manual reveals)
  if (persist) {
    const existing = plugin.settings.revealedItems[folderPath] ?? [];
    const merged = [...new Set([...existing, ...itemPaths])];
    setRevealedItemsEntry(plugin, folderPath, merged);
    await plugin.saveSettings();
  }

  decorateFolders(plugin);
}

/**
 * Hides previously revealed hidden files or folders from the Obsidian UI.
 * Uses getRealPathSafe which falls back to the original path on Mobile.
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
  setRevealedItemsEntry(plugin, folderPath, remaining);

  await plugin.saveSettings();
  decorateFolders(plugin);
}

/**
 * Reveals a file temporarily when Obsidian restores the active leaf on startup.
 * Called from setState before onLayoutReady — the vault index is not yet populated.
 *
 * Three concerns are handled independently:
 *
 * 1. PARENT HIERARCHY: revealing a file before its parent dot-folder is registered
 *    creates an invalid hierarchy that reconcileFolderCreation can later invalidate.
 *    If the file has a hidden ancestor and a covering entry exists in revealedItems,
 *    reveal that entry first to register the parent folder before the file.
 *
 * 2. FILE ITSELF: revealFolderContents skips dot-basename children, so the covering
 *    entry reveal (step 1) does not guarantee the target file is reconciled.
 *    Always reveal the file directly afterward, whether or not a covering entry existed.
 *
 * 3. RECONCILE PROTECTION: between this call and initRevealedFiles (onLayoutReady),
 *    the background reconciler may call reconcileDeletion on the file. Dot-basename
 *    files are protected by patchAdapter's dot-prefix guard. Non-dot basenames inside
 *    dot-folders are not — their only protection is an entry in temporaryRevealedPaths.
 *    Files managed by isAutoRevealRegisteredDotfile are excluded: they have dot basenames
 *    (protected by the dot guard) and are re-revealed by syncExtensionDotfiles at
 *    onLayoutReady.
 *
 * On close, cleanupTemporaryReveal skips the unreveal if the file is covered by a
 * manually revealed entry, so over-tracking here is safe.
 */
export async function handleTemporaryReveal(
  plugin: CodeFilesPlugin,
  filePath: string
): Promise<void> {
  const normalizedPath = normalizePath(filePath);
  if (plugin.app.vault.getAbstractFileByPath(normalizedPath)) return;
  const stat = await plugin.app.vault.adapter.stat(normalizedPath);
  if (!stat || stat.type === 'folder') return;

  const configDir = plugin.app.vault.configDir;
  const isExternalFile = normalizedPath.startsWith(configDir + '/');
  const ext = getExtension(normalizedPath.split('/').pop() || '');
  const isManagedByAutoReveal =
    !isExternalFile && ext && getActiveExtensions(plugin.settings).includes(ext);

  const parentFolderPath =
    normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || '';

  // --- Concern 1: establish parent folder hierarchy via covering entry ---
  // Only needed when the parent path contains a hidden (dot) segment.
  if (isHiddenPath(parentFolderPath)) {
    const allRevealedItems = Object.values(plugin.settings.revealedItems).flat();
    const coveringEntry = allRevealedItems.find(
      (p) => normalizedPath === p || normalizedPath.startsWith(p + '/')
    );
    if (coveringEntry) {
      const coveringFolderPath =
        coveringEntry.substring(0, coveringEntry.lastIndexOf('/')) || '';
      await revealItems(plugin, coveringFolderPath, [coveringEntry], false);
      // Do NOT return: revealFolderContents skips dot-basename children (concern 2).
    }
  }

  // --- Concern 2: ensure the file itself is reconciled ---
  await revealItems(plugin, parentFolderPath, [normalizedPath], false);

  // --- Concern 3: track for patchAdapter reconcileDeletion protection ---
  if (
    !isManagedByAutoReveal &&
    !plugin.settings.temporaryRevealedPaths.includes(normalizedPath)
  ) {
    plugin.settings.temporaryRevealedPaths.push(normalizedPath);
    await plugin.saveSettings();
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
  // revealedItems is keyed by parent folder, values are the revealed item paths inside it.
  // e.g. { "src/utils": ["src/utils/.prettierrc", "src/utils/.eslintrc"] }
  const srcFolder = src.substring(0, src.lastIndexOf('/')) || '';
  const destFolder = dest.substring(0, dest.lastIndexOf('/')) || '';
  let changed = false;

  // Remove the old path from its parent folder entry
  if (plugin.settings.revealedItems[srcFolder]) {
    const original = plugin.settings.revealedItems[srcFolder];
    const filtered = original.filter((p) => p !== src);
    if (filtered.length !== original.length) {
      setRevealedItemsEntry(plugin, srcFolder, filtered);
      changed = true;
    }
  }

  // Add the new path to the destination folder entry
  if (changed) {
    const existing = plugin.settings.revealedItems[destFolder] ?? [];
    setRevealedItemsEntry(plugin, destFolder, [...existing, dest]);
  }

  if (changed) {
    await plugin.saveSettings();
    decorateFolders(plugin);
  }
}
