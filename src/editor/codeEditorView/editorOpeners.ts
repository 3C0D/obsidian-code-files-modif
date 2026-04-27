import type { TFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { viewType } from '../../types/variables.ts';

/**
 * Opens a vault file in a leaf (new tab or current leaf based on parameter).
 */
export async function openVaultFile(
	file: TFile,
	plugin: CodeFilesPlugin,
	newTab = false
): Promise<void> {
	const leaf = plugin.app.workspace.getLeaf(newTab ? 'tab' : false);
	await leaf.setViewState({
		type: viewType,
		state: { file: file.path },
		active: true
	});
}

/**
 * Opens external files (CSS snippets) via an adapter path (not vault-indexed).
 * Reuses existing tab if file is already open, otherwise creates a new tab.
 * Constructs a pseudo TFile internally since the path is outside the vault.
 */
export async function openExternalFile(
	filePath: string,
	plugin: CodeFilesPlugin
): Promise<void> {
	// Check if file is already open in a leaf
	const existingLeaf = plugin.app.workspace.getLeavesOfType(viewType).find((leaf) => {
		const view = leaf.view as { file?: { path: string } };
		return view.file?.path === filePath;
	});

	if (existingLeaf) {
		// File already open — activate that leaf
		plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		return;
	}

	// Always create a new tab for external files
	const leaf = plugin.app.workspace.getLeaf('tab');
	// Use setViewState for proper state management and persistence
	await leaf.setViewState({
		type: viewType,
		state: { file: filePath, external: true, reveal: true },
		active: true
	});
}

/**
 * Opens any file in Monaco.
 * If the file is in the vault, it opens it in a leaf (new tab or current leaf based on parameter).
 * If the file is not in the vault, it opens it in a new leaf via an adapter path (not vault-indexed).
 * @param file The file to open.
 * @param plugin The CodeFilesPlugin instance.
 * @param newTab Whether to open the file in a new tab or the current leaf.
 */
export async function openFile(
	file: TFile,
	plugin: CodeFilesPlugin,
	newTab = false
): Promise<void> {
	const inVault = plugin.app.vault.getAbstractFileByPath(file.path);
	if (inVault) {
		console.debug('Opening vault file', file.path);
		await openVaultFile(file, plugin, newTab);
	} else {
		console.debug('Opening external file', file.path);
		await openExternalFile(file.path, plugin);
	}
}
