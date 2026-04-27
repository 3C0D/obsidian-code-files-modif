import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter } from './state.ts';
import { getExtension } from '../fileUtils.ts';
import { getActiveExtensions } from '../extensionUtils.ts';
import { decorateFolders } from './badge.ts';
import { scanDotEntries } from './scan.ts';
import { revealFiles, unrevealFiles } from './operations.ts';

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

	decorateFolders(plugin);
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

	for (const [, itemPaths] of Object.entries(plugin.settings.revealedFiles)) {
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