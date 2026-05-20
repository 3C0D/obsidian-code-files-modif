/**
 * Global state management for hidden files functionality.
 * Manages adapter access and patch bypass flags.
 */
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type CodeFilesPlugin from '../../main.ts';
import type { DataAdapterWithInternal } from '../../types/index.ts';

/**
 * Global flag used to temporarily bypass the deletion patch.
 * Set to true when the user explicitly chooses
 * to hide a previously revealed file.
 */
export let _bypassPatch = false;

/**
 * Sets the bypass patch flag.
 * @param value - The value to set.
 */
export function setBypassPatch(value: boolean): void {
  _bypassPatch = value;
}

/**
 * Retrieves the platform-specific data adapter
 * @param plugin - The plugin instance.
 * @returns The platform-specific data adapter.
 */
export function getAdapter(plugin: CodeFilesPlugin): DataAdapterWithInternal {
  return getDataAdapterEx(plugin.app) as unknown as DataAdapterWithInternal;
}

/**
 * Gets or initializes the cache of revealed items paths.
 *
 * Used in reconcileDeletion patches for fast checks if a file path is revealed,
 * avoiding Set reconstruction on every call. reconcileDeletion is called by Obsidian's
 * file watcher during renames/drag-and-drop, deletions, extension unregistration (can trigger hundreds of calls), and external changes.
 * Without caching, each call recomputes Object.values(revealedItems).flat() + new Set().
 *
 * @param plugin - The plugin instance.
 * @returns The set of revealed item paths.
 */
export function getRevealedItemsCache(plugin: CodeFilesPlugin): Set<string> {
  if (!plugin._revealedItemsCache) {
    plugin._revealedItemsCache = new Set(
      Object.values(plugin.settings.revealedItems).flat()
    );
  }
  return plugin._revealedItemsCache;
}
