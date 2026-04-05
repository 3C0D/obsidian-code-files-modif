import type CodeFilesPlugin from '../main.ts';
import { CreateCodeFileModal } from '../modals/createCodeFileModal.ts';

export function updateRibbonIcon(plugin: CodeFilesPlugin): void {
	plugin.ribbonIconEl?.remove();
	plugin.ribbonIconEl = plugin.settings.showRibbonIcon
		? plugin.addRibbonIcon('file-json', 'Create Code File', () => {
				(document.activeElement as HTMLElement)?.blur();
				new CreateCodeFileModal(plugin).open();
			})
		: null;
}
