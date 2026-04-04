import { TFile, TFolder } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { CreateCodeFileModal } from '../modals/createCodeFileModal.ts';
import { FenceEditModal } from '../modals/fenceEditModal.ts';
import { FenceEditContext } from '../utils/fenceEditContext.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import type { MenuItems } from '../types.ts';

export function registerContextMenus(plugin: CodeFilesPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, abstractFile, source) => {
			if (abstractFile instanceof TFolder) {
				menu.addItem((i) =>
					i
						.setTitle('Create Code File')
						.setIcon('file-plus')
						.onClick(() =>
							new CreateCodeFileModal(plugin, abstractFile).open()
						)
				);
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
						const items = getItems(plugin);
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
					const items = getItems(plugin);
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

function getItems(plugin: CodeFilesPlugin): MenuItems[] {
	const activeFile = plugin.app.workspace.getActiveFile();

	const items: MenuItems[] = [];

	items.push({
		title: 'Create Code File',
		icon: 'file-plus',
		action: () => new CreateCodeFileModal(plugin).open()
	});
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
