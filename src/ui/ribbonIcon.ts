import type CodeFilesPlugin from '../main.ts';
import { CreateCodeFileModal } from '../modals/createCodeFileModal.ts';

/**
 * Updates the ribbon icon based on the showRibbonIcon setting.
 */
export function updateRibbonIcon(plugin: CodeFilesPlugin): void {
	// Avoid duplicates when toggling the setting
	plugin.ribbonIconEl?.remove();
	plugin.ribbonIconEl = plugin.settings.showRibbonIcon
		? plugin.addRibbonIcon('file-code-corner', 'Create Code File | Manage extensions (+/−)', () => {
				new CreateCodeFileModal(plugin).open();
			})
		: null;
}
