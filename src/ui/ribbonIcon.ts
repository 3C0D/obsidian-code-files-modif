import type CodeFilesPlugin from '../main.ts';
import { CreateCodeFileModal } from '../modals/createCodeFileModal.ts';

/**
 * Adds the ribbon icon to create code files.
 */
export function addRibbonIcon(plugin: CodeFilesPlugin): void {
	plugin.ribbonIconEl = plugin.addRibbonIcon(
		'file-code-corner',
		'Create Code File | Manage extensions',
		() => {
			new CreateCodeFileModal(plugin).open();
		}
	);
}
