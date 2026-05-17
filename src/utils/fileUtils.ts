/**
 * File utilities for handling extensions and file names.
 */
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type { DataAdapterWithInternal } from '../types/index.ts';
import type { App } from 'obsidian';

/**
 * Gets the absolute filesystem path to the vault's root folder.
 *
 * @param app - The Obsidian App instance.
 * @returns The absolute base path of the vault.
 */
export function getVaultBasePath(app: App): string {
  return getDataAdapterEx(app).basePath;
}

/**
 * Extracts the extension from a filename.
 * Handles dotfiles (.env → "env") and normal files (myfile.py → "py").
 * Returns empty string for files without extension that don't start with a dot (like LICENSE, README).
 *
 * @param filename - The filename to extract the extension from
 * @returns The extension of the file, without the leading dot
 */
export function getExtension(filename: string): string {
  return filename.match(/\.([^.]+)$/)?.[1] ?? '';
}

/**
 * Gets the real path for a file using adapter.getRealPath(), with fallback to the original path.
 * getRealPath is Desktop-only; on Mobile, it returns the path unchanged.
 *
 * @param adapter - The file system adapter
 * @param itemPath - The vault-relative path (file or folder)
 * @returns The real path if available, otherwise the original itemPath
 */
export function getRealPathSafe(
  adapter: DataAdapterWithInternal,
  itemPath: string
): string {
  return adapter.getRealPath?.(itemPath) ?? itemPath;
}
