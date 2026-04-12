/**
 * Registers all plugin commands with Obsidian.
 * Commands include: create code file, open code block in Monaco, open current file in Monaco,
 * edit CSS snippet, rename extension, open editor settings, and open hidden files.
 */
import type CodeFilesPlugin from '../main.ts';
import { CodeEditorView } from '../editor/codeEditorView.ts';
import { CreateCodeFileModal } from '../modals/createCodeFileModal.ts';
import { FenceEditModal } from '../modals/fenceEditModal.ts';
import { FenceEditContext } from '../utils/fenceEditContext.ts';
import { ChooseCssFileModal } from '../modals/chooseCssFileModal.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import { EditorSettingsModal } from '../modals/editorSettingsModal.ts';
import { ChooseHiddenFileModal } from '../modals/chooseHiddenFileModal.ts';
import { broadcastOptions, broadcastEditorConfig } from '../utils/broadcast.ts';

export function registerCommands(plugin: CodeFilesPlugin): void {
	plugin.addCommand({
		id: 'create',
		name: 'Create new Code File',
		callback: () => {
			new CreateCodeFileModal(plugin).open();
		}
	});

	plugin.addCommand({
		id: 'open-codeblock-in-monaco',
		name: 'Open current code block in Monaco Editor',
		editorCheckCallback: (checking, editor) => {
			if (!FenceEditContext.create(plugin, editor)) return false;
			if (!checking) FenceEditModal.openOnCurrentCode(plugin, editor);
			return true;
		}
	});

	plugin.addCommand({
		id: 'open-current-file-in-monaco',
		name: 'Open current file in Monaco Editor',
		editorCheckCallback: (checking, _editor, ctx) => {
			if (!ctx.file) return false;
			if (!checking) void CodeEditorView.openFile(ctx.file, plugin);
			return true;
		}
	});

	plugin.addCommand({
		id: 'open-css-snippet',
		name: 'Edit CSS Snippet',
		callback: () =>
			new ChooseCssFileModal(plugin, plugin.app.customCss.snippets).open()
	});

	plugin.addCommand({
		id: 'rename-extension',
		name: 'Rename extension of current file',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;
			if (!checking) new RenameExtensionModal(plugin, file).open();
			return true;
		}
	});

	plugin.addCommand({
		id: 'editor-config',
		name: 'Open editor settings',
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(CodeEditorView);
			if (!view?.file) return false;
			if (!checking) {
				// onConfigApplied broadcasts to
				// all matching iframes because
				// the palette isn't tied to one.
				new EditorSettingsModal(
					plugin,
					view.file.extension,
					() => broadcastOptions(plugin),
					() => broadcastEditorConfig(plugin, view.file!.extension)
				).open();
			}
			return true;
		}
	});

	plugin.addCommand({
		id: 'open-hidden-files-vault',
		name: 'Open Hidden Files in Vault',
		callback: () => {
			new ChooseHiddenFileModal(plugin).open();
		}
	});
}
