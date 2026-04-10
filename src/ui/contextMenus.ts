import { TFile, TFolder } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { CreateCodeFileModal } from '../modals/createCodeFileModal.ts';
import { FenceEditModal } from '../modals/fenceEditModal.ts';
import { FenceEditContext } from '../utils/fenceEditContext.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import { ChooseHiddenFileModal } from '../modals/chooseHiddenFileModal.ts';
import { updateProjectFolderHighlight } from '../utils/explorerUtils.ts';
import type { MenuItems } from '../types/types.ts';
import { CodeEditorView } from '../editor/codeEditorView.ts';
import { broadcastProjectFiles } from '../utils/broadcast.ts';

/**
 * Registers two context menus:
 * 1. file-menu — shown in the file explorer and
 *    tab headers. Folders get a submenu with plugin actions;
 *    files get a submenu with plugin actions.
 *    Explorer shows a flat "Rename Extension".
 * 2. editor-menu — right-click in the Markdown
 *    editor. If the cursor is inside a code fence,
 *    offers to edit it in Monaco; otherwise shows
 *    the same submenu.
 */
export function registerContextMenus(plugin: CodeFilesPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, abstractFile, source) => {
			if (abstractFile instanceof TFolder) {
				const items = getFolderItems(plugin, abstractFile);
				menu.addItem((i) => {
					i.setTitle('Code Files').setIcon('file-json');
					const sub = i.setSubmenu();
					for (const it of items) {
						sub.addItem((subItem) =>
							subItem.setTitle(it.title).setIcon(it.icon).onClick(it.action)
						);
					}
				});
				return;
			}

			// Rename Extension on all files in explorer and tab header
			if (abstractFile instanceof TFile) {
				menu.addItem((i) => {
					if (source === 'file-explorer-context-menu') {
						i.setTitle('Rename Extension')
							.setIcon('pencil')
							.onClick(() =>
								new RenameExtensionModal(plugin, abstractFile).open()
							);
					} else {
						const items = getFileItems(plugin);
						i.setTitle('Code Files').setIcon('file-json');
						const sub = i.setSubmenu();
						for (const it of items) {
							sub.addItem((subItem) =>
								subItem
									.setTitle(it.title)
									.setIcon(it.icon)
									.onClick(it.action)
							);
						}
					}
				});
			}
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor) => {
			const fenceContext = FenceEditContext.create(plugin, editor);

			menu.addItem((item) => {
				if (fenceContext) {
					item.setTitle('Edit Code Block in Monaco Editor')
						.setIcon('code')
						.onClick(() => FenceEditModal.openOnCurrentCode(plugin, editor));
				} else {
					const items = getFileItems(plugin);
					item.setTitle('Code Files').setIcon('file-json');
					const sub = item.setSubmenu();
					for (const it of items) {
						sub.addItem((subItem) =>
							subItem.setTitle(it.title).setIcon(it.icon).onClick(it.action)
						);
					}
				}
			});
		})
	);
}

/** Builds the submenu items for folders in the file explorer. */
function getFolderItems(plugin: CodeFilesPlugin, folder: TFolder): MenuItems[] {
	const items: MenuItems[] = [
		{
			title: 'Create Code File',
			icon: 'file-plus',
			action: () => new CreateCodeFileModal(plugin, folder).open()
		},
		{
			title: 'Open Hidden Files in Code Files',
			icon: 'eye-off',
			action: () => new ChooseHiddenFileModal(plugin, folder).open()
		},
		{
			title: 'Define as Project Root Folder',
			icon: 'folder-tree',
			action: async () => {
				plugin.settings.projectRootFolder = folder.path;
				await plugin.saveSettings();
				updateProjectFolderHighlight(plugin);
				await broadcastProjectFiles(plugin);
			}
		}
	];

	// Add "Clear Project Root Folder" if this folder is currently set as project root
	if (plugin.settings.projectRootFolder === folder.path) {
		items.push({
			title: 'Clear Project Root Folder',
			icon: 'x',
			action: async () => {
				plugin.settings.projectRootFolder = '';
				await plugin.saveSettings();
				updateProjectFolderHighlight(plugin);
				await broadcastProjectFiles(plugin);
			}
		});
	}

	return items;
}

/** Builds the submenu items shown both in the tab
 *  header file-menu and the markdown editor-menu.
 */
function getFileItems(plugin: CodeFilesPlugin): MenuItems[] {
	const activeFile = plugin.app.workspace.getActiveFile();

	const items: MenuItems[] = [];

	if (activeFile) {
		items.push({
			title: 'Open in Monaco Editor',
			icon: 'file-code',
			action: async () => await CodeEditorView.openFile(activeFile, plugin)
		});
	}
	// Always show Rename Extension if there's an active file
	if (activeFile) {
		items.push({
			title: 'Rename Extension',
			icon: 'pencil',
			action: () => new RenameExtensionModal(plugin, activeFile).open()
		});
	}

	return items;
}
