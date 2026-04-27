import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import type { HiddenItem } from '../../types/types.ts';
import { getAdapter } from './state.js';

/**
 * Max file size in MB for Monaco (configurable in settings)
 * @param plugin - The plugin instance
 * @returns The max file size in bytes
 */
export function getMaxFileSize(plugin: CodeFilesPlugin): number {
	return (plugin.settings.maxFileSize || 10) * 1024 * 1024;
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