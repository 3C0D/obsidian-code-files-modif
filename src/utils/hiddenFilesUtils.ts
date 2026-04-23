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
import type { Plugin, TAbstractFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import type { DataAdapterWithInternal, HiddenItem } from '../types/types.ts';
import { getExtension } from './fileUtils.ts';
import { getActiveExtensions } from './extensionUtils.ts';

/**
 * Global flag used to temporarily bypass the deletion patch.
 * Set to true when the user explicitly chooses
 * to hide a previously revealed file.
 */
let _bypassPatch = false;

/**
 * Retrieves the platform-specific data adapter.
 * @internal
 */
function getAdapter(plugin: CodeFilesPlugin): DataAdapterWithInternal {
	return getDataAdapterEx(plugin.app) as unknown as DataAdapterWithInternal;
}

/** Max file size in MB for Monaco (configurable in settings) */
export function getMaxFileSize(plugin: CodeFilesPlugin): number {
	return (plugin.settings.maxFileSize || 10) * 1024 * 1024;
}

/**
 * Patches Obsidian's DataAdapter to prevent the automatic
 * removal of dotfiles from the UI.
 *
 * Strategy for reconcileDeletion:
 * - If the file no longer exists on disk → real deletion
 *   (trash, delete, external removal) → allow through.
 * - If the file still exists on disk → Obsidian is trying
 *   to clean up a revealed dotfile → block it.
 * - _bypassPatch flag overrides for explicit hide actions.
 *
 * @param plugin - The plugin instance.
 * @returns A function to unpatch the adapter.
 */
export function patchAdapter(plugin: CodeFilesPlugin): () => void {
	const adapter = getAdapter(plugin);

	// Save originals before patching
	plugin._origReconcileDeletion = adapter.reconcileDeletion.bind(adapter);
	plugin._origRename = adapter.rename.bind(adapter);

	// Patch reconcileDeletion with monkey-around
	const unpatchReconcile = around(adapter, {
		reconcileDeletion(next) {
			return async function (
				this: DataAdapterEx,
				realPath: string,
				normalizedPath: string
			) {
				const basename = normalizedPath.split('/').pop() || '';
				if (basename.startsWith('.') && !_bypassPatch) {
					return;
				}
				return next.call(this, realPath, normalizedPath);
			};
		}
	});

	// Patch rename with monkey-around
	const unpatchRename = around(adapter, {
		rename(next) {
			return async function (this: DataAdapterEx, src: string, dest: string) {
				if (adapter.files?.[dest]?.type === 'folder') {
					const filename = src.split('/').pop() || '';
					dest = dest + '/' + filename;
				}
				return next.call(this, src, dest);
			};
		}
	});

	// Patch vault.trash to allow dotfile deletion
	const origTrash = plugin.app.vault.trash.bind(plugin.app.vault);
	plugin.app.vault.trash = async function (file: TAbstractFile, system: boolean) {
		const path = file?.path;
		if (path) _bypassPatch = true;
		try {
			return await origTrash(file, system);
		} finally {
			_bypassPatch = false;
		}
	};

	return () => {
		unpatchReconcile();
		unpatchRename();
		plugin.app.vault.trash = origTrash;
		plugin._origReconcileDeletion = null;
		plugin._origRename = null;
	};
}

/**
 * Patches Plugin.registerExtensions (via monkey-around) and viewRegistry.unregisterExtensions
 * (via direct patch) to keep dotfile visibility in sync with extension registration state.
 *
 * - On register: cleans revealedFiles and auto-reveals dotfiles for the new extensions.
 * - On unregister: hides dotfiles for removed extensions, unless explicitly in revealedFiles.
 *
 * @param plugin - The plugin instance.
 * @returns A function to unpatch both patches.
 */
export function patchRegisterExtensions(plugin: CodeFilesPlugin): () => void {
	const viewRegistry = plugin.app.viewRegistry;
	const origUnregister = viewRegistry.unregisterExtensions.bind(viewRegistry);

	viewRegistry.unregisterExtensions = (extensions: string[]) => {
		origUnregister(extensions);
		const revealedPaths = new Set(
			Object.values(plugin.settings.revealedFiles).flat()
		);

		const adapter = getAdapter(plugin);
		for (const file of plugin.app.vault.getFiles()) {
			if (!extensions.includes(getExtension(file.name) ?? '')) continue;
			if (file.extension) continue; // Only dotfiles
			if (revealedPaths.has(file.path)) continue;
			const orig =
				plugin._origReconcileDeletion ?? adapter.reconcileDeletion.bind(adapter);
			orig(adapter.getRealPath(file.path), file.path).catch(console.error);
		}
	};

	const unAroundRegister = around(plugin as Plugin, {
		registerExtensions(next) {
			return function (this: Plugin, exts: string[], vType: string) {
				const result = next.call(this, exts, vType);
				if (plugin.app.workspace.layoutReady) {
					void handleNewRegisteredExtensions(plugin, exts);
				}
				return result;
			};
		}
	});

	return () => {
		unAroundRegister();
		viewRegistry.unregisterExtensions = origUnregister;
	};
}

/**
 * Handles newly registered extensions by cleaning revealedFiles and auto-revealing
 * dotfiles matching the new extensions.
 */
export async function handleNewRegisteredExtensions(
	plugin: CodeFilesPlugin,
	extensions: string[]
): Promise<void> {
	if (!plugin.settings.autoRevealRegisteredDotfiles) return;

	const extSet = new Set(extensions);

	// For each folder in revealedFiles, remove entries now auto-managed
	let changed = false;
	for (const [folderPath, paths] of Object.entries(plugin.settings.revealedFiles)) {
		const cleaned = paths.filter((p) => {
			const ext = getExtension(p.split('/').pop() || '');
			return !ext || !extSet.has(ext);
		});
		if (cleaned.length !== paths.length) {
			changed = true;
			if (cleaned.length > 0) {
				plugin.settings.revealedFiles[folderPath] = cleaned;
			} else {
				delete plugin.settings.revealedFiles[folderPath];
			}
		}
	}
	if (changed) await plugin.saveSettings();

	// Auto-reveal dotfiles matching the new extensions
	if (plugin.settings.autoRevealRegisteredDotfiles) {
		const allFolders = plugin.app.vault.getAllFolders();
		for (const folder of allFolders) {
			const items = await scanHiddenFiles(plugin, folder.path);
			const toReveal = items
				.filter((item) => {
					if (item.isFolder) return false;
					const ext = getExtension(item.name);
					return ext && extSet.has(ext);
				})
				.map((item) => item.path);
			if (toReveal.length > 0) {
				await revealFiles(plugin, folder.path, toReveal, true, false);
			}
		}
	}

	decorateFolders(plugin);
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
 * Automatically reveals dotfiles whose extensions are registered with Code Files.
 * Scans the entire vault for hidden files and reveals those matching active extensions.
 * Called on plugin startup after restoreRevealedFiles.
 */
export async function autoRevealRegisteredDotfiles(
	plugin: CodeFilesPlugin
): Promise<void> {
	if (!plugin.settings.autoRevealRegisteredDotfiles) return;

	const activeExts = getActiveExtensions(plugin.settings);

	const allFolders = plugin.app.vault.getAllFolders();
	for (const folder of allFolders) {
		const items = await scanHiddenFiles(plugin, folder.path);
		const toReveal = items
			.filter((item) => {
				if (item.isFolder) return false;
				const ext = getExtension(item.name);
				if (!ext || !activeExts.includes(ext)) return false;
				const revealed = plugin.settings.revealedFiles[folder.path] || [];
				return !revealed.includes(item.path);
			})
			.map((item) => item.path);

		if (toReveal.length > 0) {
			await revealFiles(plugin, folder.path, toReveal, true, false);
		}
	}
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
		const listRecursive = async (dir: string): Promise<void> => {
			const listed = await adapter.list(dir || '');
			for (const filePath of [...listed.files, ...listed.folders]) {
				const entryPath = normalizePath(filePath);
				const isFolder = listed.folders.includes(filePath);
				const basename = entryPath.split('/').pop() || '';
				if (!basename.startsWith('.')) continue;
				const parentPath =
					entryPath.substring(0, entryPath.lastIndexOf('/')) || '';
				if (parentPath !== folderPath) continue;
				if (isFolder && plugin.settings.excludedFolders.includes(basename))
					continue;
				if (!isFolder) {
					const ext =
						basename.substring(1).split('.').pop() || basename.substring(1);
					if (plugin.settings.excludedExtensions.includes(ext)) continue;
				}
				let size = 0;
				try {
					const stat = await adapter.stat(entryPath);
					if (stat) {
						size = stat.size;
						if (size > getMaxFileSize(plugin)) continue;
					}
				} catch {
					/* ignore stat errors */
				}
				items.push({ name: basename, path: entryPath, isFolder, size });
			}
		};
		await listRecursive(folderPath);

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
 * @param silent - If true, don't show a notice (for auto-reveal)
 * @param persist - If true, save to revealedFiles settings (manual reveal only)
 *
 * This version uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
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

/**
 * Hides all auto-revealed dotfiles (those with registered extensions that are not manually revealed).
 * Called when the auto-reveal toggle is turned off.
 */
export async function hideAutoRevealedDotfiles(plugin: CodeFilesPlugin): Promise<void> {
	const activeExts = getActiveExtensions(plugin.settings);

	const allFolders = plugin.app.vault.getAllFolders(true);
	for (const folder of allFolders) {
		const items = await scanHiddenFiles(plugin, folder.path);
		const toHide = items
			.filter((item) => {
				if (item.isFolder) return false;
				const ext = getExtension(item.name);
				// Only hide auto-managed ones (not in revealedFiles = not manually revealed)
				const revealed = plugin.settings.revealedFiles[folder.path] || [];
				return ext && activeExts.includes(ext) && !revealed.includes(item.path);
			})
			.map((item) => item.path);

		if (toHide.length > 0) {
			await hideFilesInFolder(plugin, folder.path, toHide);
		}
	}
}
