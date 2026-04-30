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
	const existingLeaf = plugin.app.workspace.getLeavesOfType(viewType).find((l) => {
		if (l.getRoot() !== plugin.app.workspace.rootSplit) return false;
		return l.view instanceof CodeEditorView && l.view.file?.path === filePath;
	});
	return existingLeaf || null;
}

/**
 * Opens a file (vault or external) in a Monaco editor leaf.
 * Activates an existing leaf if the file is already open,
 * otherwise opens it in a new tab or the current leaf.
 * @param fileOrPath - TFile or absolute path of the file to open.
 * @param plugin - The CodeFilesPlugin instance.
 * @param newTab - Whether to open in a new tab or reuse the current leaf.
 * @param position - Optional position to scroll to after opening.
 * @param reuseExisting - Whether to reuse an existing leaf for the file.
 */
export async function openInMonacoLeaf(
    fileOrPath: TFile | string,
    plugin: CodeFilesPlugin,
    newTab: boolean,
    position?: { lineNumber: number; column: number } | null,
    reuseExisting = false
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
                ...(isExternal && { external: true })
            }
        });
    }

    // Reveal the leaf in the tab bar and focus it (works for both new and existing leaves)
    plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

    if (position) {
        // empirical delay, no clean alternative: 150ms to ensure Monaco is ready
        // to receive the 'scroll-to-position' command after it is opened in a new tab.
        setTimeout(() => {
            if (leaf.view instanceof CodeEditorView && leaf.view.editor) {
                leaf.view.editor.send('scroll-to-position', { position });
            }
        }, existingLeaf ? 0 : 150);
    }
}
