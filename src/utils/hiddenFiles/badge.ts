/**
 * Visual indicators for hidden files functionality.
 * Adds eye badges to folders containing manually revealed dotfiles in the file explorer.
 */
import { setIcon } from 'obsidian';
import { type FolderTreeItem } from 'obsidian-typings';
import type CodeFilesPlugin from '../../main.ts';
import { getFileExplorerView } from '../explorerUtils.ts';

/**
 * Adds visual badges (eye icon) to folders in the file explorer that contain revealed hidden files.
 * @param plugin - The plugin instance.
 */
export function decorateFolders(plugin: CodeFilesPlugin): void {
  const view = getFileExplorerView(plugin);
  if (!view) return;

  const fileItems = view.fileItems;

  // Build set of folders that currently have revealed files
  const withRevealed = new Set(
    Object.entries(plugin.settings.revealedItems)
      .filter(([, paths]) => paths.length > 0)
      .map(([fp]) => fp)
  );

  // Remove stale badges via DOM query — avoids iterating all fileItems
  document.querySelectorAll<HTMLElement>('.hidden-files-badge').forEach((badge) => {
    const folderPath = badge.closest('[data-path]')?.getAttribute('data-path') ?? '';
    if (!withRevealed.has(folderPath)) badge.remove();
  });

  // Add missing badges — only iterates revealedItemskeys
  for (const folderPath of withRevealed) {
    const item = fileItems[folderPath];
    if (!item) continue;
    const selfEl = (item as FolderTreeItem).selfEl;
    if (!selfEl || selfEl.querySelector('.hidden-files-badge')) continue;
    const badge = selfEl.createSpan({ cls: 'hidden-files-badge' });
    setIcon(badge, 'eye');
  }
}
