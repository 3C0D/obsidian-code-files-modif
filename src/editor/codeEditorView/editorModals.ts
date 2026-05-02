/**
 * Module for opening various modals in the code editor.
 * Provides functions to launch configuration, theme picker, and rename extension dialogs.
 */
import type { TFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import type { CodeEditorInstance } from '../../types/index.ts';
import { EditorSettingsModal } from '../../modals/editorSettingsModal.ts';
import { ChooseThemeModal } from '../../modals/chooseThemeModal.ts';
import { RenameExtensionModal } from '../../modals/renameExtensionModal.ts';
import { broadcastOptions } from '../../utils/broadcast.ts';
import { resolveThemeParams } from '../../utils/themeUtils.ts';

/** Opens the editor settings modal. */
export function openEditorConfig(
	plugin: CodeFilesPlugin,
	codeEditor: CodeEditorInstance | undefined,
	ext: string
): void {
	new EditorSettingsModal(
		plugin,
		ext,
		() => broadcastOptions(plugin),
		(config) => {
			codeEditor?.send('change-editor-config', { config });
		},
		() => codeEditor?.send('focus', {})
	).open();
}

/** Opens the theme picker modal. */
export function openThemePicker(
	plugin: CodeFilesPlugin,
	codeEditor: CodeEditorInstance | undefined
): void {
	const applyTheme = async (theme: string): Promise<void> => {
		const params = await resolveThemeParams(plugin, theme);
		codeEditor?.send('change-theme', params);
	};
	new ChooseThemeModal(plugin, applyTheme, () => codeEditor?.send('focus', {})).open();
}

/** Opens the rename extension modal for the current file. */
export function openRenameExtension(
	plugin: CodeFilesPlugin,
	codeEditor: CodeEditorInstance | undefined,
	file: TFile
): void {
	const targetFile = plugin.app.vault.getFileByPath(file.path);
	if (!targetFile) return;
	new RenameExtensionModal(plugin, targetFile, () =>
		setTimeout(() => codeEditor?.send('focus', {}), 50)
	).open();
}
