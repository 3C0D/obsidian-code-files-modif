/**
 * Utilities for managing Obsidian vault configuration settings.
 * Handles vault-level settings like "Detect all file extensions".
 */
import type CodeFilesPlugin from '../main.ts';
import type { ConfigItem } from 'obsidian-typings';
import { Notice } from 'obsidian';

/**
 * Ensures "Detect all file extensions" is enabled in Obsidian settings.
 * Required to see and open dotfiles (.env, etc.) in the Monaco editor.
 *
 * @param plugin - The plugin instance
 * @returns `true` if the setting was just enabled (caller should show a notice), `false` if already enabled
 */
export function ensureDetectAllExtensions(plugin: CodeFilesPlugin): boolean {
	const vault = plugin.app.vault;
	if (!vault.getConfig('showUnsupportedFiles' as ConfigItem)) {
		vault.setConfig('showUnsupportedFiles' as ConfigItem, true);
		return true;
	}
	return false;
}

/**
 * Shows a notice to inform the user that "Detect all file extensions" was enabled.
 * Called from onLayoutReady if ensureDetectAllExtensions returned true.
 */
export function showDetectAllExtensionsNotice(): void {
	new Notice(
		'Code Files: "Detect all file extensions" enabled in Obsidian settings. Required to see and open dotfiles (.env, etc.) in the Monaco editor.',
		6000
	);
}
