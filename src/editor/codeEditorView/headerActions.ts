import type { TFile } from 'obsidian';
import type { HeaderActionsContext } from '../../types/types.ts';
import { ChooseThemeModal } from '../../modals/chooseThemeModal.ts';
import { EditorSettingsModal } from '../../modals/editorSettingsModal.ts';

import { normalizePath } from 'obsidian';
import {
	snippetExists,
	isSnippetEnabled,
	registerSnippetChangeHandler
} from '../../utils/snippetUtils.ts';
import { broadcastOptions } from '../../utils/broadcast.ts';
import { getActiveExtensions } from '../../utils/extensionUtils.ts';
import { DIFF_BUTTON_DISPLAY_DURATION } from '../../types/variables.ts';
import { getExtension } from '../../utils/fileUtils.ts';
import { resolveThemeParams } from '../mountCodeEditor.ts';

/**
 * Removes all header actions from the view.
 */
export function removeHeaderActions(context: HeaderActionsContext): void {
	context.gearAction?.remove();
	context.themeAction?.remove();
	context.snippetFolderAction?.remove();
	context.snippetToggleAction?.remove();
	context.returnAction?.remove();
	context.diffAction?.remove();
}

/**
 * Shows the diff action in the header for x seconds after a format
 */
export function showDiffAction(context: HeaderActionsContext): void {
	if (context.diffTimer) clearTimeout(context.diffTimer);
	context.diffAction?.remove();

	context.diffAction = context.addAction('diff', 'Show Format Diff', () => {
		context.codeEditor?.send('trigger-show-diff', {});
	});
	// Flash the diff icon to draw attention to it
	context.diffAction.addClass('code-files-diff-action');

	// Hide the diff action after x seconds
	context.diffTimer = setTimeout(() => {
		context.diffAction?.remove();
		context.diffAction = null;
	}, DIFF_BUTTON_DISPLAY_DURATION);
}

/**
 * Hides the diff action immediately (called when all blocks are reverted)
 */
export function hideDiffAction(context: HeaderActionsContext): void {
	if (context.diffTimer) clearTimeout(context.diffTimer);
	context.diffAction?.remove();
	context.diffAction = null;
	context.diffTimer = null;
}

/**
 * Adds header actions: theme picker, editor settings, return to default view (only for unregistered extensions), and snippet controls (only for CSS snippets).
 */
export function injectHeaderActions(context: HeaderActionsContext, file: TFile): void {
	removeHeaderActions(context);

	context.themeAction = context.addAction('palette', 'Change Theme', () => {
		const applyTheme = async (theme: string): Promise<void> => {
			const params = await resolveThemeParams(context.plugin, theme);
			context.codeEditor?.send('change-theme', params);
		};
		new ChooseThemeModal(context.plugin, applyTheme, () =>
			context.codeEditor?.send('focus', {})
		).open();
	});

	const ext = getExtension(file.name);
	context.gearAction = context.addAction('settings', 'Editor Settings', () => {
		new EditorSettingsModal(
			context.plugin,
			ext,
			() => broadcastOptions(context.plugin),
			(config) => {
				context.codeEditor?.send('change-editor-config', { config });
			},
			() => context.codeEditor?.send('focus', {})
		).open();
	});

	// Add return-to-default-view (normal obsidian view) action ONLY when the extension is not registered
	const isUnregistered = !getActiveExtensions(context.plugin.settings).includes(ext);
	if (isUnregistered) {
		context.returnAction = context.addAction(
			'undo-2',
			'Return to default view',
			async () => {
				await context.leaf.setViewState({ type: 'empty', state: {} });
				await context.leaf.openFile(file);
			}
		);
	}

	// Add snippet controls ONLY when editing a CSS snippet file
	// Added LAST so they appear on the LEFT
	const configDir = context.plugin.app.vault.configDir;
	const isSnippetFile =
		file.path.startsWith(`${configDir}/snippets`) &&
		getExtension(file.name) === 'css';
	if (isSnippetFile) {
		const snippetName = file.basename;
		const exists = snippetExists(context.plugin.app, snippetName);

		context.snippetFolderAction = context.addAction(
			'folder',
			'Open snippets folder',
			() => {
				context.plugin.app.openWithDefaultApp(
					normalizePath(`${context.plugin.app.vault.configDir}/snippets`)
				);
			}
		);

		const isOn = exists && isSnippetEnabled(context.plugin.app, snippetName);
		const toggleEl = context.addAction(
			'square',
			`${isOn ? 'Disable' : 'Enable'} ${snippetName}.css snippet`,
			async () => {
				// If the file doesn't exist yet (new unsaved snippet), save first
				if (!snippetExists(context.plugin.app, snippetName)) {
					context.onForceSave();
				}
				const newState = !isSnippetEnabled(context.plugin.app, snippetName);
				context.plugin.app.customCss.setCssEnabledStatus(snippetName, newState);
				track.toggleClass('is-on', newState);
				toggleEl.setAttr(
					'aria-label',
					`${newState ? 'Disable' : 'Enable'} ${snippetName}.css snippet`
				);
			}
		);
		// Replace the default Obsidian action button with a custom CSS toggle switch
		toggleEl.empty();
		toggleEl.addClass('code-files-snippet-toggle-action');
		// The toggle consists of a track (the background) and a thumb (the circle that moves). The "is-on" class controls the toggle state (on/off).
		const track = toggleEl.createDiv({ cls: 'code-files-toggle-track' });
		if (isOn) track.addClass('is-on');
		track.createDiv({ cls: 'code-files-toggle-thumb' });
		context.snippetToggleAction = toggleEl;

		if (exists) {
			// Listen for external snippet state changes (from Obsidian settings).
			// This reassigns the handler after it was nulled during previous cleanup() (e.g. on rename).
			context.unregisterSnippetHandler = registerSnippetChangeHandler(
				context.plugin.app,
				snippetName,
				(isOn) => {
					track.toggleClass('is-on', isOn);
					toggleEl.setAttr(
						'aria-label',
						`${isOn ? 'Disable' : 'Enable'} ${snippetName}.css snippet`
					);
				}
			);
		}
	}
}
