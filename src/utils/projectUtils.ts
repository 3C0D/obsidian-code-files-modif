/**
 * Reads TypeScript/JavaScript source files from the configured project root
 * to feed Monaco's IntelliSense (autocomplete, type checking, cross-file navigation).
 */
import { TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';

/**
 * Reads all TypeScript/JavaScript files from the project root folder.
 * Used to provide IntelliSense (autocomplete, type checking) and cross-file navigation
 * in Monaco editors.
 *
 * @param plugin - The plugin instance
 * @returns A Promise that resolves with an array of { path, content } objects for all JS/TS files in the project root.
 */
export async function readProjectFiles(
  plugin: CodeFilesPlugin
): Promise<{ path: string; content: string }[]> {
  const projectRootFolder = plugin.settings.projectRootFolder;
  if (!projectRootFolder) return [];

  const files: { path: string; content: string }[] = [];
  for (const file of plugin.app.vault.getFiles()) {
    if (!file.path.startsWith(projectRootFolder + '/')) continue;
    if (!['ts', 'tsx', 'js', 'jsx'].includes(file.extension)) continue;
    try {
      files.push({
        path: file.path,
        content: await plugin.app.vault.cachedRead(file)
      });
    } catch {
      /* skip unreadable files */
    }
  }
  return files;
}

/**
 * Checks if a tsconfig.json exists in the project root folder.
 * @param plugin - The plugin instance
 */
export function hasTsConfig(plugin: CodeFilesPlugin): boolean {
  const root = plugin.settings.projectRootFolder;
  if (!root) return false;
  return plugin.app.vault.getAbstractFileByPath(root + '/tsconfig.json') instanceof TFile;
}

/**
 * Reads and parses compilerOptions from tsconfig.json in the project root.
 * Handles JSONC (strips // and block comments before parsing).
 * Returns null if the file is absent or unparseable.
 * @param plugin - The plugin instance
 */
export async function readTsConfig(
  plugin: CodeFilesPlugin
): Promise<Record<string, unknown> | null> {
  const root = plugin.settings.projectRootFolder;
  if (!root) return null;
  const file = plugin.app.vault.getAbstractFileByPath(root + '/tsconfig.json');
  if (!(file instanceof TFile)) return null;
  try {
    const raw = await plugin.app.vault.cachedRead(file);
    // Strip // line comments and /* block comments */ for JSONC compatibility
    const stripped = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const parsed = JSON.parse(stripped);
    return (parsed.compilerOptions as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}
