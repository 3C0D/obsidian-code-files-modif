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
import { RevealHiddenFilesModal } from '../modals/revealHiddenFilesModal.ts';
import { Notice } from 'obsidian';
import { updateProjectFolderHighlight } from '../utils/explorerUtils.ts';
import type { MenuItem } from '../types/types.ts';
import { OBSIDIAN_NATIVE_EXTENSIONS } from '../types/variables.ts';
import { broadcastProjectFiles } from '../utils/broadcast.ts';
import {
	addExtension,
	removeExtension,
	registerExtension,
	unregisterExtension,
	syncRegisteredExts,
	getActiveExtensions
} from '../utils/extensionUtils.ts';
import { getExtension } from '../utils/fileUtils.ts';
import { openInMonacoLeaf } from '../editor/codeEditorView/editorOpeners.ts';
import { CodeEditorView } from '../editor/codeEditorView/index.ts';

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
					// Cursor outside a code fence: show Code Files submenu (Open in Monaco, Rename (Name/ext))
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
function getFolderItems(plugin: CodeFilesPlugin, folder: TFolder): MenuItem[] {
	const items: MenuItem[] = [
		{
			title: 'Create Code File | Manage extensions',
			icon: 'file-plus',
			action: () => new CreateCodeFileModal(plugin, folder).open()
		},
		{
			title: 'Reveal/Hide Hidden Files',
			icon: 'eye',
			action: () => new RevealHiddenFilesModal(plugin, folder.path).open()
		}
	];

	// Show "Define" only if this folder isn't already the project root
	if (plugin.settings.projectRootFolder !== folder.path) {
		items.push({
			title: 'Define as Project Root Folder',
			icon: 'folder-tree',
			action: async () => {
				plugin.settings.projectRootFolder = folder.path;
				await plugin.saveSettings();
				updateProjectFolderHighlight(plugin);
				await broadcastProjectFiles(plugin);
			}
		});
	} else {
		// Show "Clear" only if this folder is already the project root
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
function getFileExplorerItems(plugin: CodeFilesPlugin, file: TFile): MenuItem[] {
	const ext = getExtension(file.name);
	const items: MenuItem[] = [];

	// Check if extension is registered and if it's native to Obsidian
	const activeExts = getActiveExtensions(plugin.settings);
	const isRegistered = activeExts.includes(ext);
	const isNative = OBSIDIAN_NATIVE_EXTENSIONS.includes(ext);

	// Show "Open in Monaco Editor" if:
	// - File has no extension (LICENSE, README, etc.), OR
	// - Extension is not registered AND not native
	if (ext && !isRegistered) {
		items.push({
			title: 'Open in Monaco Editor',
			icon: 'file-code-corner',
			action: async () => await openInMonacoLeaf(file, plugin, true, null, false, true)
		});
	}

	// Show "Register Extension" only if has extension AND not registered AND not native
	if (ext && !isRegistered && !isNative) {
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
	if (ext && isRegistered && !isNative) {
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

	// Always show "Rename (Name/ext)"
	items.push({
		title: 'Rename (Name/ext)',
		icon: 'pencil',
		action: () => new RenameExtensionModal(plugin, file).open()
	});

	return items;
}

/** Builds the submenu items shown in the markdown editor-menu.
 */
function getFileItems(plugin: CodeFilesPlugin): MenuItem[] {
	const activeFile = plugin.app.workspace.getActiveFile();
	const isCodeEditor = !!plugin.app.workspace.getActiveViewOfType(CodeEditorView);
	const items: MenuItem[] = [];
	if (!activeFile) {
		return [];
	}

	items.push({
		title: 'Rename (Name/ext)',
		icon: 'pencil',
		action: () => new RenameExtensionModal(plugin, activeFile).open()
	});

	if (!isCodeEditor) {
		items.push({
			title: 'Open in Monaco Editor',
			icon: 'file-code-corner',
			action: async () => await openInMonacoLeaf(activeFile, plugin, false, null, false, true)
		});
	}

	return items;
}
