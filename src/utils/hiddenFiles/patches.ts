/**
 * Monkey patches for Obsidian's file system adapter.
 * Intercepts file operations to control visibility of hidden files and folders.
 */
import { type DataAdapterEx } from 'obsidian-typings';
import { around } from 'monkey-around';
import { type Plugin, type TAbstractFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { getAdapter, _bypassPatch, setBypassPatch } from './state.ts';
import { getExtension, getRealPathSafe } from '../fileUtils.ts';
// import { reconcileItem } from './reconcile.ts';
import { decorateFolders } from './badge.ts';
import { syncAutoRevealedDotfiles } from './sync.ts';

/**
 * Patches Obsidian's DataAdapter to intercept file operations:
 * reconcileDeletion (blocks removal of revealed dotfiles), rename
 * (fixes drag-and-drop destination and blocks moves out of configDir),
 * and vault.trash (allows dotfile deletion and cleans up revealedItems).
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
          // Always protect dot-items (files or folders, e.g. .env, .git)
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
            const rev = Object.values(plugin.settings.revealedItems).flat();
            if (tmp.includes(normalizedPath) || rev.includes(normalizedPath)) {
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
        const configDir = plugin.app.vault.configDir;
        // Block moving the configDir itself (e.g. accidental drag-and-drop of .obsidian)
        if (src === configDir) {
          return;
        }
        // Block renames that would move external files (snippets, etc.) out of configDir
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
        if (plugin.settings.revealedItems[srcFolder]) {
          const original = plugin.settings.revealedItems[srcFolder];
          const filtered = original.filter((p) => p !== src);
          if (filtered.length !== original.length) {
            // src was actually in revealedItems
            if (filtered.length > 0) {
              plugin.settings.revealedItems[srcFolder] = filtered;
            } else {
              delete plugin.settings.revealedItems[srcFolder];
            }
            changed = true;
          }
        }

        // Add to destination folder
        if (changed) {
          const existing = plugin.settings.revealedItems[destFolder] ?? [];
          plugin.settings.revealedItems[destFolder] = [...existing, dest];
        }

        if (changed) {
          void plugin.saveSettings();
          decorateFolders(plugin);
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
        const itemPath = file?.path;
        if (itemPath) setBypassPatch(true);
        try {
          const result = await next.call(this, file, system);

          // Clean up revealedItemsafter deletion
          if (itemPath) {
            for (const [folderPath, paths] of Object.entries(
              plugin.settings.revealedItems
            )) {
              const filtered = paths.filter(
                (p) => p !== itemPath && !p.startsWith(itemPath + '/')
              );
              if (filtered.length !== paths.length) {
                if (filtered.length > 0) {
                  plugin.settings.revealedItems[folderPath] = filtered;
                } else {
                  delete plugin.settings.revealedItems[folderPath];
                }
              }
            }
            void plugin.saveSettings();
            decorateFolders(plugin);
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
  };
}

/**
 * Patches Plugin.registerExtensions (via monkey-around) and viewRegistry.unregisterExtensions
 * (via direct patch) to keep dotfile visibility in sync with extension registration state.
 *
 * - On register: cleans revealedItemsand auto-reveals dotfiles for the new extensions.
 * - On unregister: hides dotfiles for removed extensions, unless explicitly in revealedItems.
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
          Object.values(plugin.settings.revealedItems).flat()
        );
        const adapter = getAdapter(plugin);
        for (const file of plugin.app.vault.getFiles()) {
          if (!extensions.includes(getExtension(file.name))) continue;
          if (file.extension) continue; // skip files with a regular extension, dotfiles have none
          if (revealedPaths.has(file.path)) continue;
          const orig =
            plugin._origReconcileDeletion ?? adapter.reconcileDeletion.bind(adapter);
          orig(getRealPathSafe(adapter, file.path), file.path).catch(console.error);
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
