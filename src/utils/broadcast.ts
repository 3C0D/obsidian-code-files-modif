import type CodeFilesPlugin from '../main.ts';
import { CodeEditorView } from '../editor/codeEditorView.ts';
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

/**
 * Loads all TypeScript/JavaScript files from the
 * project root folder and broadcasts them to all
 * open Monaco editors.
 *
 * Why load file contents?
 * Monaco's TypeScript language service needs the actual
 * source code to provide IntelliSense (autocomplete,
 * type checking) and enable cross-file navigation
 * (Ctrl+Click on imports). The content is added as
 * "extra libraries" to Monaco's TypeScript compiler,
 * allowing it to resolve imports and show definitions
 * from other files in the project.
 *
 * How it works:
 * 1. Reads all .ts/.tsx/.js/.jsx files from projectRootFolder
 * 2. Sends {path, content} pairs to each Monaco iframe
 * 3. Monaco calls addExtraLib() and createModel() to register
 *    the files with its TypeScript language service
 */
export async function broadcastProjectFiles(plugin: CodeFilesPlugin): Promise<void> {
	const root = plugin.settings.projectRootFolder;
	if (!root) return;
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
			/* skip */
		}
	}
	for (const leaf of plugin.app.workspace.getLeavesOfType('code-editor')) {
		if (leaf.view instanceof CodeEditorView && leaf.view.editor) {
			leaf.view.editor.send('load-project-files', { files });
		}
	}
}
