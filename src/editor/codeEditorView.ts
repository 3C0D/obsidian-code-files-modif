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
import type { WorkspaceLeaf } from 'obsidian';
import { normalizePath, TextFileView, TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { mountCodeEditor, resolveThemeParams } from './mountCodeEditor.ts';
import { getLanguage } from '../utils/getLanguage.ts';
import type { CodeEditorInstance } from '../types/types.ts';
import { viewType } from '../types/variables.ts';
import { EditorSettingsModal } from '../modals/editorSettingsModal.ts';
import { ChooseThemeModal } from '../modals/chooseThemeModal.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import {
	snippetExists,
	isSnippetEnabled,
	registerSnippetChangeHandler
} from '../utils/snippetUtils.ts';
import { broadcastOptions } from '../utils/broadcast.ts';
import { getActiveExtensions } from '../utils/extensionUtils.ts';
import { DIFF_BUTTON_DISPLAY_DURATION } from '../types/variables.ts';
import { registerThemeChangeHandler } from '../utils/themeUtils.ts';
import { getExtension } from '../utils/fileUtils.ts';

/**
 * Obsidian TextFileView wrapper for Monaco Editor.
 * Bridges Obsidian's file lifecycle (load/save/rename/close) with the Monaco iframe's postMessage API.
 * Manages the view header with extension badge, dirty state indicator, and action icons:
 * - Theme picker, settings gear, return arrow (unregistered extensions), diff viewer
 * - CSS snippet controls (folder opener, enable/disable toggle) when editing snippets
 */
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
		return this.file?.basename ?? 'Code Editor';
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

	/** Removes all header actions from the view. */
	private removeHeaderActions(): void {
		this.gearAction?.remove();
		this.themeAction?.remove();
		this.snippetFolderAction?.remove();
		this.snippetToggleAction?.remove();
		this.returnAction?.remove();
		this.diffAction?.remove();
	}

	/** Cleans up Monaco when the file is unloaded from the view. */
	private cleanup(): void {
		this.codeEditor?.destroy();
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
		const ext = getExtension(file.name);
		const badge = createEl('span', {
			text: ext ? `.${ext}` : file.name,
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

	/** Adds header actions: theme picker, editor settings, return to default view (only for unregistered extensions), and snippet controls (only for CSS snippets). */
	private injectHeaderActions(file: TFile): void {
		this.removeHeaderActions();

		this.themeAction = this.addAction('palette', 'Change Theme', () => {
			const applyTheme = async (theme: string): Promise<void> => {
				const params = await resolveThemeParams(this.plugin, theme);
				this.codeEditor?.send('change-theme', params);
			};
			new ChooseThemeModal(this.plugin, applyTheme, () =>
				this.codeEditor?.send('focus', {})
			).open();
		});

		const ext = getExtension(file.name);
		this.gearAction = this.addAction('settings', 'Editor Settings', () => {
			new EditorSettingsModal(
				this.plugin,
				ext,
				() => broadcastOptions(this.plugin),
				(config) => {
					this.codeEditor?.send('change-editor-config', { config });
				},
				() => this.codeEditor?.send('focus', {})
			).open();
		});

		// Add return-to-default-view (normal obsidian view) action ONLY when the extension is not registered
		const isUnregistered = !getActiveExtensions(this.plugin.settings).includes(ext);
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
			file.path.includes('.obsidian/snippets') && getExtension(file.name) === 'css';
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
				// Create toggle action to enable/disable the snippet
				const isOn = isSnippetEnabled(this.plugin.app, snippetName);
				const toggleEl = this.addAction(
					'square',
					`${isOn ? 'Disable' : 'Enable'} ${snippetName}.css snippet`,
					() => {
						const newState = !isSnippetEnabled(this.plugin.app, snippetName);
						this.plugin.app.customCss.setCssEnabledStatus(
							snippetName,
							newState
						);
						track.toggleClass('is-on', newState);
						toggleEl.setAttr(
							'aria-label',
							`${newState ? 'Disable' : 'Enable'} ${snippetName}.css snippet`
						);
					}
				);
				// Replace the default Obsidian action button with a custom CSS toggle switch
				toggleEl.empty();
				toggleEl.addClass('code-files-snippet-toggle-action');
				// The toggle consists of a track (the background) and a thumb (the circle that moves). The "is-on" class controls the toggle state (on/off).
				const track = toggleEl.createDiv({ cls: 'code-files-toggle-track' });
				if (isOn) track.addClass('is-on');
				track.createDiv({ cls: 'code-files-toggle-thumb' });
				this.snippetToggleAction = toggleEl;

				// Listen for external snippet state changes (from Obsidian settings).
				// This reassigns the handler after it was nulled during previous cleanup() (e.g. on rename).
				this.unregisterSnippetHandler = registerSnippetChangeHandler(
					this.plugin.app,
					snippetName,
					(isOn) => {
						track.toggleClass('is-on', isOn);
						toggleEl.setAttr(
							'aria-label',
							`${isOn ? 'Disable' : 'Enable'} ${snippetName}.css snippet`
						);
					}
				);
			}
		}
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
			() => {
				this.setDirty(true);
				// Debounced this.save() 2s
				this.requestSave();
			},
			() => {
				this.forceSave = true;
				this.setSaving(true);
				// void is used to explicitly ignore the returned promise, since the save
				// operation is already being tracked by the saving badge and we don't want
				// unhandled promise rejections if the save fails. The save method will
				// reset the dirty and saving states accordingly once it completes.
				void this.save().then(() => {
					this.setDirty(false);
					this.setSaving(false);
				});
			},
			() => {
				// Show the diff action in the header after formatting so users can
				// see what changed. Hidden after x seconds.
				this.showDiffAction();
			},
			() => {
				// onFormatDiffReverted — full reset
				// as if no formatting ever happened
				this.hideDiffAction();
				this.setDirty(false);
				// Save the reverted content to disk
				this.forceSave = true;
				void this.save().then(() => {
					this.setSaving(false);
				});
			},
			// onOpenEditorConfig
			(ext) => {
				new EditorSettingsModal(
					this.plugin,
					ext,
					() => broadcastOptions(this.plugin),
					(config) => {
						this.codeEditor?.send('change-editor-config', { config });
					},
					() => this.codeEditor?.send('focus', {})
				).open();
			},
			// onOpenThemePicker
			() => {
				const applyTheme = async (theme: string): Promise<void> => {
					const params = await resolveThemeParams(this.plugin, theme);
					this.codeEditor?.send('change-theme', params);
				};
				new ChooseThemeModal(this.plugin, applyTheme, () =>
					this.codeEditor?.send('focus', {})
				).open();
			},
			// onOpenRenameExtension
			() => {
				const f = this.plugin.app.vault.getFileByPath(file.path);
				if (f && 'extension' in f) {
					const modal = new RenameExtensionModal(this.plugin, f, () =>
						setTimeout(() => this.codeEditor?.send('focus', {}), 50)
					);
					modal.open();
				}
			}
		);
		// Register theme change handler to follow Obsidian's theme when set to 'default'
		this.unregisterThemeHandler = registerThemeChangeHandler(
			this.plugin,
			this.codeEditor
		);
	}

	/** Shows the diff action in the header for x seconds after a format */
	private showDiffAction(): void {
		if (this.diffTimer) clearTimeout(this.diffTimer);
		this.diffAction?.remove();

		this.diffAction = this.addAction('diff', 'Show Format Diff', () => {
			this.codeEditor?.send('trigger-show-diff', {});
		});
		// Flash the diff icon to draw attention to it
		this.diffAction.addClass('code-files-diff-action');

		// Hide the diff action after x seconds
		this.diffTimer = setTimeout(() => {
			this.diffAction?.remove();
			this.diffAction = null;
		}, DIFF_BUTTON_DISPLAY_DURATION);
	}

	/** Hides the diff action immediately (called when all blocks are reverted) */
	public hideDiffAction(): void {
		if (this.diffTimer) clearTimeout(this.diffTimer);
		this.diffAction?.remove();
		this.diffAction = null;
		this.diffTimer = null;
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
		this.cleanup();
	}

	clear(): void {
		this.codeEditor?.clear();
	}

	/** Rebuilds Monaco editor after the file is renamed (destroys old instance, mounts new one, updates badges). */
	async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
		this.cleanup();
		this.contentEl.empty();
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

	/** Opens a vault file in a leaf (new tab or current leaf based on parameter). */
	static async openVaultFile(
		file: TFile,
		plugin: CodeFilesPlugin,
		newTab = false
	): Promise<void> {
		const leaf = plugin.app.workspace.getLeaf(newTab ? 'tab' : false);
		await leaf.setViewState({
			type: viewType,
			state: { file: file.path },
			active: true
		});
	}

	/** Opens external files (CSS snippets) in a new leaf via an adapter path (not vault-indexed).
	 *  Constructs a pseudo TFile internally since the path is outside the vault. */
	static async openExternalFile(
		filePath: string,
		plugin: CodeFilesPlugin
	): Promise<void> {
		// Snippets are outside the vault — TFile is constructed manually
		// because the adapter path is not indexed in the vault.
		// Workaround: constructors TFile manually via Obsidian's internal API since the file isn't in vault cache.
		// @ts-expect-error: TFile constructor is internal API
		const file = new TFile(plugin.app.vault, filePath);
		const leaf = plugin.app.workspace.getLeaf(true);
		const view = new CodeEditorView(leaf, plugin);
		view.file = file;
		await leaf.open(view);
		await view.onLoadFile(file);
		// Update tab header tab to show the file name
		leaf.updateHeader();
	}

	/** Opens any file in Monaco. */
	static async openFile(
		file: TFile,
		plugin: CodeFilesPlugin,
		newTab = false
	): Promise<void> {
		if (plugin.app.vault.getAbstractFileByPath(file.path)) {
			await CodeEditorView.openVaultFile(file, plugin, newTab);
		} else {
			await CodeEditorView.openExternalFile(file.path, plugin);
		}
	}
}
