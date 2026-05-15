/**
 * Obsidian TextFileView wrapper for Monaco Editor.
 * Bridges Obsidian's file lifecycle (load/save/rename/close) with the Monaco iframe's postMessage API.
 * Manages the view header with extension badge, dirty state indicator, and action icons:
 * - Theme picker, settings gear, return arrow (unregistered extensions), diff viewer
 * - CSS snippet controls (folder opener, enable/disable toggle) when editing snippets
 *
 * The code editor control handle (CodeEditorHandle) is created by mountCodeEditor() and embedded
 * as an iframe. This view handles all Obsidian-specific concerns (file I/O, header UI, lifecycle)
 * while delegating editor functionality to the isolated Monaco iframe via postMessage.
 *
 * Note: The actual Monaco Editor instance resides within the isolated iframe and is not directly
 * accessible from this code. All interactions with the editor are performed via postMessage
 * communication through the CodeEditorHandle handle.
 */
import type { WorkspaceLeaf, ViewStateResult } from 'obsidian';
import { TextFileView, type TFile } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { mountCodeEditor } from '../mountCodeEditor/index.ts';
import { getLanguage } from '../../utils/getLanguage.ts';
import type {
  CodeEditorHandle,
  HeaderActionsContext,
  Prettify
} from '../../types/index.ts';
import { viewType } from '../../types/index.ts';
import {
  openEditorConfig,
  openThemePicker,
  openRenameExtension
} from './editorModals.ts';
import { registerThemeChangeHandler } from '../../utils/themeUtils.ts';
import { getExtension } from '../../utils/fileUtils.ts';
import {
  handleTemporaryReveal,
  cleanupTemporaryReveal
} from '../../utils/hiddenFiles/index.ts';
import { updateExtBadge, updateDirtyBadgeVisibility, setDirty } from './headerBadges.ts';
import {
  injectHeaderActions,
  removeHeaderActions,
  showDiffAction,
  hideDiffAction
} from './headerActions.ts';

export class CodeEditorView extends TextFileView {
  /** The code editor control handle (CodeEditorHandle), created by mountCodeEditor() and destroyed on view close. */
  private codeEditor: Prettify<CodeEditorHandle> | null = null;
  /** The `forceSave` flag allows us to bypass the auto-save check in the overridden `save()` method when the user explicitly triggers a save via Ctrl+S. This ensures that even if auto-save is disabled, users can still manually save their work. */
  private forceSave = false;
  /** Flag to hide the return arrow (set via state.noReturnAction) */
  private noReturnAction = false;
  /** Tracks whether the integrated console is currently open */
  private isConsoleOpen = false;
  /** Shared context for header actions, mutated directly by headerActions.ts to avoid snapshot/sync overhead. */
  private headerContext: HeaderActionsContext;
  /** Cleanup function for theme change handler */
  private unregisterThemeHandler: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: CodeFilesPlugin
  ) {
    super(leaf);
    this.headerContext = {
      plugin: this.plugin,
      codeEditor: null,
      addAction: this.addAction.bind(this),
      leaf: this.leaf,
      noReturnAction: false,
      gearAction: null,
      themeAction: null,
      snippetFolderAction: null,
      snippetToggleAction: null,
      returnAction: null,
      diffAction: null,
      diffTimer: null,
      unregisterSnippetHandler: null,
      onOpenEditorConfig: (ext: string) =>
        openEditorConfig(this.plugin, this.headerContext.codeEditor ?? undefined, ext),
      onOpenThemePicker: () =>
        openThemePicker(this.plugin, this.headerContext.codeEditor ?? undefined)
    };
  }

  /** Expose the code editor control handle (CodeEditorHandle) to allow sending messages directly to the iframe (e.g., for theme changes, formatting, etc.) */
  get editor(): CodeEditorHandle | undefined {
    return this.codeEditor ?? undefined;
  }

  /**
   * Get the display text for the view header.
   * This method is used to show the file path or basename in the header.
   */
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
    if (this.noReturnAction) {
      state.noReturnAction = true;
    }
    if (this.isConsoleOpen) {
      state.isConsoleOpen = true;
    }
    return state;
  }

  /**
   * Used to restore the view state from the vault.
   * For dotfiles and external files (.obsidian/), we reveal them first
   * so super.setState can find them in the vault index.
   * No try/catch needed around super.setState since handleTemporaryReveal ensures files are indexed.
   */
  async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
    const filePath = typeof state?.file === 'string' ? state.file : undefined;
    if (filePath && state.reveal) {
      await handleTemporaryReveal(this.plugin, filePath);
    }
    // Reset noReturnAction first, then set it only if explicitly in state
    this.noReturnAction = false;
    if (state.noReturnAction) {
      this.noReturnAction = true;
    }
    this.isConsoleOpen = false;
    if (state.isConsoleOpen) {
      this.isConsoleOpen = true;
    }
    // Sync noReturnAction to headerContext for immediate use by headerActions.ts
    this.headerContext.noReturnAction = this.noReturnAction;
    await super.setState(state, result);
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
    if (!this.codeEditor) return;
    if (!this.plugin.settings.autoSave && !this.forceSave) return;
    const configDir = this.plugin.app.vault.configDir;
    if (this.file && this.file.path.startsWith(configDir + '/')) {
      // For external files, use adapter.write() to avoid triggering vault watcher
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
    this.codeEditor = null;
    this.headerContext.codeEditor = null;
  }

  /** Removes all header actions from the view. */
  private removeHeaderActions(): void {
    removeHeaderActions(this.headerContext);
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

  /** Updates the dirty badge visibility based on autoSave setting. */
  public updateDirtyBadgeVisibility(): void {
    updateDirtyBadgeVisibility(this.containerEl, this.plugin);
  }

  /** Updates the header with the file extension badge and creates a dirty badge when autoSave is disabled. */
  private updateExtBadge(): void {
    updateExtBadge(this.containerEl, this.file!, this.plugin);
  }

  /** Adds header actions: theme picker, editor settings, return to default view (only for unregistered extensions), and snippet controls (only for CSS snippets). */
  private injectHeaderActions(): void {
    injectHeaderActions(this.headerContext, this.file!);
  }

  /** Orchestrates the mounting of a Monaco Editor by creating an isolated iframe
   *  and returning a control handle (CodeEditorHandle).
   *  contentEl is passed to resolve the owner document/window, which differs
   *  from the main window when opened in an Obsidian popout window. */
  public async mountEditor(file: TFile): Promise<void> {
    const ext = getExtension(file.name);
    this.codeEditor = await mountCodeEditor({
      plugin: this.plugin,
      language: getLanguage(ext),
      initialValue: this.data,
      codeContext: file.path,
      containerEl: this.contentEl,
      onChange: () => this.onContentChange(),
      onSave: () => this.onCtrlS(),
      onFormatDiff: () => this.onFormat(),
      onFormatDiffReverted: () => this.onAllBlocksReverted(),
      onOpenEditorConfig: (ext: string) =>
        openEditorConfig(this.plugin, this.codeEditor ?? undefined, ext),
      onOpenThemePicker: () => openThemePicker(this.plugin, this.codeEditor ?? undefined),
      onOpenRenameExtension: () =>
        openRenameExtension(this.plugin, this.codeEditor ?? undefined, file),
      initialConsoleOpen: this.isConsoleOpen,
      onConsoleVisibilityChanged: (visible) => {
        this.isConsoleOpen = visible;
        // Persist console visibility to the workspace layout (triggers getState → workspace.json),
        // so setState can restore it on next load (tab reopen or Obsidian restart).
        this.plugin.app.workspace.requestSaveLayout();
      }
    });
    this.headerContext.codeEditor = this.codeEditor;
    // Register theme change handler to follow Obsidian's theme when set to 'default'
    this.unregisterThemeHandler = registerThemeChangeHandler(
      this.plugin,
      this.codeEditor ?? undefined
    );
  }

  /** Mounts the editor and sets up the view elements and badges. */
  private async mountAndRender(): Promise<void> {
    await this.mountEditor(this.file!);
    // No scrollbar in the view content
    this.contentEl.style.overflow = 'hidden';
    if (this.codeEditor) {
      this.contentEl.append(this.codeEditor.iframe);
    }
    this.updateExtBadge();
    this.injectHeaderActions();
  }

  /**
   * Shows the diff action button in the view header for a few seconds after a format.
   */
  private showDiffAction(): void {
    showDiffAction(this.headerContext);
  }

  /** Hides the diff action immediately (called when all blocks are reverted) */
  private hideDiffAction(): void {
    hideDiffAction(this.headerContext);
  }

  /** Handles content changes in the editor. */
  private onContentChange(): void {
    if (!this.codeEditor) return;
    if (this.codeEditor.getValue() === this.data) {
      this.setDirty(false);
    } else {
      this.setDirty(true);
      this.requestSave();
    }
  }

  /** Handles manual saves (Ctrl+S). */
  private onCtrlS(): void {
    if (!this.codeEditor) return;
    this.forceSave = true;
    void this.save().then(() => {
      this.setDirty(false);
    });
  }

  /** Shows the diff action button after a format. */
  private onFormat(): void {
    this.showDiffAction();
  }

  /** Hides the diff action button (called when all blocks are reverted). */
  private onAllBlocksReverted(): void {
    this.hideDiffAction();
    if (this.codeEditor && this.codeEditor.getValue() === this.data) {
      this.setDirty(false);
    }
  }

  /** Initializes the Monaco editor when a file is loaded into the view. */
  async onLoadFile(file: TFile): Promise<void> {
    // super.onLoadFile reads file content into this.data and calls setViewData().
    // For external files opened via leaf.open(), content is not loaded automatically —
    // super.onLoadFile handles that case here.
    await super.onLoadFile(file);
    await this.mountAndRender();
  }

  /**
   * Called by Obsidian when the file is unloaded from the view.
   * If the file was temporarily revealed (dotfile opened via setState restore),
   * unreveals it on close — unless it is also covered by a manual reveal
   * (file itself or an ancestor folder in revealedItems).
   */
  async onUnloadFile(file: TFile): Promise<void> {
    await super.onUnloadFile(file);
    await cleanupTemporaryReveal(this.plugin, file.path);
    this.cleanup();
  }

  clear(): void {
    this.codeEditor?.clear();
  }

  /** Rebuilds Monaco editor after the file is renamed (destroys old handle, mounts new one, updates badges). */
  async onRename(file: TFile): Promise<void> {
    await super.onRename(file);
    // Destroys codeEditor instance and listeners
    this.cleanup();
    // Now we can remove the stale iframe
    this.contentEl.empty();
    await this.mountAndRender();
  }

  getViewData(): string {
    return this.codeEditor?.getValue() ?? '';
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
