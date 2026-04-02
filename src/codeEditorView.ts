// https://github.com/microsoft/monaco-editor/issues/1288

import type { TFile, WorkspaceLeaf } from 'obsidian';
import { TextFileView } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';
import { getLanguage } from './getLanguage.ts';
import { viewType, type CodeEditorInstance } from './types.ts';
import { EditorSettingsModal } from './editorSettingsModal.ts';

/** View class that wraps a Monaco Editor instance in an Obsidian TextFileView, allowing us to leverage Obsidian's file handling and workspace management while providing a powerful code editing experience. */
export class CodeEditorView extends TextFileView {
	codeEditor: CodeEditorInstance;
	private dirty = false;
	private forceSave = false;
	private gearAction: { remove: () => void } | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CodeFilesPlugin
	) {
		super(leaf);
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Code Editor';
	}

	getViewType(): string {
		return viewType;
	}

	/**	Context is used for language detection and is derived from the file path. For non-file views, it falls back to the last loaded file's path or an empty string. */
	getContext(file?: TFile): string {
		return file?.path ?? this.file?.path ?? '';
	}

	/** Block Obsidian's auto-save debounce when autoSave is disabled. */
	requestSave(): void {
		if (this.plugin.settings.autoSave) {
			super.requestSave();
		}
	}

	async save(clear?: boolean): Promise<void> {
		if (!this.plugin.settings.autoSave && !this.forceSave) return;
		this.forceSave = false;
		await super.save(clear);
	}

	async onClose(): Promise<void> {
		await super.onClose();
		this.codeEditor?.destroy();
		this.gearAction?.remove();
	}

	private setDirty(isDirty: boolean): void {
		this.dirty = isDirty;
		const badge = this.containerEl.querySelector('.code-files-dirty-badge');
		if (!badge) return;
		badge.toggleClass('code-files-dirty-unsaved', isDirty);
	}

	private setSaving(isSaving: boolean): void {
		const badge = this.containerEl.querySelector('.code-files-dirty-badge');
		if (!badge) return;
		badge.toggleClass('code-files-dirty-saving', isSaving);
	}

	private updateExtBadge(file: TFile): void {
		const titleContainer = this.containerEl.querySelector('.view-header-title-container');
		if (!titleContainer) return;
		titleContainer.querySelector('.code-files-ext-badge')?.remove();
		titleContainer.querySelector('.code-files-dirty-badge')?.remove();
		const badge = createEl('span', {
			text: `.${file.extension}`,
			cls: 'code-files-ext-badge'
		});
		titleContainer.appendChild(badge);
		if (!this.plugin.settings.autoSave) {
			const dirtyBadge = createEl('span', { cls: 'code-files-dirty-badge' });
			titleContainer.appendChild(dirtyBadge);
		}
	}

	private injectGearIcon(file: TFile): void {
		this.gearAction?.remove();
		this.gearAction = this.addAction('settings', 'Editor Settings', () => {
			(document.activeElement as HTMLElement)?.blur();
			const modal = new EditorSettingsModal(
				this.plugin,
				file.extension,
				() => this.plugin.broadcastOptions(),
				(config) => {
					this.codeEditor?.send('change-formatter-config', { config });
				}
			);
			const origOnClose = modal.onClose.bind(modal);
			modal.onClose = () => { origOnClose(); };
			modal.open();
		});
	}

	/** When a file is loaded into the view, we initialize the Monaco Editor with the file's content and set up a callback to save changes. We also ensure the editor fills the view and handle cleanup when the view is closed. */
	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			getLanguage(file.extension),
			this.data,
			this.getContext(file),
			() => {
				// onChange: mark dirty, trigger auto-save if enabled
				this.setDirty(true);
				this.requestSave();
			},
			() => {
				// onSave (Ctrl+S): force save and clear dirty
				this.forceSave = true;
				this.setSaving(true);
				void this.save().then(() => {
					this.setDirty(false);
					this.setSaving(false);
				});
			}
		);

		this.contentEl.style.overflow = 'hidden';
		this.contentEl.append(this.codeEditor.iframe);
		this.updateExtBadge(file);
		this.injectGearIcon(file);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
		// destroy() removes the message listener and revokes the blob URL
		this.codeEditor?.destroy();
		this.gearAction?.remove();
		this.gearAction = null;
	}

	clear(): void {
		this.codeEditor?.clear();
	}

	async onRename(file: TFile): Promise<void> {
		super.onRename(file);
		// When the file is renamed (e.g. extension changed), Obsidian updates the TFile
		// but does not automatically reload the view's inner content. We must manually
		// destroy the old Monaco iframe and mount a new one so it picks up the new syntax
		// highlighting and updates its internal codeContext message router.
		this.codeEditor?.destroy();
		this.contentEl.empty();

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			getLanguage(file.extension),
			this.data,
			this.getContext(file),
			() => { this.setDirty(true); this.requestSave(); },
			() => { this.forceSave = true; this.setSaving(true); void this.save().then(() => { this.setDirty(false); this.setSaving(false); }); }
		);
		this.contentEl.append(this.codeEditor.iframe);
		this.updateExtBadge(file);
		this.injectGearIcon(file);
	}

	getViewData(): string {
		return this.codeEditor.getValue();
	}

	/** Called by Obsidian when the file content is ready to be displayed. Syncs the inherited `data` property and the Monaco editor instance.
	 *  The optional chaining on codeEditor handles the case where setViewData is called before onLoadFile completes. */
	setViewData(data: string, clear: boolean): void {
		this.data = data;
		if (this.codeEditor) {
			// Protect Monaco's undo/redo history!
			// Only update if the disk data actually differs from the editor's current state.
			if (this.codeEditor.getValue() !== data) {
				this.codeEditor.setValue(data);
			}
		}
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
