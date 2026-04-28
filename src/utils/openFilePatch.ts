/**
 * Monkey-patches WorkspaceLeaf.prototype.openFile to intercept dotfiles
 * and extension-less files.
 *
 * Dotfiles (.env, .gitignore, etc.) have file.extension="" in Obsidian,
 * so they bypass normal extension routing and Obsidian tries to open
 * them with the OS. This patch checks the real extension from the
 * filename (e.g. "env" from ".env") and redirects to Monaco if that
 * extension is in the active list.
 *
 * Files without any real extension (LICENSE, README, etc.) are also
 * redirected to Monaco unconditionally.
 *
 * Files with an unregistered extension (.tata) fall through to the
 * original Obsidian behavior unchanged.
 *
 * Returns an unpatch function to restore original behavior on
 * plugin unload.
 */
import { around } from 'monkey-around';
import { WorkspaceLeaf, type OpenViewState, type TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { viewType } from '../types/variables.ts';
import { getActiveExtensions } from './extensionUtils.ts';
import { getExtension } from './fileUtils.ts';

/**
 * Applies the open file patch to the plugin instance.
 * @param plugin - The plugin instance.
 * @returns The uninstaller function to restore original behavior.
 */
export function patchOpenFile(plugin: CodeFilesPlugin): () => void {
	const uninstaller = around(WorkspaceLeaf.prototype, {
		openFile(next: WorkspaceLeaf['openFile']) {
			return async function (
				this: WorkspaceLeaf,
				file: TFile,
				openState?: OpenViewState
			) {
				console.debug('openFile patch in openFilePatch');
				// Intercept files with no Obsidian extension (dotfiles + extension-less)
				if (file && !file.extension) {
					const ext = getExtension(file.name);
					const isKnownToObsidian =
						!!plugin.app.viewRegistry.typeByExtension[ext];
					const isKnownToMonaco =
						!ext || getActiveExtensions(plugin.settings).includes(ext);

					// Avoid openining tabs for unknown extensions
					if (!isKnownToObsidian && !isKnownToMonaco) {
						return; // Unknown everywhere — do nothing
					}

					if (isKnownToMonaco) {
						const existingLeaf = plugin.app.workspace
							.getLeavesOfType(viewType)
							.find((leaf) => {
								const view = leaf.view as { file?: { path: string } };
								return view.file?.path === file.path;
							});
						if (existingLeaf) {
							plugin.app.workspace.revealLeaf(existingLeaf);
							return;
						}
						return this.setViewState(
							{ type: viewType, state: { file: file.path }, active: true },
							openState
						);
					}
				}
				// Fall through to original Obsidian behavior
				return next.call(this, file, openState);
			};
		}
	});

	return uninstaller;
}
