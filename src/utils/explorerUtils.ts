/**
 * Visual highlighting for the project root folder in the file explorer.
 * Adds/removes a CSS class to the folder title element to show which folder
 * is set as the project root for TypeScript/JavaScript cross-file navigation.
 * The highlight color is customizable via plugin settings.
 */
import type CodeFilesPlugin from '../main.ts';
import type { FileExplorerView, FileTreeItem, FolderTreeItem } from 'obsidian-typings';
import { TFile, TFolder } from 'obsidian';
import { getActiveExtensions } from './extensionUtils.ts';
import { getExtension } from './fileUtils.ts';

const PROJECT_ROOT_CLASS = 'code-files-project-root-folder';

/** Updates the visual highlight of the project root folder in the file explorer.
 *
 *  Why: Provides visual feedback to show which folder is set as the project root
 *  for TypeScript/JavaScript cross-file navigation.
 *
 *  How: Adds a CSS class to the folder title element in Obsidian's file explorer.
 *  The class is styled in monacoHtml.css to show a green highlight.
 *
 *  @param plugin - The plugin instance.
 */
export function updateProjectFolderHighlight(plugin: CodeFilesPlugin): void {
	const view = plugin.app.workspace.getLeavesOfType('file-explorer').first()?.view as
		| FileExplorerView
		| undefined;
	if (!view?.fileItems) return;

	const getTitleEl = (item: FolderTreeItem): HTMLElement | null =>
		item.el?.querySelector<HTMLElement>('.nav-folder-title-content') ?? null;

	for (const [path, item] of Object.entries(view.fileItems)) {
		if (!(item.file instanceof TFolder)) continue;
		getTitleEl(item as FolderTreeItem)?.classList.toggle(
			PROJECT_ROOT_CLASS,
			path === plugin.settings.projectRootFolder
		);
	}
}

let explorerObserver: MutationObserver | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;

/**
 * Ensures dotfiles (.env, .gitignore) show their extension as a badge in the
 * file explorer, matching Obsidian's native behavior for regular files.
 * Uses a lightweight debounced MutationObserver on the file explorer's
 * container to catch folder expansions dynamically, since Obsidian lazily
 * renders file items only when their parent folder is expanded.
 *
 *  @param plugin - The plugin instance.
 */
export function setupExplorerBadges(plugin: CodeFilesPlugin): void {
	const updateBadges = (): void => {
		const activeExts = getActiveExtensions(plugin.settings);
		const view = plugin.app.workspace.getLeavesOfType('file-explorer').first()
			?.view as FileExplorerView | undefined;
		if (!view?.fileItems) return;

		for (const item of Object.values(view.fileItems)) {
			if (!(item.file instanceof TFile)) continue; // Guard first: skip folders

			const file = item.file; // Narrowed automatically to TFile
			const treeItem = item as FileTreeItem;
			const selfEl = treeItem.selfEl || treeItem.el;
			const tagEl = selfEl?.querySelector('.nav-file-tag');

			// Unregistered badge cleanup
			if (tagEl) tagEl.classList.remove('code-files-unregistered-badge');

			// Dotfile badge
			if (!file.extension) {
				const ext = getExtension(file.name);
				if (ext && activeExts.includes(ext) && tagEl && !tagEl.textContent) {
					tagEl.textContent = ext.toUpperCase();
				}
				continue; // dotfiles are not "unregistered"
			}

			// Unregistered badge
			if (!plugin.app.viewRegistry.typeByExtension[file.extension]) {
				tagEl?.classList.add('code-files-unregistered-badge');
			}
		}
	};

	const debouncedUpdate = (): void => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			debounceTimeout = null;
			updateBadges();
		}, 50);
	};

	const reattachObservers = (): void => {
		if (!explorerObserver) {
			explorerObserver = new MutationObserver((mutations) => {
				for (const mut of mutations) {
					if (mut.addedNodes.length > 0) {
						debouncedUpdate();
						break;
					}
				}
			});
		} else {
			explorerObserver.disconnect();
		}

		const view = plugin.app.workspace.getLeavesOfType('file-explorer').first()
			?.view as FileExplorerView | undefined;
		if (!view) return;
		explorerObserver.observe(view.containerEl, {
			childList: true,
			subtree: true
		});
		debouncedUpdate();
	};

	plugin.registerEvent(plugin.app.workspace.on('layout-change', reattachObservers));
	plugin.registerEvent(plugin.app.vault.on('rename', debouncedUpdate));

	// Initial attach if layout is already ready
	if (plugin.app.workspace.layoutReady) {
		reattachObservers();
	} else {
		plugin.app.workspace.onLayoutReady(reattachObservers);
	}
}

export function cleanupExplorerBadges(): void {
	if (debounceTimeout) {
		clearTimeout(debounceTimeout);
		debounceTimeout = null;
	}
	if (explorerObserver) {
		explorerObserver.disconnect();
		explorerObserver = null;
	}
}
