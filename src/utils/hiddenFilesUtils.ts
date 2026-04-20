import { Notice, setIcon, normalizePath } from 'obsidian';
import type { DataAdapterEx, FileExplorerView, FolderTreeItem } from 'obsidian-typings';
import { around } from 'monkey-around';
import type CodeFilesPlugin from '../main.ts';

interface DataAdapterWithInternal extends DataAdapterEx {
	reconcileFileInternal(realPath: string, normalizedPath: string): Promise<void>;
}

export interface HiddenItem {
	name: string;
	path: string;
	isFolder: boolean;
	size: number;
}

let _bypassPatch = false;

function getAdapter(plugin: CodeFilesPlugin): DataAdapterWithInternal {
	return plugin.app.vault.adapter as unknown as DataAdapterWithInternal;
}

function getBasePath(plugin: CodeFilesPlugin): string {
	return getAdapter(plugin).basePath;
}

export function patchAdapter(plugin: CodeFilesPlugin): () => void {
	const adapter = getAdapter(plugin);

	// Prevent Obsidian from auto-deleting revealed dotfiles
	return around(adapter, {
		reconcileDeletion(next) {
			return async function (
				this: DataAdapterEx,
				realPath: string,
				normalizedPath: string
			) {
				const basename = normalizedPath.split('/').pop() || '';
				// Block deletion of dotfiles unless explicitly requested via hideFilesInFolder
				if (basename.startsWith('.') && !_bypassPatch) {
					return;
				}
				return next.call(this, realPath, normalizedPath);
			};
		}
	});
}

export async function cleanStaleRevealedFiles(plugin: CodeFilesPlugin): Promise<void> {
	const basePath = getBasePath(plugin);
	let changed = false;
	const fs = window.require?.('fs');
	const pathNode = window.require?.('path');

	if (!fs || !pathNode) return;

	for (const [folderPath, itemPaths] of Object.entries(plugin.settings.revealedFiles)) {
		let normFolderPath = normalizePath(folderPath);
		if (normFolderPath === '/') normFolderPath = '';

		const valid = itemPaths
			.map((p) => normalizePath(p))
			.filter((normItemPath) => {
				try {
					fs.statSync(pathNode.join(basePath, normItemPath));
					return true;
				} catch {
					return false;
				}
			});

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

export async function restoreRevealedFiles(plugin: CodeFilesPlugin): Promise<void> {
	const adapter = getAdapter(plugin);
	const basePath = getBasePath(plugin);
	const fs = window.require?.('fs');
	const pathNode = window.require?.('path');

	if (!fs || !pathNode) return;

	for (const [_, itemPaths] of Object.entries(plugin.settings.revealedFiles)) {
		for (const itemPath of itemPaths) {
			const realPath = adapter.getRealPath(itemPath);
			const fullPath = pathNode.join(basePath, itemPath);
			try {
				const stat = fs.statSync(fullPath);
				if (stat.isDirectory()) {
					await adapter.reconcileFolderCreation(realPath, itemPath);
				} else {
					await adapter.reconcileFileInternal(realPath, itemPath);
				}
			} catch {
				// file no longer exists
			}
		}
	}
}

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

		if (hasRevealed && !existing) {
			const badge = selfEl.createSpan({ cls: 'hidden-files-badge' });
			setIcon(badge, 'eye');
		} else if (!hasRevealed && existing) {
			existing.remove();
		}
	}
}

export function scanHiddenFiles(
	plugin: CodeFilesPlugin,
	folderPath: string
): HiddenItem[] {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';
	const basePath = getBasePath(plugin);
	const fs = window.require?.('fs');
	const pathNode = window.require?.('path');
	const items: HiddenItem[] = [];

	if (!fs || !pathNode) return items;

	const fullPath = pathNode.join(basePath, folderPath);

	try {
		const entries = fs.readdirSync(fullPath);

		for (const entry of entries) {
			if (!entry.startsWith('.')) continue;

			const entryPath = pathNode.join(fullPath, entry);
			const relativePath = normalizePath(
				folderPath ? `${folderPath}/${entry}` : entry
			);

			try {
				const stat = fs.statSync(entryPath);
				const isFolder = stat.isDirectory();

				if (isFolder && plugin.settings.excludedFolders.includes(entry)) {
					continue;
				}

				if (!isFolder) {
					const ext = entry.substring(1);
					// Removed the dot when testing for extensions
					const actualExt = ext.split('.').pop() || ext;
					if (plugin.settings.excludedExtensions.includes(actualExt)) {
						continue;
					}
					if (stat.size > 10 * 1024 * 1024) {
						continue;
					}
				}

				items.push({
					name: entry,
					path: relativePath,
					isFolder,
					size: stat.size
				});
			} catch {
				// ignore permission errors
			}
		}

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

export async function revealFiles(
	plugin: CodeFilesPlugin,
	folderPath: string,
	itemPaths: string[]
): Promise<void> {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';
	itemPaths = itemPaths.map((p) => normalizePath(p));
	const adapter = getAdapter(plugin);
	const basePath = getBasePath(plugin);
	const fs = window.require?.('fs');
	const pathNode = window.require?.('path');

	if (!fs || !pathNode) return;

	for (const itemPath of itemPaths) {
		const normItemPath = normalizePath(itemPath);
		const fullPath = pathNode.join(basePath, normItemPath);
		try {
			const stat = fs.statSync(fullPath);
			const realPath = adapter.getRealPath(normItemPath);
			if (stat.isDirectory()) {
				await adapter.reconcileFolderCreation(realPath, normItemPath);
			} else {
				// Call reconcileFileInternal directly to bypass dotfile guard
				await adapter.reconcileFileInternal(realPath, normItemPath);
			}
		} catch (e) {
			console.error(`Reveal error ${itemPath}:`, e);
		}
	}

	const existing = plugin.settings.revealedFiles[folderPath] ?? [];
	plugin.settings.revealedFiles[folderPath] = [...new Set([...existing, ...itemPaths])];
	await plugin.saveSettings();
	decorateFolders(plugin);
	new Notice(`${itemPaths.length} item(s) revealed`);
}

export async function hideFilesInFolder(
	plugin: CodeFilesPlugin,
	folderPath: string,
	itemPaths: string[]
): Promise<void> {
	folderPath = normalizePath(folderPath);
	if (folderPath === '/') folderPath = '';
	itemPaths = itemPaths.map((p) => normalizePath(p));
	const adapter = getAdapter(plugin);

	// Temporarily allow deletion of dotfiles
	_bypassPatch = true;
	for (const filePath of itemPaths) {
		const realPath = adapter.getRealPath(filePath);
		await adapter.reconcileDeletion(realPath, filePath);
	}
	_bypassPatch = false;

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
