/**
 * Obsidian TextFileView wrapper for Monaco Editor.
 * Bridges Obsidian's file lifecycle (load/save/rename/close) with the Monaco iframe's postMessage API.
 * Manages the view header with extension badge, dirty state indicator, and action icons:
 * - Theme picker, settings gear, return arrow (unregistered extensions), diff viewer
 * - CSS snippet controls (folder opener, enable/disable toggle) when editing snippets
 *
 * The Monaco Editor instance (CodeEditorInstance) is created by mountCodeEditor() and embedded
 * as an iframe. This view handles all Obsidian-specific concerns (file I/O, header UI, lifecycle)
 * while delegating editor functionality to the isolated Monaco iframe via postMessage.
 */
import type { WorkspaceLeaf, ViewStateResult } from 'obsidian';
import { TextFileView, type TFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { mountCodeEditor } from '../mountCodeEditor.ts';
import { getLanguage } from '../../utils/getLanguage.ts';
import type { CodeEditorInstance, HeaderActionsContext } from '../../types/types.ts';
import { viewType } from '../../types/variables.ts';
import { openEditorConfig, openThemePicker, openRenameExtension } from './editorModals.ts';
import { registerThemeChangeHandler } from '../../utils/themeUtils.ts';
import { getExtension } from '../../utils/fileUtils.ts';
import { revealFiles, unrevealFiles } from '../../utils/hiddenFiles/index.ts';
import {
	updateExtBadge,
	updateDirtyBadgeVisibility,
	setDirty,
	setSaving
} from './headerBadges.ts';
import {
	injectHeaderActions,
	removeHeaderActions,
	showDiffAction,
	hideDiffAction
} from './headerActions.ts';

export class CodeEditorView extends TextFileView {
	/** The Monaco Editor instance, created by mountCodeEditor() and destroyed on view close. */
	private codeEditor!: CodeEditorInstance;
	/** The `forceSave` flag allows us to bypass the auto-save check in the overridden `save()` method when the user explicitly triggers a save via Ctrl+S. This ensures that even if auto-save is disabled, users can still manually save their work. */
	private forceSave = false;
	/** Gear icon action (Editor Settings) in the view header */
	private gearAction: HTMLElement | null = null;
	/** Theme picker icon action in the view header */
	private themeAction: HTMLElement | null = null;
	/** Snippet folder opener icon action in the view header (CSS snippets only) */
	private snippetFolderAction: HTMLElement | null = null;
	/** Snippet enable/disable toggle action in the view header (CSS snippets only) */
	private snippetToggleAction: HTMLElement | null = null;
	/** Return to default view icon action in the view header (unregistered extensions only) */
	private returnAction: HTMLElement | null = null;
	/** Show format diff icon action in the view header (appears after formatting) */
	private diffAction: HTMLElement | null = null;
	/** Timer to automatically hide the diff action after 10 seconds */
	private diffTimer: NodeJS.Timeout | null = null;
	/** Cleanup function for snippet change handler */
	private unregisterSnippetHandler: (() => void) | null = null;
	/** Cleanup function for theme change handler */
	private unregisterThemeHandler: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: CodeFilesPlugin
	) {
		super(leaf);
	}

	/** Expose the Monaco editor instance (MountCodeEditor Instance) to allow sending messages directly to the iframe (e.g., for theme changes, formatting, etc.) */
	get editor(): CodeEditorInstance | undefined {
		return this.codeEditor;
	}

	getDisplayText(): string {
		if (!this.file) return 'Code Editor';
		const configDir = this.plugin.app.vault.configDir;
		if (this.file.path.startsWith(`${configDir}/`)) {
			// Return the full relative path from the vault root, e.g. ".obsidian/snippets/style.css"
			return this.file.path;
		}
		return this.file.basename;
	}

	getViewType(): string {
		return viewType;
	}

	/** The icon for the view, shown in the header */
	getIcon(): string {
		return 'file-code-corner';
	}

	/**
	 * Get the file path for the current view.
	 * This method is used to resolve the file path for actions like saving or revealing the file in the vault.
	 */
	getFilePath(file: TFile): string {
		return file.path;
	}

	/**
	 * Used to save the view state to the vault.
	 */
	getState(): Record<string, unknown> {
		const state = super.getState() as Record<string, unknown>;
		// Mark dotfiles and CSS snippets so setState can reveal them before vault lookup on restore
		const configDir = this.plugin.app.vault.configDir;
		if (
			this.file &&
			(!this.file.extension || this.file.path.startsWith(`${configDir}/`))
		) {
			state.reveal = true;
		}
		return state;
	}

	/**
	 * Used to restore the view state from the vault.
	 */
	async setState(
		state: Record<string, unknown>,
		result: ViewStateResult
	): Promise<void> {
		const filePath = typeof state?.file === 'string' ? state.file : undefined;
		if (
			filePath &&
			state.reveal &&
			!this.plugin.app.vault.getAbstractFileByPath(filePath)
		) {
			const folderPath = filePath.substring(0, filePath.lastIndexOf('/')) || '';
			await revealFiles(this.plugin, folderPath, [filePath], true, false); // silent, no persist
			// Track for cleanup on unload
			if (!this.plugin.settings.temporaryRevealedPaths.includes(filePath)) {
				this.plugin.settings.temporaryRevealedPaths.push(filePath);
				await this.plugin.saveSettings();
			}
		}

		try {
			await super.setState(state, result);
		} catch (e) {
			// super.setState may fail for external files not in vault index
			console.debug('super.setState failed for external file', e);
		}
	}

	/**
	 * Overrides parent save: proceeds only if autoSave is enabled or forceSave is true.
	 * forceSave is set by the Ctrl+S handler in mountEditor (bypasses requestSave's debounce)
	 * and reset here after save completes.
	 *
	 * External files (.obsidian/) write via adapter.write() instead of vault.modify()
	 * to avoid triggering the internal watcher which would close the tab.
	 */
	async save(clear?: boolean): Promise<void> {
		if (!this.plugin.settings.autoSave && !this.forceSave) return;
		const configDir = this.plugin.app.vault.configDir;
		if (this.file && this.file.path.startsWith(configDir + '/')) {
			const content = this.getViewData();
			await this.plugin.app.vault.adapter.write(this.file.path, content);
			this.data = content;
		} else {
			await super.save(clear);
		}
		this.forceSave = false;
	}

	/** Cleans up Monaco when the file is unloaded from the view. */
	private cleanup(): void {
		if (!this.codeEditor) return;
		this.codeEditor.destroy();
		this.removeHeaderActions();
		this.unregisterThemeHandler?.();
		this.unregisterThemeHandler = null;
		this.codeEditor = null!;
	}

	/**
	 * Bundles current class state and callbacks into a HeaderActionsContext
	 * to pass to the standalone helpers in headerActions.ts.
	 * After each call, mutable properties (diffAction, diffTimer, etc.)
	 * must be synced back from the context to the class.
	 */
	private buildContext(): HeaderActionsContext {
		return {
			plugin: this.plugin,
			codeEditor: this.codeEditor,
			addAction: this.addAction.bind(this),
			onForceSave: () => {
				this.forceSave = true;
			},
			onShowDiff: () => this.showDiffAction(),
			onHideDiff: () => this.hideDiffAction(),
			leaf: this.leaf,
			gearAction: this.gearAction,
			themeAction: this.themeAction,
			snippetFolderAction: this.snippetFolderAction,
			snippetToggleAction: this.snippetToggleAction,
			returnAction: this.returnAction,
			diffAction: this.diffAction,
			diffTimer: this.diffTimer,
			unregisterSnippetHandler: this.unregisterSnippetHandler,
			onOpenEditorConfig: (ext: string) => openEditorConfig(this.plugin, this.codeEditor, ext),
			onOpenThemePicker: () => openThemePicker(this.plugin, this.codeEditor)
		};
	}

	/** Updates class properties from the HeaderActionsContext. */
	private updateFromContext(context: HeaderActionsContext): void {
		this.gearAction = context.gearAction;
		this.themeAction = context.themeAction;
		this.snippetFolderAction = context.snippetFolderAction;
		this.snippetToggleAction = context.snippetToggleAction;
		this.returnAction = context.returnAction;
		this.diffAction = context.diffAction;
		this.diffTimer = context.diffTimer;
		this.unregisterSnippetHandler = context.unregisterSnippetHandler;
	}

	/** Removes all header actions from the view. */
	private removeHeaderActions(): void {
		const context = this.buildContext();
		removeHeaderActions(context);
		// Sync action class properties back from context
		this.updateFromContext(context);
	}

	/** Cleans up the view when it's closed. */
	async onClose(): Promise<void> {
		await super.onClose();
		this.cleanup();
	}

	/** Focuses the Monaco editor when the view is activated. */
	onActive(): void {
		this.codeEditor?.send('focus', {});
	}

	/** Updates the dirty badge styling to show/hide the unsaved indicator in the header. */
	private setDirty(isDirtyBadge: boolean): void {
		setDirty(this.containerEl, isDirtyBadge);
	}

	/** Updates the saving badge styling to show/hide the saving indicator in the header. */
	private setSaving(isSaving: boolean): void {
		setSaving(this.containerEl, isSaving);
	}

	/** Updates the header with the file extension badge and creates a dirty badge when autoSave is disabled. */
	private updateExtBadge(file: TFile): void {
		updateExtBadge(this.containerEl, file, this.plugin);
	}

	/** Updates the dirty badge visibility based on autoSave setting. */
	public updateDirtyBadgeVisibility(): void {
		updateDirtyBadgeVisibility(this.containerEl, this.plugin);
	}

	/** Adds header actions: theme picker, editor settings, return to default view (only for unregistered extensions), and snippet controls (only for CSS snippets). */
	private injectHeaderActions(file: TFile): void {
		const context = this.buildContext();
		injectHeaderActions(context, file);
		// Update back
		this.updateFromContext(context);
	}

	/** Creates the Monaco editor instance with callbacks for content changes
	 *  (dirty + requestSave) and manual saves (Ctrl+S).
	 *  contentEl is passed to resolve the owner document/window, which differs
	 *  from the main window when opened in an Obsidian popout window. */
	public async mountEditor(file: TFile): Promise<void> {
		const ext = getExtension(file.name);
		this.codeEditor = await mountCodeEditor(
			this.plugin,
			getLanguage(ext),
			this.data,
			this.getFilePath(file),
			this.contentEl,
			() => this.onContentChange(),
			() => this.onCtrlS(),
			() => this.onFormat(),
			() => this.onAllBlocksReverted(),
			(ext) => openEditorConfig(this.plugin, this.codeEditor, ext),
			() => openThemePicker(this.plugin, this.codeEditor),
			() => openRenameExtension(this.plugin, this.codeEditor, file)
		);
		// Register theme change handler to follow Obsidian's theme when set to 'default'
		this.unregisterThemeHandler = registerThemeChangeHandler(
			this.plugin,
			this.codeEditor
		);
	}

	/** Mounts the editor and sets up the view elements and badges. */
	private async mountAndRender(file: TFile): Promise<void> {
		await this.mountEditor(file);
		this.contentEl.style.overflow = 'hidden';
		this.contentEl.append(this.codeEditor.iframe);
		this.updateExtBadge(file);
		this.injectHeaderActions(file);
	}

	/**
	 * Shows the diff action button in the header for a few seconds after a format.
	 * Delegates to the standalone `showDiffAction()` helper via a {@link HeaderActionsContext}.
	 *
	 * Callbacks injected into context:
	 * - `onForceSave` : sets `this.forceSave = true`
	 * - `onShowDiff`  : calls `this.showDiffAction()` (self-reference)
	 * - `onHideDiff`  : calls `this.hideDiffAction()`
	 *
	 * Mutates after call:
	 * - `this.diffAction` and `this.diffTimer` are updated from the context returned by the helper.
	 */
	private showDiffAction(): void {
		const context = this.buildContext();
		showDiffAction(context);
		this.diffAction = context.diffAction;
		this.diffTimer = context.diffTimer;
	}

	/** Hides the diff action immediately (called when all blocks are reverted) */
	private hideDiffAction(): void {
		const context = this.buildContext();
		hideDiffAction(context);
		this.diffAction = context.diffAction;
		this.diffTimer = context.diffTimer;
	}

	/** Handles content changes in the editor editor. */
	private onContentChange(): void {
		if (this.codeEditor.getValue() === this.data) {
			this.setDirty(false);
		} else {
			this.setDirty(true);
			this.requestSave();
		}
	}

	/** Handles manual saves (Ctrl+S). */
	private onCtrlS(): void {
		this.forceSave = true;
		this.setSaving(true);
		void this.save().then(() => {
			this.setDirty(false);
			this.setSaving(false);
		});
	}

	/** Shows the diff action button after a format. */
	private onFormat(): void {
		this.showDiffAction();
	}

	/** Hides the diff action button (called when all blocks are reverted). */
	private onAllBlocksReverted(): void {
		this.hideDiffAction();
	}

	/** Initializes the Monaco editor when a file is loaded into the view. */
	async onLoadFile(file: TFile): Promise<void> {
		// super.onLoadFile reads file content into this.data and calls setViewData().
		// For external files, leaf.open() doesn't trigger this automatically.
		await super.onLoadFile(file);
		await this.mountAndRender(file);
	}

	/**
	 * Called by Obsidian when the file is unloaded from the view.
	 * If the file was temporarily revealed (dotfile opened via setState restore),
	 * unreveals it on close — unless it is also covered by a manual reveal
	 * (file itself or an ancestor folder in revealedFiles).
	 */
	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
		const path = file.path;
		const tmp = this.plugin.settings.temporaryRevealedPaths;
		if (tmp.includes(path)) {
			// Don't unreveal if a manual reveal already covers this file:
			// either the file itself is in revealedFiles, or one of its ancestor folders is.
			const allRevealedItems = Object.values(
				this.plugin.settings.revealedFiles
			).flat();
			const manuallyRevealed = allRevealedItems.some(
				(p) => path === p || path.startsWith(p + '/')
			);
			if (!manuallyRevealed) {
				const folderPath = path.substring(0, path.lastIndexOf('/')) || '';
				await unrevealFiles(this.plugin, folderPath, [path], true);
			}
			// Remove from temporary list regardless — file is closed
			this.plugin.settings.temporaryRevealedPaths = tmp.filter((p) => p !== path);
			await this.plugin.saveSettings();
		}
		this.cleanup();
	}

	clear(): void {
		this.codeEditor?.clear();
	}

	/** Rebuilds Monaco editor after the file is renamed (destroys old instance, mounts new one, updates badges). */
	async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
		// Destroys codeEditor instance and listeners
		this.cleanup();
		// Now we can remove the stale iframe
		this.contentEl.empty();
		await this.mountAndRender(file);
	}

	getViewData(): string {
		return this.codeEditor.getValue();
	}

	/**
	 * Called by Obsidian when file content is ready (initial load or external disk change).
	 * Stores the content in this.data (Obsidian's cache) and syncs to Monaco if it exists.
	 * On initial load, codeEditor is not yet created — only this.data is set.
	 * On external change, the content comparison protects Monaco's undo/redo history:
	 * setValue() is only called if the disk content actually differs from the editor state.
	 *
	 * @param data The file content to sync to the editor.
	 * @param _clear Whether to clear the editor before setting the content. (Unused here)
	 */
	setViewData(data: string, _clear: boolean): void {
		this.data = data;
		if (this.codeEditor) {
			if (this.codeEditor.getValue() !== data) {
				this.codeEditor.setValue(data);
			}
		}
	}
}
