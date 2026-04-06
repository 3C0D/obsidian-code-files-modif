import type CodeFilesPlugin from '../main.ts';
import { getCodeEditorViews } from './extensionUtils.ts';
import { buildMergedConfig } from './settingsUtils.ts';

/**
 * Sends updated validation options to all open
 * Monaco iframes.
 * Called after toggling semantic/syntax validation
 * in settings — the iframes are independent JS
 * contexts and don't share state, so each must
 * be notified individually.
 */
export function broadcastOptions(plugin: CodeFilesPlugin): void {
	for (const view of getCodeEditorViews(plugin.app)) {
		view.codeEditor?.send('change-options', {
			noSemanticValidation: !plugin.settings.semanticValidation,
			noSyntaxValidation: !plugin.settings.syntaxValidation
		});
	}
}

/**
 * Applies a CSS brightness filter on each iframe.
 * Monaco runs in an isolated iframe so Obsidian's
 * theme variables don't reach it — a CSS filter
 * on the iframe itself is the only way to
 * dim/brighten the editor.
 */
export function broadcastBrightness(plugin: CodeFilesPlugin): void {
	for (const view of getCodeEditorViews(plugin.app)) {
		if (view.codeEditor?.iframe) {
			view.codeEditor.iframe.style.filter = `brightness(${plugin.settings.editorBrightness})`;
		}
	}
}

/**
 * Sends the merged editor config (global `'*'`
 * + per-extension override) to open iframes.
 * When `ext` is `'*'`, all open views are updated
 * because a global change affects every extension.
 * Otherwise only views whose file extension matches
 * are targeted.
 */
export function broadcastEditorConfig(plugin: CodeFilesPlugin, ext: string): void {
	const views = getCodeEditorViews(plugin.app);
	const targets = ext === '*' ? views : views.filter((v) => v.file?.extension === ext);
	for (const view of targets) {
		const fileExt = view.file?.extension ?? '';
		const config = buildMergedConfig(plugin, fileExt);
		view.codeEditor?.send('change-editor-config', { config });
	}
}
