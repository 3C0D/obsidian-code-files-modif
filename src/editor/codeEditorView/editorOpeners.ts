import { TFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { viewType } from '../../types/variables.ts';

/**
 * Opens a file (vault or external) in a Monaco editor leaf.
 * Activates an existing leaf if the file is already open,
 * otherwise opens it in a new tab or the current leaf.
 * @param fileOrPath - TFile or absolute path of the file to open.
 * @param plugin - The CodeFilesPlugin instance.
 * @param newTab - Whether to open in a new tab or reuse the current leaf.
 */
export async function openInMonacoLeaf(
	fileOrPath: TFile | string,
	plugin: CodeFilesPlugin,
	newTab: boolean
): Promise<void> {
	const filePath = fileOrPath instanceof TFile ? fileOrPath.path : fileOrPath;
	const isExternal = !plugin.app.vault.getAbstractFileByPath(filePath);

	// Activate existing leaf if file is already open
	const existingLeaf = plugin.app.workspace.getLeavesOfType(viewType).find((leaf) => {
		const view = leaf.view as { file?: { path: string } };
		return view.file?.path === filePath;
	});
	if (existingLeaf) {
		plugin.app.workspace.revealLeaf(existingLeaf);
		return;
	}

	// Open in new tab or current leaf
	const leaf = plugin.app.workspace.getLeaf(newTab ? 'tab' : false);
	await leaf.setViewState({
		type: viewType,
		active: true,
		state: {
			file: filePath,
			...(isExternal && { external: true, reveal: true })
		}
	});
}
