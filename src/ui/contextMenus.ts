/**
 * Registers context menus for files and folders in the explorer and editor.
 * Provides Code Files submenu with actions like:
 * - Create code file, open hidden files, set project root folder (folders)
 * - Open in Monaco, rename file (name.ext) (files)
 * - Edit code block in Monaco (editor, when cursor is inside a code fence)
 */
import { TFile, TFolder } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { CreateCodeFileModal } from '../modals/createCodeFileModal.ts';
import { FenceEditModal } from '../modals/fenceEditModal.ts';
import { FenceEditContext } from '../utils/fenceEditContext.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import { ChooseHiddenFileModal } from '../modals/chooseHiddenFileModal.ts';
import { Notice } from 'obsidian';
import { updateProjectFolderHighlight } from '../utils/explorerUtils.ts';
import type { MenuItems } from '../types/types.ts';
import { OBSIDIAN_NATIVE_EXTENSIONS } from '../types/types.ts';
import { CodeEditorView } from '../editor/codeEditorView.ts';
import { broadcastProjectFiles } from '../utils/broadcast.ts';
import {
	addExtension,
	removeExtension,
	registerExtension,
	unregisterExtension,
	syncRegisteredExts,
	getActiveExtensions,
	getExtension
} from '../utils/extensionUtils.ts';

/**
 * Registers two context menus:
 * 1. file-menu — context menu in explorer and editor (except tab header)
 * 2. editor-menu — 3-dot menu (⋮) in the Markdown editor view
 *
 * Multiple items are grouped in submenus
 */
export function registerContextMenus(plugin: CodeFilesPlugin): void {
	// -- file-menu
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, abstractFile, source) => {
			// Folder: always show the Code Files submenu
			if (abstractFile instanceof TFolder) {
				const items = getFolderItems(plugin, abstractFile);
				menu.addItem((i) => {
					i.setTitle('Code Files').setIcon('file-code-corner');
					const sub = i.setSubmenu();
					for (const it of items) {
						sub.addItem((subItem) =>
							subItem.setTitle(it.title).setIcon(it.icon).onClick(it.action)
						);
					}
				});
				return;
			}

			// File: show Code Files submenu in explorer, Code Files submenu elsewhere, nothing on tab header
			if (abstractFile instanceof TFile) {
				if (source === 'file-explorer-context-menu') {
					const items = getFileExplorerItems(plugin, abstractFile);
					menu.addItem((i) => {
						i.setTitle('Code Files').setIcon('file-code-corner');
						const sub = i.setSubmenu();
						for (const it of items) {
							sub.addItem((subItem) =>
								subItem
									.setTitle(it.title)
									.setIcon(it.icon)
									.onClick(it.action)
							);
						}
					});
				} else if (source !== 'tab-header') {
					const items = getFileItems(plugin);
					menu.addItem((i) => {
						i.setTitle('Code Files').setIcon('file-code-corner');
						const sub = i.setSubmenu();
						for (const it of items) {
							sub.addItem((subItem) =>
								subItem
									.setTitle(it.title)
									.setIcon(it.icon)
									.onClick(it.action)
							);
						}
					});
				}
			}
		})
	);

	// -- editor-menu
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor) => {
			const fenceContext = FenceEditContext.create(plugin, editor);

			menu.addItem((item) => {
				// Cursor inside a code fence: show "Edit Code Block in Monaco Editor"
				if (fenceContext) {
					item.setTitle('Edit Code Block in Monaco Editor')
						.setIcon('code')
						.onClick(() => FenceEditModal.openOnCurrentCode(plugin, editor));
				} else {
					// Cursor outside a code fence: show Code Files submenu (Open in Monaco, Rename (Name.ext))
					const items = getFileItems(plugin);
					item.setTitle('Code Files').setIcon('file-code-corner');
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

	// Show "Clear" only if this folder is already the project root
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

/** Builds the submenu items for files in the file explorer. */
function getFileExplorerItems(plugin: CodeFilesPlugin, file: TFile): MenuItems[] {
	const ext = getExtension(file.name);
	const items: MenuItems[] = [];

	// Check if extension is registered and if it's native to Obsidian
	const activeExts = getActiveExtensions(plugin.settings);
	const isRegistered = activeExts.includes(ext);
	const isNative = OBSIDIAN_NATIVE_EXTENSIONS.includes(ext);

	// Show "Open in Monaco Editor" if:
	// - File has no extension (LICENSE, README, etc.), OR
	// - Extension is not registered AND not native
	if (!isRegistered) {
		items.push({
			title: 'Open in Monaco Editor',
			icon: 'file-code-corner',
			action: async () => await CodeEditorView.openFile(file, plugin)
		});
	}

	// Show "Register Extension" only if has extension AND not registered AND not native
	if (!isRegistered && !isNative) {
		items.push({
			title: 'Register Extension',
			icon: 'plus-circle',
			action: async () => {
				const added = addExtension(plugin.settings, ext);
				if (!added) {
					new Notice(
						'Extension already registered or native extension not allowed'
					);
					return;
				}
				registerExtension(plugin, ext);
				await plugin.saveSettings();
				syncRegisteredExts(plugin);
				new Notice(`".${ext}" registered with Code Files`);
			}
		});
	}

	// Show "Unregister Extension" only if registered AND not native
	if (isRegistered && !isNative) {
		items.push({
			title: 'Unregister Extension',
			icon: 'minus-circle',
			action: async () => {
				removeExtension(plugin.settings, ext);
				unregisterExtension(plugin, ext);
				await plugin.saveSettings();
				syncRegisteredExts(plugin);
				new Notice(`".${ext}" unregistered from Code Files`);
			}
		});
	}

	// Always show "Rename (Name.ext)"
	items.push({
		title: 'Rename (Name.ext)',
		icon: 'pencil',
		action: () => new RenameExtensionModal(plugin, file).open()
	});

	return items;
}

/** Builds the submenu items shown both in the tab
 *  header file-menu and the markdown editor-menu.
 */
function getFileItems(plugin: CodeFilesPlugin): MenuItems[] {
	const activeFile = plugin.app.workspace.getActiveFile();

	const items: MenuItems[] = [];

	// Both items require an active file — no fallback items if none
	if (activeFile) {
		items.push({
			title: 'Open in Monaco Editor',
			icon: 'file-code-corner',
			action: async () => await CodeEditorView.openFile(activeFile, plugin)
		});
		items.push({
			title: 'Rename (Name.ext)',
			icon: 'pencil',
			action: () => new RenameExtensionModal(plugin, activeFile).open()
		});
	}

	return items;
}
