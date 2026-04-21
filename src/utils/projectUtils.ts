/**
 * Defines a project folder used to establish communication between files in this folder.
 */
import type CodeFilesPlugin from '../main.ts';

/**
 * Reads all TypeScript/JavaScript files from the project root folder.
 * Used to provide IntelliSense (autocomplete, type checking) and cross-file navigation
 * in Monaco editors.
 *
 * @param plugin - The plugin instance
 * @returns Array of { path, content } objects for all JS/TS files in the project root
 */
export async function readProjectFiles(
	plugin: CodeFilesPlugin
): Promise<{ path: string; content: string }[]> {
	const root = plugin.settings.projectRootFolder;
	if (!root) return [];

	const files: { path: string; content: string }[] = [];
	for (const file of plugin.app.vault.getFiles()) {
		if (!file.path.startsWith(root + '/')) continue;
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
