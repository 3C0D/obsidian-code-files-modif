/**
 * Monkey-patches WorkspaceLeaf.prototype.openFile to intercept dotfiles.
 *
 * Dotfiles (.env, .gitignore, etc.) have file.extension="" in Obsidian,
 * so they bypass normal extension routing and Obsidian tries to open
 * them with the OS. This patch checks the real extension from the
 * filename (e.g. "env" from ".env") and redirects to Monaco if that
 * extension is in the active list.
 *
 * Files without a real extension (LICENSE, README) or with an
 * unregistered extension (.tata) fall through to the original
 * Obsidian behavior unchanged.
 *
 * Returns an unpatch function to restore original behavior on
 * plugin unload.
 */
import { around } from 'monkey-around';
import { WorkspaceLeaf, type OpenViewState, TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { viewType } from '../types/variables.ts';
import { getActiveExtensions } from './extensionUtils.ts';
import { getExtension } from './fileUtils.ts';

export function patchOpenFile(plugin: CodeFilesPlugin): () => void {
	const uninstaller = around(WorkspaceLeaf.prototype, {
		openFile(next: WorkspaceLeaf['openFile']) {
			return async function (
				this: WorkspaceLeaf,
				file: TFile,
				openState?: OpenViewState
			) {
				// Only intercept files with no Obsidian extension (dotfiles)
				if (file && !file.extension) {
					const ext = getExtension(file.name);
					if (ext && getActiveExtensions(plugin.settings).includes(ext)) {
						// Redirect to Monaco instead of OS handler
						return this.setViewState({
							type: viewType,
							state: { file: file.path },
							active: true
						});
					}
				}
				// Fall through to original Obsidian behavior
				return next.call(this, file, openState);
			};
		}
	});

	return uninstaller;
}
