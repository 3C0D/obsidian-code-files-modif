/**
 * Module for managing header actions in the code editor view.
 * Provides functions to add, remove, and manage various header buttons like theme picker, settings, diff display, and snippet controls.
 */
import { normalizePath, type TFile, Platform } from 'obsidian';
import type { HeaderActionsContext } from '../../types/index.ts';
import {
	snippetExists,
	isSnippetEnabled,
	registerSnippetChangeHandler
} from '../../utils/snippetUtils.ts';
import { getActiveExtensions } from '../../utils/extensionUtils.ts';
import { DIFF_BUTTON_DISPLAY_DURATION } from '../../types/index.ts';
import { getExtension } from '../../utils/fileUtils.ts';

/**
 * Removes all header actions from the view.
 */
export function removeHeaderActions(context: HeaderActionsContext): void {
	context.gearAction?.remove();
	context.themeAction?.remove();
	context.snippetFolderAction?.remove();
	context.snippetToggleAction?.remove();
	context.returnAction?.remove();
	hideDiffAction(context);
	context.unregisterSnippetHandler?.();
	context.unregisterSnippetHandler = null;
	context.gearAction = null;
	context.themeAction = null;
	context.snippetFolderAction = null;
	context.snippetToggleAction = null;
	context.returnAction = null;
}

/**
 * Shows the diff action in the header for x seconds after a format.
 *
 * @param context The header actions context providing access to the editor and action management methods.
 * Writes diffAction and diffTimer back onto context. The caller must sync these to the
 * class instance via updateFromContext() — context is a plain object copy, not a live reference.
 */
export function showDiffAction(context: HeaderActionsContext): void {
	hideDiffAction(context);

	context.diffAction = context.addAction('diff', 'Show Format Diff', () => {
		// on click
		context.codeEditor?.send('trigger-show-diff', {});
	});

	// Add tooltip
	context.diffAction.setAttr('title', 'Also available in Monaco context menu');

	// Flash the diff icon to draw attention to it
	context.diffAction.addClass('code-files-diff-action');

	// Hide the diff action after x seconds
	context.diffTimer = setTimeout(
		() => hideDiffAction(context),
		DIFF_BUTTON_DISPLAY_DURATION
	);
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

	// Add theme picker action
	context.themeAction = context.addAction('palette', 'Change Theme', () => {
		context.onOpenThemePicker();
	});

	// Add editor settings action
	const ext = getExtension(file.name);
	context.gearAction = context.addAction('settings', 'Editor Settings', () => {
		context.onOpenEditorConfig(ext);
	});

	// Add return-to-default-view (normal obsidian view) action ONLY when the extension is not registered AND noReturnAction is false
	const isUnregistered = !getActiveExtensions(context.plugin.settings).includes(ext);
	if (isUnregistered && !context.noReturnAction) {
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
	const isSnippetFile = file.path.startsWith(`${configDir}/snippets`) && ext === 'css';

	if (isSnippetFile) {
		const snippetName = file.basename;
		const exists = snippetExists(context.plugin.app, snippetName);

		if (Platform.isDesktop) {
			context.snippetFolderAction = context.addAction(
				'folder',
				'Open snippets folder',
				() => {
					context.plugin.app.openWithDefaultApp(
						normalizePath(`${configDir}/snippets`)
					);
				}
			);
		}

		// Toggle is always shown even if the snippet isn't indexed yet by Obsidian (exists = false).
		// In that case isOn = false and no change handler is registered until next file load.
		const isOn = exists && isSnippetEnabled(context.plugin.app, snippetName);
		const toggleEl = context.addAction(
			'square',
			`${isOn ? 'Disable' : 'Enable'} ${snippetName}.css snippet`,
			async () => {
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
