import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter, setBypassPatch } from './state.ts';
import { decorateFolders } from './badge.ts';
import { viewType } from '../../editor/types/index.ts';
import { getExtension, getRealPathSafe } from '../fileUtils.ts';
import { getActiveExtensions } from '../extensionUtils.ts';

/**
 * Reveals specified hidden files in the Obsidian UI.
 * Uses the Obsidian DataAdapter API, making it cross-platform (Desktop & Mobile).
 *
 * @param plugin - The plugin instance.
 * @param folderPath - The parent folder path.
 * @param itemPaths - Array of relative paths to reveal.
 * @param persist - Defaults to true. If true, save to revealedFiles settings (manual reveal only).
 * @returns A Promise that resolves when the operation is complete.
 */
export async function revealFiles(
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
			// to check if the file exists
			const stat = await adapter.stat(itemPath);
			if (!stat) continue;

			const realPath = getRealPathSafe(adapter, itemPath);

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
			const realPath = getRealPathSafe(adapter, filePath);
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
}

/**
 * Reveals a file temporarily (e.g. when restoring workspace state).
 * Tracks the file in temporaryRevealedPaths so it can be unrevealed on close.
 */
export async function handleTemporaryReveal(
	plugin: CodeFilesPlugin,
	filePath: string
): Promise<void> {
	if (!plugin.app.vault.getAbstractFileByPath(filePath)) {
		const folderPath = filePath.substring(0, filePath.lastIndexOf('/')) || '';
		await revealFiles(plugin, folderPath, [filePath], false); // silent, no persist

		// Track as temporary unless managed by autoRevealRegisteredDotfiles.
		// External files (configDir) are always tracked because they're never
		// managed by autoRevealRegisteredDotfiles (which only scans dotfiles).
		// vault.configDir is always defined in the Obsidian API — fallback is purely defensive
		const configDir = plugin.app.vault.configDir || '.obsidian';
		const isExternalFile = filePath.startsWith(configDir + '/');
		const ext = getExtension(filePath.split('/').pop() || '');
		const isManagedByAutoReveal =
			!isExternalFile && ext && getActiveExtensions(plugin.settings).includes(ext);
		
		if (
			!isManagedByAutoReveal &&
			!plugin.settings.temporaryRevealedPaths.includes(filePath)
		) {
			plugin.settings.temporaryRevealedPaths.push(filePath);
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
	const tmp = plugin.settings.temporaryRevealedPaths;
	if (tmp.includes(filePath)) {
		// Don't unreveal if the file is still open in another leaf —
		// Obsidian may have reused this leaf to open another file, closing
		// the dotfile view without the user explicitly closing it.
		// Check via getViewState() to catch uninitialized leaves too.
		const stillOpen = plugin.app.workspace
			.getLeavesOfType(viewType)
			.some((l) => l.getViewState().state?.file === filePath);
		if (stillOpen) return;

		// External files (configDir) should never be unrevealed, only removed from tracking
		// vault.configDir is always defined in the Obsidian API — fallback is purely defensive
		const configDir = plugin.app.vault.configDir || '.obsidian';
		const isExternalFile = filePath.startsWith(configDir + '/');
		
		if (!isExternalFile) {
			const allRevealedItems = Object.values(plugin.settings.revealedFiles).flat();
			const manuallyRevealed = allRevealedItems.some(
				(p) => filePath === p || filePath.startsWith(p + '/')
			);
			if (!manuallyRevealed) {
				const folderPath = filePath.substring(0, filePath.lastIndexOf('/')) || '';
				await unrevealFiles(plugin, folderPath, [filePath], true);
			}
		}
		
		plugin.settings.temporaryRevealedPaths = tmp.filter((p) => p !== filePath);
		await plugin.saveSettings();
	}
}
