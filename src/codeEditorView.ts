// https://github.com/microsoft/monaco-editor/issues/1288

import type { TFile, WorkspaceLeaf } from 'obsidian';
import { TextFileView } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';
import { getLanguage } from './getLanguage.ts';
import { viewType } from './types.ts';

export class CodeEditorView extends TextFileView {
	static i = 0;

	id = CodeEditorView.i++;

	codeEditor: ReturnType<typeof mountCodeEditor>;

	initialValue: string;

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

	getContext(file?: TFile): string {
		return file?.path ?? this.file?.path ?? '';
	}

	async onClose(): Promise<void> {
		await super.onClose();
		this.codeEditor.destroy();
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);

		this.codeEditor = mountCodeEditor(
			this.plugin,
			getLanguage(file.extension),
			this.initialValue,
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

	async onOpen(): Promise<void> {
		await super.onOpen();
	}

	clear(): void {
		this.codeEditor.clear();
	}

	getViewData(): string {
		return this.codeEditor.getValue();
	}

	setViewData(data: string): void {
		this.initialValue = data;
		this.codeEditor?.setValue(data);
	}

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
