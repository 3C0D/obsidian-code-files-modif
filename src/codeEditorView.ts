import type { TFile, WorkspaceLeaf } from 'obsidian';
import { TextFileView } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { mountCodeEditor, resolveThemeParams } from './mountCodeEditor.ts';
import { getLanguage } from './getLanguage.ts';
import { viewType, type CodeEditorInstance } from './types.ts';
import { EditorSettingsModal } from './editorSettingsModal.ts';
import { ChooseThemeModal } from './chooseThemeModal.ts';
import { RenameExtensionModal } from './renameExtensionModal.ts';

/** View class that wraps a Monaco Editor instance in an Obsidian TextFileView, allowing us to leverage Obsidian's file handling and workspace management while providing a powerful code editing experience. */
export class CodeEditorView extends TextFileView {
	codeEditor!: CodeEditorInstance;
	private isDirty = false;
	private forceSave = false;
	private gearAction: { remove: () => void } | null = null;
	private themeAction: { remove: () => void } | null = null;
	private renameAction: { remove: () => void } | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CodeFilesPlugin
	) {
		super(leaf);
		const originalRequestSave = this.requestSave;
		this.requestSave = () => {
			if (this.plugin.settings.autoSave) {
				originalRequestSave.call(this);
			}
		};
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

	async save(clear?: boolean): Promise<void> {
		if (!this.plugin.settings.autoSave && !this.forceSave) return;
		this.forceSave = false;
		await super.save(clear);
	}

	private cleanup(): void {
		this.codeEditor?.destroy();
		this.gearAction?.remove();
		this.themeAction?.remove();
		this.renameAction?.remove();
		this.gearAction = null;
		this.themeAction = null;
		this.renameAction = null;
	}

	async onClose(): Promise<void> {
		await super.onClose();
		this.cleanup();
	}

	private setDirty(isDirtyBadge: boolean): void {
		this.isDirty = isDirtyBadge;
		const badge = this.containerEl.querySelector('.code-files-dirty-badge');
		if (!badge) return;
		badge.toggleClass('code-files-dirty-unsaved', isDirtyBadge);
	}

	private setSaving(isSaving: boolean): void {
		const badge = this.containerEl.querySelector('.code-files-dirty-badge');
		if (!badge) return;
		badge.toggleClass('code-files-dirty-saving', isSaving);
	}

	private updateExtBadge(file: TFile): void {
		const titleContainer = this.containerEl.querySelector(
			'.view-header-title-container'
		);
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
		this.themeAction?.remove();
		this.renameAction?.remove();

		this.renameAction = this.addAction('pencil', 'Rename Extension', () => {
			(document.activeElement as HTMLElement)?.blur();
			new RenameExtensionModal(this.plugin, file).open();
		});

		this.themeAction = this.addAction('palette', 'Change Theme', () => {
			(document.activeElement as HTMLElement)?.blur();
			const applyTheme = async (theme: string): Promise<void> => {
				const params = await resolveThemeParams(this.plugin, theme);
				this.codeEditor?.send('change-theme', params);
			};
			new ChooseThemeModal(this.plugin, applyTheme, applyTheme).open();
		});

		this.gearAction = this.addAction('settings', 'Editor Settings', () => {
			(document.activeElement as HTMLElement)?.blur();
			new EditorSettingsModal(
				this.plugin,
				file.extension,
				() => this.plugin.broadcastOptions(),
				(config) => {
					this.codeEditor?.send('change-formatter-config', { config });
				}
			).open();
		});
	}

	private async mountEditor(file: TFile): Promise<void> {
		this.codeEditor = await mountCodeEditor(
			this.plugin,
			getLanguage(file.extension),
			this.data,
			this.getContext(file),
			() => {
				this.setDirty(true);
				this.requestSave();
			},
			() => {
				this.forceSave = true;
				this.setSaving(true);
				void this.save().then(() => {
					this.setDirty(false);
					this.setSaving(false);
				});
			}
		);
	}

	/** When a file is loaded into the view, we initialize the Monaco Editor with the file's content and set up a callback to save changes. We also ensure the editor fills the view and handle cleanup when the view is closed. */
	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		await this.mountEditor(file);
		this.contentEl.style.overflow = 'hidden';
		this.contentEl.append(this.codeEditor.iframe);
		this.updateExtBadge(file);
		this.injectGearIcon(file);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
		this.cleanup();
	}

	clear(): void {
		this.codeEditor?.clear();
	}

	async onRename(file: TFile): Promise<void> {
		super.onRename(file);
		this.codeEditor?.destroy();
		this.contentEl.empty();
		await this.mountEditor(file);
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
