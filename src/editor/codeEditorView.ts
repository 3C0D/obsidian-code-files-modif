import type { TFile, WorkspaceLeaf } from 'obsidian';
import { TextFileView } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { mountCodeEditor, resolveThemeParams } from './mountCodeEditor.ts';
import { getLanguage } from '../utils/getLanguage.ts';
import { viewType, type CodeEditorInstance } from '../types.ts';
import { EditorSettingsModal } from '../modals/editorSettingsModal.ts';
import { ChooseThemeModal } from '../modals/chooseThemeModal.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';

/**
 * Wraps a Monaco editor iframe in an Obsidian
 * TextFileView, bridging Obsidian's file lifecycle
 * (load/save/rename/close) with the iframe's
 * postMessage-based API.
 */
export class CodeEditorView extends TextFileView {
	codeEditor!: CodeEditorInstance;
	private forceSave = false;
	private gearAction: { remove: () => void } | null = null;
	private themeAction: { remove: () => void } | null = null;
	private renameAction: { remove: () => void } | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: CodeFilesPlugin) {
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

	/**
	 * Overrides the parent save to enforce manual-save-only behavior when autoSave is disabled.
	 *
	 * Two conditions allow the save to proceed:
	 * - `autoSave` is enabled in settings (Obsidian's normal flow)
	 * - `forceSave` is true, set explicitly by the Ctrl+S handler in Monaco before calling this method
	 *
	 * `forceSave` is a private flag defined on the class. It is set to `true` by the Ctrl+S callback
	 * in `mountEditor`, which calls `this.save()` directly (bypassing `requestSave`'s debounce),
	 * then reset to `false` here after the save completes.
	 *
	 * @param clear - Forwarded to the parent: if true, marks the view as clean (non-dirty) after saving.
	 *                Never passed explicitly in this plugin (always undefined in practice) — the dirty
	 *                state is managed manually via `setDirty()` and `setSaving()`, which drive the
	 *                custom `.code-files-dirty-badge` element. Using `clear` here may be redundant
	 *                and could be simplified in the future.
	 */
	async save(clear?: boolean): Promise<void> {
		if (!this.plugin.settings.autoSave && !this.forceSave) return;
		await super.save(clear);
		this.forceSave = false;
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

	/** Clears the dirty badge (marks the view as saved). */
	clearDirty(): void {
		this.setDirty(false);
	}

	/** Updates the dirty badge styling to show/hide the unsaved indicator in the header. */
	private setDirty(isDirtyBadge: boolean): void {
		const badge = this.containerEl.querySelector('.code-files-dirty-badge');
		if (!badge) return;
		badge.toggleClass('code-files-dirty-unsaved', isDirtyBadge);
	}

	/** Updates the saving badge styling to show/hide the saving indicator in the header. */
	private setSaving(isSaving: boolean): void {
		const badge = this.containerEl.querySelector('.code-files-dirty-badge');
		if (!badge) return;
		badge.toggleClass('code-files-dirty-saving', isSaving);
	}

	/** Updates the header with the file extension badge and creates a dirty badge when autoSave is disabled. */
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

	/** Updates the dirty badge visibility based on autoSave setting. */
	public updateDirtyBadgeVisibility(): void {
		const titleContainer = this.containerEl.querySelector(
			'.view-header-title-container'
		);
		if (!titleContainer) return;
		const existingBadge = titleContainer.querySelector('.code-files-dirty-badge');
		if (this.plugin.settings.autoSave) {
			existingBadge?.remove();
		} else if (!existingBadge) {
			const dirtyBadge = createEl('span', { cls: 'code-files-dirty-badge' });
			titleContainer.appendChild(dirtyBadge);
		}
	}

	/** Adds three header actions: rename extension, change theme, and open editor settings. */
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
					this.codeEditor?.send('change-editor-config', { config });
				}
			).open();
		});
	}

	/** Creates the Monaco editor instance with callbacks for content changes (dirty + requestSave) and manual saves (Ctrl+S). */
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
		// For external files, leaf.open() doesn't trigger this automatically.
		// Reads the file content into this.data and calls setViewData().
		await super.onLoadFile(file);
		await this.mountEditor(file);
		this.contentEl.style.overflow = 'hidden';
		this.contentEl.append(this.codeEditor.iframe);
		this.updateExtBadge(file);
		this.injectGearIcon(file);
	}

	/** Cleans up Monaco when the file is unloaded from the view. */
	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
		this.cleanup();
	}

	clear(): void {
		this.codeEditor?.clear();
	}

	/** Rebuilds Monaco editor after the file is renamed (destroys old instance, mounts new one, updates badges). */
	async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
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
	setViewData(data: string, _clear: boolean): void {
		this.data = data;
		if (this.codeEditor) {
			// Protect Monaco's undo/redo history!
			// Only update if the disk data actually differs from the editor's current state.
			if (this.codeEditor.getValue() !== data) {
				this.codeEditor.setValue(data);
			}
		}
	}

	/**
	 * Opens a vault file in a new tab using Obsidian's
	 * standard leaf.openFile() API.
	 */
	static async openVaultFile(
		file: TFile,
		plugin: CodeFilesPlugin
	): Promise<void> {
		const leaf = plugin.app.workspace.getLeaf(true);
		await leaf.openFile(file);
		plugin.app.workspace.revealLeaf(leaf);
	}

	/**
	 * Opens a file that is outside the vault (e.g. CSS
	 * snippets in .obsidian/snippets/) by reading it
	 * directly via the adapter and mounting a view manually.
	 *
	 * This bypasses Obsidian's file registry intentionally —
	 * vault.create() cannot index files outside the vault
	 * root, but adapter.read() can access them.
	 */
	static openExternalFile(
		file: TFile,
		plugin: CodeFilesPlugin
	): void {
		const leaf = plugin.app.workspace.getLeaf(true);
		const view = new CodeEditorView(leaf, plugin);
		view.file = file;
		leaf.open(view);
		// Load file content into Monaco editor.
		void view.onLoadFile(file);
	}

	/**
	 * Opens any file: uses the standard API for vault files,
	 * falls back to manual mount for external files (e.g.
	 * CSS snippets).
	 */
	static openFile(file: TFile, plugin: CodeFilesPlugin): void {
		if (
			plugin.getActiveExtensions().includes(file.extension) &&
			plugin.app.vault.getAbstractFileByPath(file.path)
		) {
			void CodeEditorView.openVaultFile(file, plugin);
		} else {
			CodeEditorView.openExternalFile(file, plugin);
		}
	}
}
