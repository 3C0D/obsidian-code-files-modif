/**
 * Visual highlighting for the project root folder in the file explorer.
 * Adds/removes a CSS class to the folder title element to show which folder
 * is set as the project root for TypeScript/JavaScript cross-file navigation.
 * The highlight color is customizable via plugin settings.
 */
import type CodeFilesPlugin from '../main.ts';
import type { FileExplorerView } from 'obsidian-typings';
import { TFile } from 'obsidian';
import { getExtension } from './fileUtils.ts';
import { getActiveExtensions } from './extensionUtils.ts';

const PROJECT_ROOT_CLASS = 'code-files-project-root-folder';

/** Updates the visual highlight of the project root folder in the file explorer.
 *
 *  Why: Provides visual feedback to show which folder is set as the project root
 *  for TypeScript/JavaScript cross-file navigation.
 *
 *  How: Adds a CSS class to the folder title element in Obsidian's file explorer.
 *  The class is styled in monacoHtml.css to show a green highlight. */
export function updateProjectFolderHighlight(plugin: CodeFilesPlugin): void {
	const view = plugin.app.workspace.getLeavesOfType('file-explorer')?.first()?.view as
		| FileExplorerView
		| undefined;
	if (!view?.fileItems) return;

	// Remove previous highlight
	for (const [, item] of Object.entries(view.fileItems)) {
		const titleEl = item.el?.querySelector(
			'.nav-folder-title-content'
		) as HTMLElement | null;
		if (titleEl) {
			titleEl.classList.remove(PROJECT_ROOT_CLASS);
		}
	}

	// Add highlight to project root folder
	if (!plugin.settings.projectRootFolder) return;
	const projectItem = view.fileItems[plugin.settings.projectRootFolder];
	if (!projectItem) return;
	const titleEl = projectItem.el?.querySelector(
		'.nav-folder-title-content'
	) as HTMLElement | null;
	if (titleEl) {
		titleEl.classList.add(PROJECT_ROOT_CLASS);
		const color = plugin.settings.projectRootFolderColor;
		if (color) {
			titleEl.style.setProperty('--code-files-project-root-color', color);
		} else {
			titleEl.style.removeProperty('--code-files-project-root-color');
		}
	}
}

let explorerObserver: MutationObserver | null = null;
let debounceTimeout: NodeJS.Timeout | null = null;

/**
 * Ensures dotfiles (.env, .gitignore) show their extension as a badge in the
 * file explorer, matching Obsidian's native behavior for regular files.
 * Uses a lightweight debounced MutationObserver on the file explorer's
 * container to catch folder expansions dynamically.
 */
export function setupExplorerBadges(plugin: CodeFilesPlugin): void {
	const updateBadges = () => {
		const activeExts = getActiveExtensions(plugin.settings);
		const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');

		for (const leaf of leaves) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = leaf.view as any;
			if (!view.fileItems) continue;

			for (const item of Object.values(view.fileItems)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const file = (item as any).file;
				if (!(file instanceof TFile)) continue;
				if (file.extension) continue; // Only process dotfiles (empty extension)

				const ext = getExtension(file.name);
				if (!ext || !activeExts.includes(ext)) continue;

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const selfEl = (item as any).selfEl || (item as any).el;
				if (!selfEl) continue;

				const tagEl = selfEl.querySelector('.nav-file-tag');
				if (tagEl && !tagEl.textContent) {
					tagEl.textContent = ext.toUpperCase();
					tagEl.classList.add('code-files-dotfile-badge');
				}
			}
		}
	};

	const debouncedUpdate = () => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			debounceTimeout = null;
			updateBadges();
		}, 50);
	};

	const reattachObservers = () => {
		if (explorerObserver) explorerObserver.disconnect();
		else {
			explorerObserver = new MutationObserver((mutations) => {
				for (const mut of mutations) {
					if (mut.addedNodes.length > 0) {
						debouncedUpdate();
						break;
					}
				}
			});
		}

		const leaves = plugin.app.workspace.getLeavesOfType('file-explorer');
		for (const leaf of leaves) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			explorerObserver.observe((leaf.view as any).containerEl, {
				childList: true,
				subtree: true
			});
		}
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
