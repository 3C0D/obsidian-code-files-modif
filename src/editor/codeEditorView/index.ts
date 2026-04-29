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
import { mountCodeEditor, resolveThemeParams } from '../mountCodeEditor.ts';
import { getLanguage } from '../../utils/getLanguage.ts';
import type { CodeEditorInstance, HeaderActionsContext } from '../../types/types.ts';
import { viewType } from '../../types/variables.ts';
import { EditorSettingsModal } from '../../modals/editorSettingsModal.ts';
import { ChooseThemeModal } from '../../modals/chooseThemeModal.ts';
import { RenameExtensionModal } from '../../modals/renameExtensionModal.ts';
import { broadcastOptions } from '../../utils/broadcast.ts';
import { registerThemeChangeHandler } from '../../utils/themeUtils.ts';
import { getExtension } from '../../utils/fileUtils.ts';
import { revealFiles, unrevealFiles } from '../../utils/hiddenFiles/index.ts';
import {
	updateExtBadge,
	updateDirtyBadgeVisibility,
	setDirty,
	setSaving,
	clearDirty
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

	/** Expose the Monaco editor instance to allow sending messages directly to the iframe (e.g., for theme changes, formatting, etc.) */
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

	/**	Context is used for language detection and is derived from the file path. */
	getContext(file: TFile): string {
		return file.path;
	}

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
		// Only save when autoSave is enabled or when forceSave is true (set by Ctrl+S)
		if (!this.plugin.settings.autoSave && !this.forceSave) return;
		// External files (in configDir, e.g. .obsidian/snippets/)
		// must bypass vault.modify() which triggers Obsidian's
		// internal watcher → reconcileDeletion → tab closes.
		// Write directly via adapter.write() instead.
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
		if (this.diffTimer) clearTimeout(this.diffTimer);
		this.unregisterSnippetHandler?.();
		this.unregisterSnippetHandler = null;
		this.unregisterThemeHandler?.();
		this.unregisterThemeHandler = null;
		this.gearAction = null;
		this.themeAction = null;
		this.snippetFolderAction = null;
		this.snippetToggleAction = null;
		this.returnAction = null;
		this.diffAction = null;
		this.diffTimer = null;
		this.codeEditor = null!;
	}

	/**
	 * Builds a HeaderActionsContext snapshot from current class state.
	 * Used by showDiffAction, hideDiffAction, removeHeaderActions, and injectHeaderActions
	 * to delegate to standalone helpers. Mutable properties (diffAction, diffTimer, etc.)
	 * must be read back from the context after each call.
	 */
	private buildContext(): HeaderActionsContext {
		return {
			plugin: this.plugin,
			codeEditor: this.codeEditor,
			addAction: this.addAction.bind(this),
			onForceSave: () => { this.forceSave = true; },
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
			unregisterSnippetHandler: this.unregisterSnippetHandler
		};
	}

	/** Removes all header actions from the view. */
	private removeHeaderActions(): void {
		const context = this.buildContext();
		removeHeaderActions(context);
		// Update back
		this.gearAction = context.gearAction;
		this.themeAction = context.themeAction;
		this.snippetFolderAction = context.snippetFolderAction;
		this.snippetToggleAction = context.snippetToggleAction;
		this.returnAction = context.returnAction;
		this.diffAction = context.diffAction;
		this.diffTimer = context.diffTimer;
		this.unregisterSnippetHandler = context.unregisterSnippetHandler;
	}

	async onClose(): Promise<void> {
		await super.onClose();
		this.cleanup();
	}

	/** Focuses the Monaco editor when the view is activated. */
	onActive(): void {
		this.codeEditor?.send('focus', {});
	}

	/** Clears the dirty badge (marks the view as saved). */
	clearDirty(): void {
		clearDirty(this.containerEl);
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
		this.gearAction = context.gearAction;
		this.themeAction = context.themeAction;
		this.snippetFolderAction = context.snippetFolderAction;
		this.snippetToggleAction = context.snippetToggleAction;
		this.returnAction = context.returnAction;
		this.diffAction = context.diffAction;
		this.diffTimer = context.diffTimer;
		this.unregisterSnippetHandler = context.unregisterSnippetHandler;
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
			this.getContext(file),
			this.contentEl,
			() => this.onContentChange(),
			() => this.onCtrlS(),
			() => this.onFormat(),
			() => this.onFormatReverted(),
			(ext) => this.onOpenEditorConfig(ext),
			() => this.onOpenThemePicker(),
			() => this.onOpenRenameExtension(file)
		);
		// Register theme change handler to follow Obsidian's theme when set to 'default'
		this.unregisterThemeHandler = registerThemeChangeHandler(
			this.plugin,
			this.codeEditor
		);
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

	private onContentChange(): void {
		if (this.codeEditor.getValue() === this.data) {
			this.setDirty(false);
		} else {
			this.setDirty(true);
			this.requestSave();
		}
	}

	private onCtrlS(): void {
		this.forceSave = true;
		this.setSaving(true);
		void this.save().then(() => {
			this.setDirty(false);
			this.setSaving(false);
		});
	}

	private onFormat(): void {
		this.showDiffAction();
	}

	private onFormatReverted(): void {
		this.hideDiffAction();
		this.setDirty(false);
		this.forceSave = true;
		void this.save().then(() => {
			this.setSaving(false);
		});
	}

	private onOpenEditorConfig(ext: string): void {
		new EditorSettingsModal(
			this.plugin,
			ext,
			() => broadcastOptions(this.plugin),
			(config) => {
				this.codeEditor?.send('change-editor-config', { config });
			},
			() => this.codeEditor?.send('focus', {})
		).open();
	}

	private onOpenThemePicker(): void {
		const applyTheme = async (theme: string): Promise<void> => {
			const params = await resolveThemeParams(this.plugin, theme);
			this.codeEditor?.send('change-theme', params);
		};
		new ChooseThemeModal(this.plugin, applyTheme, () =>
			this.codeEditor?.send('focus', {})
		).open();
	}

	private onOpenRenameExtension(file: TFile): void {
		const f = this.plugin.app.vault.getFileByPath(file.path);
		if (f && 'extension' in f) {
			const modal = new RenameExtensionModal(this.plugin, f, () =>
				setTimeout(() => this.codeEditor?.send('focus', {}), 50)
			);
			modal.open();
		}
	}

	/** Initializes the Monaco editor when a file is loaded into the view. */
	async onLoadFile(file: TFile): Promise<void> {
		// super.onLoadFile reads file content into this.data and calls setViewData().
		// For external files, leaf.open() doesn't trigger this automatically.
		await super.onLoadFile(file);
		await this.mountEditor(file);
		this.contentEl.style.overflow = 'hidden'; // Monaco has its own scrollbars
		this.contentEl.append(this.codeEditor.iframe);
		this.updateExtBadge(file);
		this.injectHeaderActions(file);
	}

	/** Cleans up Monaco when the file is unloaded from the view. */
	async onUnloadFile(file: TFile): Promise<void> {
		await super.onUnloadFile(file);
		// Cleanup temporary revealed paths
		const path = file.path;
		const tmp = this.plugin.settings.temporaryRevealedPaths;
		if (tmp.includes(path)) {
			// Don't unreveal if the file is covered by a manual reveal
			// (file itself, or an ancestor folder, is in revealedFiles)
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
		this.cleanup(); // destroys codeEditor and removes header actions, but not the iframe DOM node
		this.contentEl.empty(); // remove the stale iframe from DOM
		// this.data remains valid after path change; no disk reload needed here
		await this.mountEditor(file);
		this.contentEl.append(this.codeEditor.iframe);
		this.updateExtBadge(file);
		this.injectHeaderActions(file);
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
}
