import type CodeFilesPlugin from './main.ts';
import { CodeEditorView } from './codeEditorView.ts';
import { CreateCodeFileModal } from './createCodeFileModal.ts';
import { FenceEditModal } from './fenceEditModal.ts';
import { FenceEditContext } from './fenceEditContext.ts';
import { ChooseCssFileModal } from './chooseCssFileModal.ts';
import { RenameExtensionModal } from './renameExtensionModal.ts';
import { EditorSettingsModal } from './editorSettingsModal.ts';

export function registerCommands(plugin: CodeFilesPlugin): void {
	plugin.addCommand({
		id: 'create',
		name: 'Create new Code File',
		callback: () => {
			(document.activeElement as HTMLElement)?.blur();
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
			if (!checking) CodeEditorView.openFile(ctx.file, plugin);
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
		id: 'formatter-config',
		name: 'Edit formatter config for current file',
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(CodeEditorView);
			if (!view?.file) return false;
			if (!checking) {
				(document.activeElement as HTMLElement)?.blur();
				new EditorSettingsModal(
					plugin,
					view.file.extension,
					() => plugin.broadcastOptions(),
					() => plugin.broadcastEditorConfig(view.file!.extension)
				).open();
			}
			return true;
		}
	});
}
