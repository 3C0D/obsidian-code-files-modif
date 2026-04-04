import { TFile, TFolder } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { CreateCodeFileModal } from './createCodeFileModal.ts';
import { FenceEditModal } from './fenceEditModal.ts';
import { FenceEditContext } from './fenceEditContext.ts';
import { RenameExtensionModal } from './renameExtensionModal.ts';

export function registerContextMenus(plugin: CodeFilesPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, abstractFile, _source) => {
			const isFolder = abstractFile instanceof TFolder;
			const isFile = abstractFile instanceof TFile;

			if (isFolder) {
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

			// On a file — Rename Extension on all files in explorer and tab header
			if (isFile) {
				menu.addItem((i) =>
					i
						.setTitle('Rename Extension')
						.setIcon('pencil')
						.onClick(() =>
							new RenameExtensionModal(plugin, abstractFile as TFile).open()
						)
				);
			}
		})
	);

	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor) => {
			const fenceContext = FenceEditContext.create(plugin, editor);
			const activeFile = plugin.app.workspace.getActiveFile();

			type MenuItem = { title: string; icon: string; action: () => void };
			const items: MenuItem[] = [];

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

			menu.addItem((item) => {
				if (fenceContext) {
					item.setTitle('Edit Code Block in Monaco Editor')
						.setIcon('code')
						.onClick(() => FenceEditModal.openOnCurrentCode(plugin, editor));
				} else {
					item.setTitle('Code Files').setIcon('file-json');
					const sub = item.setSubmenu();
					for (const it of items) {
						sub.addItem((i) =>
							i.setTitle(it.title).setIcon(it.icon).onClick(it.action)
						);
					}
				}
			});
		})
	);
}
