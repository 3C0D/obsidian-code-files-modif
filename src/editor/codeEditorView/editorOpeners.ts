/**
 * Module for managing the opening of files in the Monaco editor.
 * Provides utilities to find existing editor leaves and open files in new or existing tabs.
 */
import type { WorkspaceLeaf } from 'obsidian';
import { TFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { viewType } from '../../types/variables.ts';
import { CodeEditorView } from '../codeEditorView/index.ts';

/**
 * Looks for an existing Monaco leaf for the given file path in the main editor area.
 * Returns the leaf if found, otherwise null.
 */
export function findRootMonacoLeaf(
	plugin: CodeFilesPlugin,
	filePath: string
): WorkspaceLeaf | null {
	const allLeaves = plugin.app.workspace.getLeavesOfType(viewType);
	const existingLeaf = allLeaves.find((leaf) => {
		const isRoot = leaf.getRoot() === plugin.app.workspace.rootSplit;
		const viewFilePath =
			leaf.view instanceof CodeEditorView ? leaf.view.file?.path : undefined;
		const stateFilePath = leaf.getViewState().state?.file as string | undefined;
		if (!isRoot) return false;
		return (viewFilePath ?? stateFilePath) === filePath;
	});
	return existingLeaf ?? null;
}

/**
 * Opens a file (vault or external) in a Monaco editor leaf.
 * Activates an existing leaf if the file is already open,
 * otherwise opens it in a new tab or the current leaf.
 * @param fileOrPath - TFile or absolute path of the file to open.
 * @param plugin - The CodeFilesPlugin instance.
 * @param newTab - Whether to open in a new tab or reuse the current leaf.
 * @param position - (default: undefined) Optional position to scroll to after opening.
 * @param reuseExisting - (default: false) Whether to reuse an existing leaf for the file.
 * @param noReturnAction - (default: false) Whether to hide the return arrow (for explicit user opens).
 */
export async function openInMonacoLeaf(
	fileOrPath: TFile | string,
	plugin: CodeFilesPlugin,
	newTab: boolean,
	position?: { lineNumber: number; column: number } | null,
	reuseExisting = false,
	noReturnAction = false
): Promise<void> {
	const filePath = fileOrPath instanceof TFile ? fileOrPath.path : fileOrPath;
	const isExternal = !plugin.app.vault.getAbstractFileByPath(filePath);
	const existingLeaf = reuseExisting ? findRootMonacoLeaf(plugin, filePath) : null;
	const leaf = existingLeaf ?? plugin.app.workspace.getLeaf(newTab ? 'tab' : false);

	if (!existingLeaf) {
		await leaf.setViewState({
			type: viewType,
			active: true,
			state: {
				file: filePath,
				...(isExternal && { external: true, reveal: true }),
				...(noReturnAction && { noReturnAction: true })
			}
		});
	}

	// Reveal the leaf in the tab bar and focus it (works for both new and existing leaves)
	plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

	if (position) {
		// empirical delay, no clean alternative: 150ms to ensure Monaco is ready
		// to receive the 'scroll-to-position' command after it is opened in a new tab.
		setTimeout(
			() => {
				if (leaf.view instanceof CodeEditorView && leaf.view.editor) {
					leaf.view.editor.send('scroll-to-position', { position });
				}
			},
			existingLeaf ? 0 : 150
		);
	}
}
