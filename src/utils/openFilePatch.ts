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
import type CodeFilesPlugin from '../main.ts';
import { viewType } from '../types/types.ts';
import { getActiveExtensions } from './extensionUtils.ts';
import { getExtension } from './fileUtils.ts';
import { around } from 'monkey-around';

export function patchOpenFile(plugin: CodeFilesPlugin): () => void {
	// require() instead of static import: TypeScript would reject
	// reassigning proto.openFile on a typed class.
	const WorkspaceLeaf = require('obsidian').WorkspaceLeaf;

	const uninstaller = around(WorkspaceLeaf.prototype, {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		openFile(next: any) {
			return function (
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				file: any,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				...args: any[]
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
				return next.call(this, file, ...args);
			};
		}
	});

	return uninstaller;
}
