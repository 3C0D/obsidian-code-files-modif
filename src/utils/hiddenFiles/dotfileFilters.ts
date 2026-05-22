/**
 * Helpers to distinguish manually revealed dotfiles from auto-managed ones
 * (those whose extension is registered when isAutoRevealRegisteredDotfile is enabled).
 * Auto-managed dotfiles are always visible and must be excluded from manual reveal/hide flows.
 */

import type CodeFilesPlugin from '../../main.ts';
import { getExtension } from '../fileUtils.ts';
import { getActiveExtensions } from '../extensionUtils.ts';

/**
 * Returns true if a dotfile is auto-managed by Code Files:
 * its extension is registered AND isAutoRevealRegisteredDotfile is enabled.
 * Auto-managed dotfiles are always visible and must be excluded from manual reveal/hide flows.
 */
export function isRegisteredDotfile(name: string, plugin: CodeFilesPlugin): boolean {
  if (!plugin.settings.isAutoRevealRegisteredDotfile) return false;
  const ext = getExtension(name);
  if (!ext) return false;
  return getActiveExtensions(plugin.settings).includes(ext);
}

/**
 * Filters a list of dot entries to keep only manually-managed ones.
 * Folders are always kept. Files whose extension is auto-managed are excluded.
 */
export function filterManualDotEntries<T extends { name: string; isFolder: boolean }>(
  items: T[],
  plugin: CodeFilesPlugin
): T[] {
  return items.filter((item) => item.isFolder || !isRegisteredDotfile(item.name, plugin));
}
