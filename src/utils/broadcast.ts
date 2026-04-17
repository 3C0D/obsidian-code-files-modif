/**
 * Broadcasts settings changes to all open Monaco Editor instances via postMessage.
 * Each function targets specific settings:
 * - broadcastOptions: semantic/syntax validation toggles
 * - broadcastBrightness: CSS filter on iframe elements
 * - broadcastEditorConfig: merged editor config (tabSize, formatOnSave, etc.)
 * - broadcastProjectFiles: loads TS/JS files from project root for IntelliSense and cross-file navigation
 */
import type CodeFilesPlugin from '../main.ts';
import { getCodeEditorViews } from './extensionUtils.ts';
import { buildMergedConfig } from './settingsUtils.ts';
import { getEmptyFileExtension } from './fileUtils.ts';
import { staticMap } from './getLanguage.ts';

/**
 * Sends a postMessage to each open Monaco iframe
 * to update validation options.
 * Called after toggling semantic/syntax validation
 * in settings — each iframe receives the message
 * and updates its internal Monaco configuration.
 */
export function broadcastOptions(plugin: CodeFilesPlugin): void {
	for (const view of getCodeEditorViews(plugin.app)) {
		view.editor?.send('change-options', {
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
		if (view.editor?.iframe) {
			view.editor.iframe.style.filter = `brightness(${plugin.settings.editorBrightness})`;
		}
	}
}

/**
 * Sends the merged editor config (global `'*'`
 * + language fallback + per-extension override) to open iframes.
 *
 * When `ext` is `'*'`, all open views are updated
 * because a global change affects every extension.
 *
 * Otherwise, targets views whose file extension matches `ext`
 * OR whose file extension maps to `ext` as a language.
 * Example: changing 'yaml' config broadcasts to both:
 * - Files with extension 'yaml'
 * - Files with extension 'clangformat' (which maps to yaml language)
 */
export function broadcastEditorConfig(plugin: CodeFilesPlugin, ext: string): void {
	const views = getCodeEditorViews(plugin.app);
	const targets =
		ext === '*'
			? views
			: views.filter((v) => {
					if (!v.file) return false;
					const fileExt = getEmptyFileExtension(v.file);
					// Match if extension is exactly ext
					if (fileExt === ext) return true;
					// Match if extension maps to ext as a language
					const language = staticMap[fileExt] ?? 'plaintext';
					return language === ext;
				});
	for (const view of targets) {
		const fileExt = view.file ? getEmptyFileExtension(view.file) : '';
		const config = buildMergedConfig(plugin, fileExt);
		view.editor?.send('change-editor-config', { config });
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
 * 4. If no project root is set, sends an empty array to clear
 *    previously loaded files
 */
export async function broadcastProjectFiles(plugin: CodeFilesPlugin): Promise<void> {
	const root = plugin.settings.projectRootFolder;
	const files: { path: string; content: string }[] = [];
	if (root) {
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
	}
	for (const view of getCodeEditorViews(plugin.app)) {
		view.editor?.send('load-project-files', { files });
	}
}
