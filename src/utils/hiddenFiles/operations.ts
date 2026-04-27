import { Notice, normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter, setBypassPatch } from './state.ts';
import { decorateFolders } from './badge.ts';

/**
 * Reveals specified hidden files in the Obsidian UI.
 * Uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The parent folder path.
 * @param itemPaths - Array of relative paths to reveal.
 * @param silent - Defaults to false. If true, don't show a notice (for auto-reveal).
 * @param persist - Defaults to true. If true, save to revealedFiles settings (manual reveal only).
 * @returns A Promise that resolves when the operation is complete.
 */
export async function revealFiles(
	plugin: CodeFilesPlugin,
	folderPath: string,
	itemPaths: string[],
	silent = false,
	persist = true
): Promise<void> {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';
	itemPaths = itemPaths.map((p) => normalizePath(p));
	const adapter = getAdapter(plugin);

	for (const itemPath of itemPaths) {
		try {
			const stat = await adapter.stat(itemPath);
			if (!stat) continue;

			const realPath = adapter.getRealPath(itemPath);

			// Force Obsidian to "see" and display the item.
			// Pattern: use reconcileFileInternal if available (Desktop),
			// otherwise fallback to reconcileFileChanged via adapter.fs (Mobile).
			if (stat.type === 'folder') {
				await adapter.reconcileFolderCreation(realPath, itemPath);
			} else {
				if (adapter.reconcileFileInternal) {
					await adapter.reconcileFileInternal(realPath, itemPath);
				} else if (
					adapter.fs?.stat &&
					adapter.reconcileFileChanged &&
					adapter.getFullRealPath
				) {
					const fsStat = await adapter.fs.stat(
						adapter.getFullRealPath(realPath)
					);
					if (fsStat.type === 'file') {
						await adapter.reconcileFileChanged(realPath, itemPath, fsStat);
					}
				}
			}
		} catch (e) {
			console.error(`Reveal error ${itemPath}:`, e);
		}
	}

	// Persist the revealed state in settings (only for manual reveals)
	if (persist) {
		const existing = plugin.settings.revealedFiles[folderPath] ?? [];
		plugin.settings.revealedFiles[folderPath] = [
			...new Set([...existing, ...itemPaths])
		];
		await plugin.saveSettings();
	}

	decorateFolders(plugin);
	if (!silent) {
		new Notice(`${itemPaths.length} item(s) revealed`);
	}
}

/**
 * Hides previously revealed hidden files from the Obsidian UI.
 * getRealPath() is a FileSystemAdapter method (Desktop). On Mobile,
 * this function may have limited behavior depending on the adapter implementation.
 * If temporary is true, only removes the file from the vault index without
 * persisting any changes to settings, decorating folders, or showing a notice.
 * Use this for files revealed transiently (e.g. opened via ChooseHiddenFileModal).
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The parent folder path.
 * @param itemPaths - Array of relative paths to hide.
 * @param temporary - Defaults to false. If true, skip settings, notice, badges, and persist.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function unrevealFiles(
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
		for (const filePath of itemPaths) {
			const realPath = adapter.getRealPath(filePath);
			// Remove the file from Obsidian's vault index
			await adapter.reconcileDeletion(realPath, filePath);
		}
	} finally {
		setBypassPatch(false);
	}

	if (temporary) return; // skip settings, notice, badges

	// Remove from persisted settings
	const remaining = (plugin.settings.revealedFiles[folderPath] || []).filter(
		(p) => !itemPaths.includes(p)
	);

	if (remaining.length > 0) {
		plugin.settings.revealedFiles[folderPath] = remaining;
	} else {
		delete plugin.settings.revealedFiles[folderPath];
	}

	await plugin.saveSettings();
	decorateFolders(plugin);
	new Notice(`${itemPaths.length} file(s) hidden`);
}
