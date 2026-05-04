import { type DataAdapterEx } from 'obsidian-typings';
import { around } from 'monkey-around';
import { type Plugin, type TAbstractFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter, _bypassPatch, setBypassPatch } from './state.ts';
import { getExtension, getRealPathSafe } from '../fileUtils.ts';
import { decorateFolders } from './badge.ts';
import { syncAutoRevealedDotfiles } from './sync.ts';

/**
 * Patches Obsidian's DataAdapter to prevent the automatic
 * removal of dotfiles from the UI.
 *
 * Strategy for reconcileDeletion:
 * - If the file no longer exists on disk → real deletion
 *   (trash, delete, external removal) → allow through.
 * - If the file still exists on disk → Obsidian is trying
 *   to clean up a revealed dotfile → block it.
 * - _bypassPatch flag overrides for explicit hide actions.
 *
 * @param plugin - The plugin instance.
 * @returns A function to unpatch the adapter.
 */
export function patchAdapter(plugin: CodeFilesPlugin): () => void {
	const adapter = getAdapter(plugin);

	// Save originals before patching
	plugin._origReconcileDeletion = adapter.reconcileDeletion.bind(adapter);
	plugin._origRename = adapter.rename.bind(adapter);

	// Patch reconcileDeletion with monkey-around
	const unpatchReconcile = around(adapter, {
		reconcileDeletion(next) {
			return async function (
				this: DataAdapterEx,
				realPath: string,
				normalizedPath: string
			) {
				if (!_bypassPatch) {
					const basename = normalizedPath.split('/').pop() || '';
					// Always protect dotfiles (e.g. .env)
					if (basename.startsWith('.')) return;
					// Protect files inside configDir
					// (e.g. .obsidian/snippets/my.css)
					// that are currently tracked by
					// the plugin (temporary or manual
					// reveal). Uses synchronous checks
					// to avoid deadlock with the watcher.
					const cfgDir = plugin.app.vault.configDir;
					if (normalizedPath.startsWith(cfgDir + '/')) {
						const tmp = plugin.settings.temporaryRevealedPaths;
						const rev = Object.values(plugin.settings.revealedFiles).flat();
						if (
							tmp.includes(normalizedPath) ||
							rev.includes(normalizedPath)
						) {
							return;
						}
					}
				}
				return next.call(this, realPath, normalizedPath);
			};
		}
	});

	// Fix drag-and-drop(rename error): Obsidian passes the target folder as dest instead of
	// the full destination path, resulting in a wrong rename target for dotfiles.
	const unpatchRename = around(adapter, {
		rename(next) {
			return async function (this: DataAdapterEx, src: string, dest: string) {
				// Block renames that would move external files (snippets, etc.) out of configDir
				const configDir = plugin.app.vault.configDir;
				if (
					src.startsWith(configDir + '/') &&
					!dest.startsWith(configDir + '/')
				) {
					return;
				}
				// Fix drag-and-drop destination for dotfiles
				if (adapter.files?.[dest]?.type === 'folder') {
					const filename = src.split('/').pop() || '';
					dest = dest + '/' + filename;
				}
				const result = await next.call(this, src, dest);

				// Update revealedFiles after rename
				const srcFolder = src.substring(0, src.lastIndexOf('/')) || '';
				const destFolder = dest.substring(0, dest.lastIndexOf('/')) || '';
				let changed = false;

				// Remove from source folder
				if (plugin.settings.revealedFiles[srcFolder]) {
					const original = plugin.settings.revealedFiles[srcFolder];
					const filtered = original.filter((p) => p !== src);
					if (filtered.length !== original.length) {
						// src was actually in revealedFiles
						if (filtered.length > 0) {
							plugin.settings.revealedFiles[srcFolder] = filtered;
						} else {
							delete plugin.settings.revealedFiles[srcFolder];
						}
						changed = true;
					}
				}

				// Add to destination folder
				if (changed) {
					const existing = plugin.settings.revealedFiles[destFolder] ?? [];
					plugin.settings.revealedFiles[destFolder] = [...existing, dest];
				}

				if (changed) {
					void plugin.saveSettings();
					void decorateFolders(plugin);
				}

				return result;
			};
		}
	});

	// Patch vault.trash to allow dotfile deletion
	const unpatchTrash = around(plugin.app.vault, {
		trash(next) {
			return async function (
				this: typeof plugin.app.vault,
				file: TAbstractFile,
				system: boolean
			) {
				const filePath = file?.path;
				if (filePath) setBypassPatch(true);
				try {
					const result = await next.call(this, file, system);

					// Clean up revealedFiles after deletion
					if (filePath) {
						for (const [folderPath, paths] of Object.entries(
							plugin.settings.revealedFiles
						)) {
							const filtered = paths.filter((p) => p !== filePath);
							if (filtered.length !== paths.length) {
								if (filtered.length > 0) {
									plugin.settings.revealedFiles[folderPath] = filtered;
								} else {
									delete plugin.settings.revealedFiles[folderPath];
								}
							}
						}
						void plugin.saveSettings();
						void decorateFolders(plugin);
					}

					return result;
				} finally {
					setBypassPatch(false);
				}
			};
		}
	});

	return () => {
		unpatchReconcile();
		unpatchRename();
		unpatchTrash();
		plugin._origReconcileDeletion = null;
		plugin._origRename = null;
	};
}

/**
 * Patches Plugin.registerExtensions (via monkey-around) and viewRegistry.unregisterExtensions
 * (via direct patch) to keep dotfile visibility in sync with extension registration state.
 *
 * - On register: cleans revealedFiles and auto-reveals dotfiles for the new extensions.
 * - On unregister: hides dotfiles for removed extensions, unless explicitly in revealedFiles.
 *
 * @param plugin - The plugin instance.
 * @returns A function to unpatch both patches.
 */
export function patchRegisterExtensions(plugin: CodeFilesPlugin): () => void {
	const viewRegistry = plugin.app.viewRegistry;
	const unAroundUnregister = around(viewRegistry, {
		unregisterExtensions(next) {
			return function (this: typeof viewRegistry, extensions: string[]) {
				next.call(this, extensions);
				const revealedPaths = new Set(
					Object.values(plugin.settings.revealedFiles).flat()
				);
				const adapter = getAdapter(plugin);
				for (const file of plugin.app.vault.getFiles()) {
					if (!extensions.includes(getExtension(file.name) ?? '')) continue;
					if (file.extension) continue; // Only dotfiles
					if (revealedPaths.has(file.path)) continue;
					const orig =
						plugin._origReconcileDeletion ??
						adapter.reconcileDeletion.bind(adapter);
					orig(getRealPathSafe(adapter, file.path), file.path).catch(
						console.error
					);
				}
			};
		}
	});

	const unAroundRegister = around(plugin as Plugin, {
		registerExtensions(next) {
			return function (this: Plugin, exts: string[], vType: string) {
				const result = next.call(this, exts, vType);
				if (plugin.app.workspace.layoutReady) {
					void syncAutoRevealedDotfiles(plugin, exts);
				}
				return result;
			};
		}
	});

	return () => {
		unAroundRegister();
		unAroundUnregister();
	};
}
