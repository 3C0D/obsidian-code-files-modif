import type { TFile, WorkspaceLeaf } from 'obsidian';
import { normalizePath, TextFileView } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { mountCodeEditor, resolveThemeParams } from './mountCodeEditor.ts';
import { getLanguage } from '../utils/getLanguage.ts';
import { viewType, type CodeEditorInstance } from '../types/types.ts';
import { EditorSettingsModal } from '../modals/editorSettingsModal.ts';
import { ChooseThemeModal } from '../modals/chooseThemeModal.ts';
import { snippetExists, isSnippetEnabled } from '../utils/snippetUtils.ts';
import { DIFF_BUTTON_DISPLAY_DURATION } from '../types/types.ts';

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
	private snippetFolderAction: { remove: () => void } | null = null;
	private snippetToggleAction: { remove: () => void } | null = null;
	private returnAction: { remove: () => void } | null = null;
	private diffAction: { remove: () => void } | null = null;
	private diffTimer: NodeJS.Timeout | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CodeFilesPlugin
	) {
		super(leaf);
	}

	/** Public getter for editor instance (used by mountCodeEditor for scroll-to-position) */
	get editor(): CodeEditorInstance | undefined {
		return this.codeEditor;
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
		this.snippetFolderAction?.remove();
		this.snippetToggleAction?.remove();
		this.returnAction?.remove();
		this.diffAction?.remove();
		if (this.diffTimer) clearTimeout(this.diffTimer);
		this.gearAction = null;
		this.themeAction = null;
		this.snippetFolderAction = null;
		this.snippetToggleAction = null;
		this.returnAction = null;
		this.diffAction = null;
		this.diffTimer = null;
	}

	async onClose(): Promise<void> {
		await super.onClose();
		this.cleanup();
	}

	onActive(): void {
		this.codeEditor?.send('focus', {});
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

	/** Adds header actions: return to default view (only for unregistered extensions), change theme, snippet controls (only for CSS snippets), and open editor settings. */
	private injectGearIcon(file: TFile): void {
		this.gearAction?.remove();
		this.themeAction?.remove();
		this.snippetFolderAction?.remove();
		this.snippetToggleAction?.remove();
		this.returnAction?.remove();
		this.diffAction?.remove();

		this.themeAction = this.addAction('palette', 'Change Theme', () => {
			const applyTheme = async (theme: string): Promise<void> => {
				const params = await resolveThemeParams(this.plugin, theme);
				this.codeEditor?.send('change-theme', params);
			};
			new ChooseThemeModal(this.plugin, applyTheme, applyTheme).open();
		});

		this.gearAction = this.addAction('settings', 'Editor Settings', () => {
			new EditorSettingsModal(
				this.plugin,
				file.extension,
				() => this.plugin.broadcastOptions(),
				(config) => {
					this.codeEditor?.send('change-editor-config', { config });
				}
			).open();
		});

		const isUnregistered = !this.plugin
			.getActiveExtensions()
			.includes(file.extension);
		if (isUnregistered) {
			this.returnAction = this.addAction(
				'undo-2',
				'Return to default view',
				async () => {
					await this.leaf.setViewState({ type: 'empty', state: {} });
					await this.leaf.openFile(file);
				}
			);
		}

		// Add snippet controls ONLY when editing a CSS snippet file
		// Added LAST so they appear on the LEFT
		const isSnippetFile =
			file.path.includes('.obsidian/snippets') && file.extension === 'css';
		if (isSnippetFile) {
			const snippetName = file.basename;
			const exists = snippetExists(this.plugin.app, snippetName);

			this.snippetFolderAction = this.addAction(
				'folder',
				'Open snippets folder',
				() => {
					this.plugin.app.openWithDefaultApp(
						normalizePath('.obsidian/snippets')
					);
				}
			);

			if (exists) {
				const isOn = isSnippetEnabled(this.plugin.app, snippetName);
				const toggleEl = this.addAction(
					'square',
					`Toggle ${snippetName}.css snippet`,
					() => {
						const newState = !isSnippetEnabled(this.plugin.app, snippetName);
						this.plugin.app.customCss.setCssEnabledStatus(
							snippetName,
							newState
						);
						track.toggleClass('is-on', newState);
					}
				);
				// Inject custom toggle switch
				toggleEl.empty();
				toggleEl.addClass('code-files-snippet-toggle-action');
				const track = toggleEl.createDiv({ cls: 'code-files-toggle-track' });
				if (isOn) track.addClass('is-on');
				track.createDiv({ cls: 'code-files-toggle-thumb' });
				this.snippetToggleAction = toggleEl;
			}
		}
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
			},
			() => {
				this.showDiffAction();
			}
		);
	}

	/** Shows the diff action in the header for 10 seconds after a format */
	private showDiffAction(): void {
		if (this.diffTimer) clearTimeout(this.diffTimer);
		this.diffAction?.remove();

		this.diffAction = this.addAction('diff', 'Show Format Diff', () => {
			// Trigger the Monaco action via iframe
			this.codeEditor?.iframe.contentWindow?.postMessage(
				{ type: 'trigger-show-diff' },
				'*'
			);
		});
		(this.diffAction as unknown as HTMLElement).addClass('code-files-diff-action');

		this.diffTimer = setTimeout(() => {
			this.diffAction?.remove();
			this.diffAction = null;
		}, DIFF_BUTTON_DISPLAY_DURATION);
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

	/** Opens a vault file in the current leaf. */
	static async openVaultFile(file: TFile, plugin: CodeFilesPlugin): Promise<void> {
		const leaf = plugin.app.workspace.getLeaf(false);
		await leaf.setViewState({
			type: viewType,
			state: { file: file.path },
			active: true
		});
	}

	/** Opens external files (CSS snippets) in a new leaf. */
	static async openExternalFile(file: TFile, plugin: CodeFilesPlugin): Promise<void> {
		const leaf = plugin.app.workspace.getLeaf(true);
		const view = new CodeEditorView(leaf, plugin);
		view.file = file;
		await leaf.open(view);
		// to load the content and initialize Monaco.
		await view.onLoadFile(file);
		// Update the tab header to show the correct file name
		leaf.updateHeader();
	}

	/** Opens any file in Monaco. */
	static async openFile(file: TFile, plugin: CodeFilesPlugin): Promise<void> {
		if (plugin.app.vault.getAbstractFileByPath(file.path)) {
			await CodeEditorView.openVaultFile(file, plugin);
		} else {
			await CodeEditorView.openExternalFile(file, plugin);
		}
	}
}
