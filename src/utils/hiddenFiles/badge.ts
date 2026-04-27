import { setIcon } from 'obsidian';
import { type FileExplorerView, type FolderTreeItem } from 'obsidian-typings';
import type CodeFilesPlugin from '../../main.ts';

/**
 * Adds visual badges (eye icon) to folders in the file explorer that contain revealed hidden files.
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function decorateFolders(plugin: CodeFilesPlugin): Promise<void> {
	const explorer = plugin.app.workspace.getLeavesOfType('file-explorer')[0];
	if (!explorer) return;

	const view = explorer.view as FileExplorerView;
	const fileItems = view.fileItems;
	if (!fileItems) return;

	for (const [filePath, item] of Object.entries(fileItems)) {
		const file = plugin.app.vault.getFolderByPath(filePath);
		if (!file) continue;

		const hasRevealed = plugin.settings.revealedFiles[file.path]?.length > 0;
		const selfEl = (item as FolderTreeItem).selfEl;
		const existing = selfEl.querySelector('.hidden-files-badge');

		// Add or remove the eye icon badge based on whether the folder has revealed files
		if (hasRevealed && !existing) {
			const badge = selfEl.createSpan({ cls: 'hidden-files-badge' });
			setIcon(badge, 'eye');
		} else if (!hasRevealed && existing) {
			existing.remove();
		}
	}
}
