/**
 * Project root utilities:
 * - Reads TypeScript/JavaScript source files from the configured project root
 *   to feed Monaco's IntelliSense (autocomplete, type checking, cross-file navigation).
 * - Manages dotfile reveal/unreveal (using manual-only filter) when the project
 *   root is defined or cleared.
 */
import type CodeFilesPlugin from '../main.ts';
import { scanDotEntries, filterManualDotEntries } from './hiddenFiles/index.ts';
import { revealItems, unrevealItems } from './hiddenFiles/index.ts';
import { collectSubfolderPaths } from './fileUtils.ts';

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
  return plugin.app.vault.getFileByPath(root + '/tsconfig.json') !== null;
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
  const file = plugin.app.vault.getFileByPath(root + '/tsconfig.json');
  if (!file) return null;
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

/**
 * Checks if the project root (and its subfolders) contains any dotfiles or dot-folders.
 * Used to conditionally show the "Show Hidden Files" toggle in the settings modal.
 * @param plugin - The plugin instance
 */
export async function projectRootHasDotfiles(plugin: CodeFilesPlugin): Promise<boolean> {
  const root = plugin.settings.projectRootFolder;
  if (!root) return false;

  const allFolders = [root, ...(await collectSubfolderPaths(plugin, root))];
  for (const folder of allFolders) {
    const items = await scanDotEntries(plugin, folder);
    if (filterManualDotEntries(items, plugin).length > 0) return true;
  }
  return false;
}

/**
 * Reveals all dotfiles and dot-folders found in the project root and its subfolders.
 * Called when the "Show Hidden Files" toggle is turned on.
 * @param plugin - The plugin instance
 * @param rootOverride - Optional path to reveal instead of the configured project root
 */
export async function revealProjectDotfiles(
  plugin: CodeFilesPlugin,
  rootOverride?: string
): Promise<void> {
  const root = rootOverride ?? plugin.settings.projectRootFolder;
  if (!root) return;
  const allFolders = [root, ...(await collectSubfolderPaths(plugin, root))];
  for (const folder of allFolders) {
    const items = await scanDotEntries(plugin, folder);
    if (items.length === 0) continue;
    await revealItems(
      plugin,
      folder,
      items.map((i) => i.path)
    );
  }
}

/**
 * Unreveals all dotfiles and dot-folders found in the project root and its subfolders.
 * Called when the "Show Hidden Files" toggle is turned off.
 * @param plugin - The plugin instance
 * @param rootOverride - Optional path to unreveal instead of the configured project root
 */
export async function unrevealProjectDotfiles(
  plugin: CodeFilesPlugin,
  rootOverride?: string
): Promise<void> {
  const root = rootOverride ?? plugin.settings.projectRootFolder;
  if (!root) return;

  // Auto-managed files (registered extensions + isAutoRevealRegisteredDotfile)
  // are kept visible by Obsidian itself — never unreveal them
  const allFolders = [root, ...(await collectSubfolderPaths(plugin, root))];
  for (const folder of allFolders) {
    const items = await scanDotEntries(plugin, folder);
    if (items.length === 0) continue;

    const toUnreveal = filterManualDotEntries(items, plugin);
    if (toUnreveal.length === 0) continue;
    await unrevealItems(plugin, folder, toUnreveal.map((i) => i.path));
  }
}
