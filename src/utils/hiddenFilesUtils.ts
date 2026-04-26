/**
 * Manages hidden files (dotfiles) exclusively from folders in the Obsidian file explorer.
 * When a folder contains revealed hidden files, a badge with a green eye icon is added to it.
 *
 * Mechanisms:
 * 1. Patch Obsidian's data adapter to prevent automatic deletion of revealed dotfiles,
 *    and to fix drag-and-drop destination path for dotfiles moved into folders.
 * 2. Scan for and reveal/hide dotfiles via folder context menus.
 *    Files exceeding the Monaco size limit are excluded from scan results.
 * 3. Persist and restore revealed files state across sessions.
 * 4. Patch extension registration to keep dotfile visibility in sync with registered extensions.
 *
 * N.B: adapter.fs is a platform abstraction over native mobile APIs (no Node.js fs on iOS/Android)
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
 * Retrieves the platform-specific data adapter
 * @param plugin - The plugin instance.
 * @returns The platform-specific data adapter.
 */
function getAdapter(plugin: CodeFilesPlugin): DataAdapterWithInternal {
	return getDataAdapterEx(plugin.app) as unknown as DataAdapterWithInternal;
}

/**
 * Max file size in MB for Monaco (configurable in settings)
 * @param plugin - The plugin instance
 * @returns The max file size in bytes
 */
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

	// Fix drag-and-drop(rename error): Obsidian passes the target folder as dest instead of
	// the full destination path, resulting in a wrong rename target for dotfiles.
	const unpatchRename = around(adapter, {
		rename(next) {
			return async function (this: DataAdapterEx, src: string, dest: string) {
				// Block renames that would move external files (snippets, etc.) out of configDir
				const configDir = plugin.app.vault.configDir;
				if (
					src.startsWith(configDir + '/') &&
					!dest.startsWith(configDir + '/')
				) {
					return;
				}
				// Fix drag-and-drop destination for dotfiles
				if (adapter.files?.[dest]?.type === 'folder') {
					const filename = src.split('/').pop() || '';
					dest = dest + '/' + filename;
				}
				return next.call(this, src, dest);
			};
		}
	});

	// Patch vault.trash to allow dotfile deletion
	const unpatchTrash = around(plugin.app.vault, {
		trash(next) {
			return async function (
				this: typeof plugin.app.vault,
				file: TAbstractFile,
				system: boolean
			) {
				if (file?.path) _bypassPatch = true;
				try {
					return await next.call(this, file, system);
				} finally {
					_bypassPatch = false;
				}
			};
		}
	});

	return () => {
		unpatchReconcile();
		unpatchRename();
		unpatchTrash();
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
	const unAroundUnregister = around(viewRegistry, {
		unregisterExtensions(next) {
			return function (this: typeof viewRegistry, extensions: string[]) {
				next.call(this, extensions);
				const revealedPaths = new Set(
					Object.values(plugin.settings.revealedFiles).flat()
				);
				const adapter = getAdapter(plugin);
				for (const file of plugin.app.vault.getFiles()) {
					if (!extensions.includes(getExtension(file.name) ?? '')) continue;
					if (file.extension) continue; // Only dotfiles
					if (revealedPaths.has(file.path)) continue;
					const orig =
						plugin._origReconcileDeletion ??
						adapter.reconcileDeletion.bind(adapter);
					orig(adapter.getRealPath(file.path), file.path).catch(console.error);
				}
			};
		}
	});

	const unAroundRegister = around(plugin as Plugin, {
		registerExtensions(next) {
			return function (this: Plugin, exts: string[], vType: string) {
				const result = next.call(this, exts, vType);
				if (plugin.app.workspace.layoutReady) {
					void syncAutoRevealedDotfiles(plugin, exts);
				}
				return result;
			};
		}
	});

	return () => {
		unAroundRegister();
		unAroundUnregister();
	};
}

/**
 * Handles newly registered extensions by cleaning revealedFiles and auto-revealing
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
	if (!plugin.settings.autoRevealRegisteredDotfiles) return;

	const extSet = new Set(extensions);

	// For each folder in revealedFiles, remove entries now auto-managed
	let changed = false;
	for (const [folderPath, paths] of Object.entries(plugin.settings.revealedFiles)) {
		const cleaned = paths.filter((p) => {
			const ext = getExtension(p.split('/').pop() || '');
			return !ext || !extSet.has(ext); // keep extension-less files (LICENSE, README) — not extension-managed
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
			const items = await scanDotEntries(plugin, folder.path);
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
 * @returns A Promise that resolves when the operation is complete.
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
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function autoRevealRegisteredDotfiles(
	plugin: CodeFilesPlugin
): Promise<void> {
	if (!plugin.settings.autoRevealRegisteredDotfiles) return;

	const activeExts = getActiveExtensions(plugin.settings);

	const allFolders = plugin.app.vault.getAllFolders();
	for (const folder of allFolders) {
		const items = await scanDotEntries(plugin, folder.path);
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
 * Uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
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

/**
 * Scans a folder on the physical file system to find dotfiles and dot-folders
 * (names starting with a dot). Direct children only.
 * Respects exclusion settings for folders and extensions.
 * Files exceeding the Monaco size limit are excluded.
 *
 * Uses Obsidian's DataAdapter API to bypass default dotfile filtering,
 * making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 * @param folderPath - Normalized path of the folder to scan.
 * @returns Array of found dot-entries, sorted: folders first, then files, alphabetically.
 */
export async function scanDotEntries(
	plugin: CodeFilesPlugin,
	folderPath: string
): Promise<HiddenItem[]> {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';

	const adapter = getAdapter(plugin);
	const items: HiddenItem[] = [];

	try {
		/**
		 * Lists direct dot-children (files and folders starting with a dot)
		 * of the given directory, without recursing into subdirectories.
		 * Files exceeding the Monaco size limit are excluded.
		 */
		const listDotChildren = async (dir: string): Promise<void> => {
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
		await listDotChildren(folderPath);

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
	_bypassPatch = true;
	for (const filePath of itemPaths) {
		const realPath = adapter.getRealPath(filePath);
		// Trigger a deletion reconciliation which removes the item from the vault's internal list
		await adapter.reconcileDeletion(realPath, filePath);
	}
	_bypassPatch = false;
	
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

/**
 * Hides all auto-revealed dotfiles (those with registered extensions that are not manually revealed).
 * Called when the auto-reveal toggle is turned off.
 *
 * @param plugin - The plugin instance.
 * @returns A Promise that resolves when the operation is complete.
 */
export async function hideAutoRevealedDotfiles(plugin: CodeFilesPlugin): Promise<void> {
	const activeExts = getActiveExtensions(plugin.settings);
	// flat because Object.values returns an array of arrays
	const revealedPaths = new Set(Object.values(plugin.settings.revealedFiles).flat());

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
		await unrevealFiles(plugin, folderPath, paths);
	}
}
