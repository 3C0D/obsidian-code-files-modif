// https://github.com/microsoft/monaco-editor/issues/1288

import type { TFile, WorkspaceLeaf } from 'obsidian';
import { TextFileView } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';
import { getLanguage } from './getLanguage.ts';
import { viewType } from './types.ts';

/** View class that wraps a Monaco Editor instance in an Obsidian TextFileView, allowing us to leverage Obsidian's file handling and workspace management while providing a powerful code editing experience. */
export class CodeEditorView extends TextFileView {
	codeEditor: ReturnType<typeof mountCodeEditor>;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CodeFilesPlugin
	) {
		super(leaf);
	}

	getDisplayText(): string {
		return this.file?.name ?? 'Code Editor';
	}

	getViewType(): string {
		return viewType;
	}

	/**	Context is used for language detection and is derived from the file path. For non-file views, it falls back to the last loaded file's path or an empty string. */
	getContext(file?: TFile): string {
		return file?.path ?? this.file?.path ?? '';
	}

	async onClose(): Promise<void> {
		await super.onClose();
		this.codeEditor.destroy();
	}

	/** When a file is loaded into the view, we initialize the Monaco Editor with the file's content and set up a callback to save changes. We also ensure the editor fills the view and handle cleanup when the view is closed. */
	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);

		this.codeEditor = mountCodeEditor(
			this.plugin,
			getLanguage(file.extension),
			this.data,
			this.getContext(file),
			() => this.requestSave()
		);

		this.contentEl.style.overflow = 'hidden';
		this.contentEl.append(this.codeEditor.iframe);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
		this.codeEditor.destroy();
	}

	clear(): void {
		this.codeEditor.clear();
	}

	getViewData(): string {
		return this.codeEditor.getValue();
	}

	/** Called by Obsidian when the file content is ready to be displayed. Syncs the inherited `data` property and the Monaco editor instance. */
	setViewData(data: string, clear: boolean): void {
		this.data = data;
		this.codeEditor?.setValue(data);
	}

	/** Static helper method to open a file in a new CodeEditorView. This abstracts away the details of creating the view and loading the file, providing a simple interface for other parts of the plugin to open files in the code editor. */
	static openFile(file: TFile, plugin: CodeFilesPlugin): void {
		const leaf = plugin.app.workspace.getLeaf(true);
		const view = new CodeEditorView(leaf, plugin);
		view.file = file;
		view.onLoadFile(file);
		leaf.open(view);
		view.load();
		plugin.app.workspace.revealLeaf(leaf);
	}
}
