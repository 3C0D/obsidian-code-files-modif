/**
 * Visual highlighting for the project root folder in the file explorer.
 * Adds/removes a CSS class to the folder title element to show which folder
 * is set as the project root for TypeScript/JavaScript cross-file navigation.
 * The highlight color is customizable via plugin settings.
 */
import type CodeFilesPlugin from '../main.ts';
import type { FileExplorerView } from 'obsidian-typings';

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
