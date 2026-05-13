/**
 * Symlink detection utilities.
 * Checks if files are symbolic links, with platform-specific handling.
 */
import { Platform, normalizePath } from 'obsidian';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type CodeFilesPlugin from '../../main.ts';
import type * as fs from 'fs';

/**
 * Checks whether the given vault-relative path is a symbolic link.
 * Only available on desktop (Electron); always returns false on mobile.
 * Returns false on any error to avoid crashing the scan.
 *
 * @param plugin - The plugin instance.
 * @param vaultRelativePath - The path relative to the vault root.
 * @returns True if the path is a symbolic link, false otherwise.
 */
export function isSymlink(plugin: CodeFilesPlugin, vaultRelativePath: string): boolean {
  if (!Platform.isDesktopApp) return false;
  try {
    const adapter = getDataAdapterEx(plugin.app);
    if (!adapter.basePath) return false;
    const abs = normalizePath(`${adapter.basePath}/${vaultRelativePath}`);
    const fsModule = require('fs') as typeof fs;
    return fsModule.lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}
