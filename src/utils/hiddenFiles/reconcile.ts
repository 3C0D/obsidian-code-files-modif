/**
 * Low-level reconciliation utilities for syncing files with Obsidian's vault index.
 * Handles cross-platform differences between Desktop and Mobile APIs.
 */
import type { DataAdapterWithInternal } from '../../types/index.ts';

/**
 * Reconciles a single file or folder with Obsidian's vault index.
 * Handles both Desktop (reconcileFileInternal) and Mobile (reconcileFileChanged) APIs.
 * 
 * @param adapter - The data adapter.
 * @param itemPath - The normalized vault path.
 * @param realPath - The real filesystem path.
 * @param isFolder - Whether the item is a folder.
 */
export async function reconcileItem(
  adapter: DataAdapterWithInternal,
  itemPath: string,
  realPath: string,
  isFolder: boolean
): Promise<void> {
  if (isFolder) {
    await adapter.reconcileFolderCreation(realPath, itemPath);
  } else {
    if (adapter.reconcileFileInternal) {
      await adapter.reconcileFileInternal(realPath, itemPath);
    } else if (
      adapter.fs?.stat &&
      adapter.reconcileFileChanged &&
      adapter.getFullRealPath
    ) {
      const fsStat = await adapter.fs.stat(adapter.getFullRealPath(realPath));
      if (fsStat.type === 'file') {
        await adapter.reconcileFileChanged(realPath, itemPath, fsStat);
      }
    }
  }
}
