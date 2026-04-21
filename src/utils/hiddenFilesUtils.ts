/**
 * Manages hidden files (dotfiles) exclusively from folders in the Obsidian file explorer.
 * When a folder contains revealed hidden files, a badge with a green eye icon is added to it.
 *
 * Mechanisms:
 * 1. Patch Obsidian's data adapter to prevent automatic deletion of revealed dotfiles.
 * 2. Scan for and reveal/hide dotfiles via folder context menus.
 * 3. Persist and restore revealed files state across sessions.
 */

import { Notice, setIcon, normalizePath } from 'obsidian';
import {
	type FileExplorerView,
	type FolderTreeItem,
	type DataAdapterEx
} from 'obsidian-typings';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import { around } from 'monkey-around';
import type CodeFilesPlugin from '../main.ts';
import type { DataAdapterWithInternal, HiddenItem } from '../types/types.ts';

/**
 * Global flag used to temporarily bypass the deletion patch.
 * Set to true when the user explicitly chooses to hide a previously revealed file.
 */
let _bypassPatch = false;

/**
 * Retrieves the platform-specific data adapter.
 * @internal
 */
function getAdapter(plugin: CodeFilesPlugin): DataAdapterWithInternal {
	return getDataAdapterEx(plugin.app) as unknown as DataAdapterWithInternal;
}

/**
 * Patches Obsidian's DataAdapter to prevent the automatic removal of dotfiles from the UI.
 * Obsidian's internal reconciliation often tries to "clean up" (delete from view) files
 * that shouldn't be there according to its default rules.
 *
 * @param plugin - The plugin instance.
 * @returns A function to unpatch the adapter.
 */
export function patchAdapter(plugin: CodeFilesPlugin): () => void {
	const adapter = getAdapter(plugin);

	// Prevent Obsidian from auto-deleting revealed dotfiles during its internal reconciliation
	return around(adapter, {
		reconcileDeletion(next) {
			return async function (
				this: DataAdapterEx,
				realPath: string,
				normalizedPath: string
			) {
				const basename = normalizedPath.split('/').pop() || '';
				// Block automatic deletion of dotfiles unless _bypassPatch is active
				// (which means the user explicitly clicked "Hide")
				if (basename.startsWith('.') && !_bypassPatch) {
					return;
				}
				return next.call(this, realPath, normalizedPath);
			};
		}
	});
}

/**
 * Cleans up the list of revealed files by removing entries that no longer exist on disk.
 * Also normalizes paths in settings to ensure consistency.
 *
 * This version uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 */
export async function cleanStaleRevealedFiles(plugin: CodeFilesPlugin): Promise<void> {
	const adapter = getAdapter(plugin);
	let changed = false;

	for (const [folderPath, itemPaths] of Object.entries(plugin.settings.revealedFiles)) {
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
			delete plugin.settings.revealedFiles[folderPath];
			if (valid.length > 0) {
				plugin.settings.revealedFiles[normFolderPath] = valid;
			}
		}
	}

	if (changed) await plugin.saveSettings();
}

/**
 * Re-reveals all files stored in the plugin settings.
 * This is called on plugin startup to restore the user's view.
 *
 * This version uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 */
export async function restoreRevealedFiles(plugin: CodeFilesPlugin): Promise<void> {
	const adapter = getAdapter(plugin);

	for (const [_, itemPaths] of Object.entries(plugin.settings.revealedFiles)) {
		for (const itemPath of itemPaths) {
			const realPath = adapter.getRealPath(itemPath);
			try {
				const stat = await adapter.stat(itemPath);
				if (!stat) continue;

				// Manually trigger Obsidian's internal reconciliation to add the item back to the UI.
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
							await adapter.reconcileFileChanged(
								realPath,
								itemPath,
								fsStat
							);
						}
					}
				}
			} catch {
				// File or folder no longer exists or access denied
			}
		}
	}
}

/**
 * Adds visual badges (eye icon) to folders in the file explorer that contain revealed hidden files.
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

/**
 * Scans a folder on the physical file system to find hidden items (starting with a dot).
 * Respects exclusion settings for folders and extensions.
 *
 * This version is fully cross-platform (Desktop & Mobile) as it uses Obsidian's
 * internal listRecursive method which bypasses the default dotfile filtering.
 *
 * @param plugin - The plugin instance.
 * @param folderPath - Normalized path of the folder to scan.
 * @returns Array of found hidden items.
 */
export async function scanHiddenFiles(
	plugin: CodeFilesPlugin,
	folderPath: string
): Promise<HiddenItem[]> {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';

	const adapter = getAdapter(plugin);
	const items: HiddenItem[] = [];

	try {
		// listRecursive is an internal Obsidian method that returns ALL files/folders,
		// including those starting with a dot.
		if (!adapter.listRecursive) return items;
		const { files, folders } = await adapter.listRecursive('');

		const allEntries = [
			...files.map((p) => ({ path: p, isFolder: false })),
			...folders.map((p) => ({ path: p, isFolder: true }))
		];

		for (const entry of allEntries) {
			const entryPath = normalizePath(entry.path);
			const basename = entryPath.split('/').pop() || '';

			// Only process items starting with a dot
			if (!basename.startsWith('.')) continue;

			// Check if the item is directly inside the requested folder
			const parentPath = entryPath.substring(0, entryPath.lastIndexOf('/')) || '';
			if (parentPath !== folderPath) continue;

			// Filter out excluded folders
			if (entry.isFolder && plugin.settings.excludedFolders.includes(basename)) {
				continue;
			}

			if (!entry.isFolder) {
				// Handle extensions for hidden files (e.g. '.env' -> 'env')
				const ext = basename.substring(1);
				const actualExt = ext.split('.').pop() || ext;

				// Filter out excluded extensions
				if (plugin.settings.excludedExtensions.includes(actualExt)) {
					continue;
				}
			}

			// Get stats for size (best effort)
			let size = 0;
			try {
				const stat = await adapter.stat(entryPath);
				if (stat) size = stat.size;
			} catch {
				/* ignore stat errors */
			}

			items.push({
				name: basename,
				path: entryPath,
				isFolder: entry.isFolder,
				size
			});
		}

		// Sort: folders first, then alphabetically
		items.sort((a, b) => {
			if (a.isFolder && !b.isFolder) return -1;
			if (!a.isFolder && b.isFolder) return 1;
			return a.name.localeCompare(b.name);
		});
	} catch (e) {
		console.error('Scan error:', e);
	}

	return items;
}

/**
 * Reveals specified hidden files in the Obsidian UI.
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The parent folder path.
 * @param itemPaths - Array of relative paths to reveal.
 *
 * This version uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 */
export async function revealFiles(
	plugin: CodeFilesPlugin,
	folderPath: string,
	itemPaths: string[]
): Promise<void> {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';
	itemPaths = itemPaths.map((p) => normalizePath(p));
	const adapter = getAdapter(plugin);

	for (const itemPath of itemPaths) {
		const normItemPath = normalizePath(itemPath);
		try {
			const stat = await adapter.stat(normItemPath);
			if (!stat) continue;

			const realPath = adapter.getRealPath(normItemPath);

			// Force Obsidian to "see" and display the item.
			// Pattern: use reconcileFileInternal if available (Desktop),
			// otherwise fallback to reconcileFileChanged via adapter.fs (Mobile).
			if (stat.type === 'folder') {
				await adapter.reconcileFolderCreation(realPath, normItemPath);
			} else {
				if (adapter.reconcileFileInternal) {
					await adapter.reconcileFileInternal(realPath, normItemPath);
				} else if (
					adapter.fs?.stat &&
					adapter.reconcileFileChanged &&
					adapter.getFullRealPath
				) {
					const fsStat = await adapter.fs.stat(
						adapter.getFullRealPath(realPath)
					);
					if (fsStat.type === 'file') {
						await adapter.reconcileFileChanged(
							realPath,
							normItemPath,
							fsStat
						);
					}
				}
			}
		} catch (e) {
			console.error(`Reveal error ${itemPath}:`, e);
		}
	}

	// Persist the revealed state in settings
	const existing = plugin.settings.revealedFiles[folderPath] ?? [];
	plugin.settings.revealedFiles[folderPath] = [...new Set([...existing, ...itemPaths])];
	await plugin.saveSettings();

	decorateFolders(plugin);
	new Notice(`${itemPaths.length} item(s) revealed`);
}

/**
 * Hides previously revealed hidden files from the Obsidian UI.
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The parent folder path.
 * @param itemPaths - Array of relative paths to hide.
 *
 * Note: getRealPath() is a FileSystemAdapter method (Desktop). On Mobile,
 * this function may have limited behavior depending on the adapter implementation.
 */
export async function hideFilesInFolder(
	plugin: CodeFilesPlugin,
	folderPath: string,
	itemPaths: string[]
): Promise<void> {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';
	itemPaths = itemPaths.map((p) => normalizePath(p));
	const adapter = getAdapter(plugin);

	// Temporarily allow reconcileDeletion to work for dotfiles
	_bypassPatch = true;
	for (const filePath of itemPaths) {
		const realPath = adapter.getRealPath(filePath);
		// Trigger a deletion reconciliation which removes the item from the vault's internal list
		await adapter.reconcileDeletion(realPath, filePath);
	}
	_bypassPatch = false;

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
