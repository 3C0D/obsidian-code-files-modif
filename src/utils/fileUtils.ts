/**
 * File utilities for handling extensions and file names.
 */
import { normalizePath, Notice, type TFile } from 'obsidian';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type { DataAdapterWithInternal } from '../types/index.ts';
import type { App } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { getAdapter } from './hiddenFiles/index.ts';

/**
 * Gets the maximum file size in bytes from the plugin settings.
 * Defaults to 10MB if not configured.
 */
export function getMaxFileSize(plugin: CodeFilesPlugin): number {
  return (plugin.settings.maxFileSize || 10) * 1024 * 1024;
}

/**
 * Checks if a file size exceeds the configured limit.
 * If exceeded, shows an Obsidian Notice and returns true.
 * @param fileOrSize - The TFile or the size in bytes to check.
 * @param plugin - The plugin instance.
 * @returns True if the file is too large, false otherwise.
 */
export function isFileSizeTooLarge(
  fileOrSize: TFile | number,
  plugin: CodeFilesPlugin
): boolean {
  const size = typeof fileOrSize === 'number' ? fileOrSize : fileOrSize.stat?.size;
  if (!size) return false;

  const maxBytes = getMaxFileSize(plugin);
  if (size > maxBytes) {
    const sizeMB = (size / (1024 * 1024)).toFixed(1);
    const maxMB = plugin.settings.maxFileSize || 10;
    new Notice(
      `File too large (${sizeMB} MB). Maximum is ${maxMB} MB.\n` +
        `Change this in Settings → Code Files → Maximum file size.`,
      7000
    );
    return true;
  }
  return false;
}

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

/**
 * Collects all subfolder paths within a given folder, respecting exclusion settings.
 * @param plugin - The plugin instance
 * @param folderPath - The path of the folder to scan
 */
export async function collectSubfolderPaths(
  plugin: CodeFilesPlugin,
  folderPath: string
): Promise<string[]> {
  const adapter = getAdapter(plugin);
  const results: string[] = [];
  const collect = async (dir: string): Promise<void> => {
    try {
      const listed = await adapter.list(dir || '');
      for (const rawFolder of listed.folders) {
        const childPath = normalizePath(rawFolder);
        const basename = childPath.split('/').pop() || '';
        if (basename.startsWith('.')) continue;
        if (plugin.settings.excludedFolders.includes(basename)) continue;
        results.push(childPath);
        await collect(childPath);
      }
    } catch {
      /* ignore listing errors */
    }
  };
  await collect(folderPath);
  return results;
}
