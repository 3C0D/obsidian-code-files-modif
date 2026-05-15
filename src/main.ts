import { Plugin, debounce } from 'obsidian';
import { CodeEditorView } from './editor/codeEditorView/index.ts';
import { CodeFilesSettingsTab } from './ui/codeFilesSettingsTab.ts';
import type { MyPluginSettings } from './types/index.ts';
import { viewType } from './types/index.ts';

import { initExtensions, getActiveExtensions } from './utils/extensionUtils.ts';
import { loadSettings, saveSettings } from './utils/settingsUtils.ts';
import {
  ensureDetectAllExtensions,
  showDetectAllExtensionsNotice
} from './utils/vaultConfigUtils.ts';
import { serializeMonacoHotkeys } from './utils/hotkeyUtils.ts';
import { addRibbonIcon } from './ui/ribbonIcon.ts';
import { registerCommands } from './ui/commands.ts';
import { registerContextMenus } from './ui/contextMenus.ts';
import { patchModalOpen } from './utils/modalPatch.ts';
import { patchOpenFile } from './utils/openFilePatch.ts';
import {
  updateProjectFolderHighlight,
  setupExplorerBadges,
  cleanupExplorerBadges,
  rescanExplorerBadges
} from './utils/explorerUtils.ts';
import {
  patchAdapter,
  patchRegisterExtensions,
  decorateFolders
} from './utils/hiddenFiles/index.ts';
import {
  cleanStaleRevealedFiles,
  restoreRevealedFiles,
  syncAutoRevealedDotfiles
} from './utils/hiddenFiles/sync.ts';
import { patchMenuOverlay } from './utils/menuPatch.ts';
import { revokeBlobUrlCache } from './editor/mountCodeEditor/buildBlobUrl.ts';
import { cleanupAllConsoles } from './editor/mountCodeEditor/consoleHandler.ts';

export default class CodeFilesPlugin extends Plugin {
  settings!: MyPluginSettings;
  ribbonIconEl: HTMLElement | null = null;
  _registeredExts: Set<string> = new Set();
  private _modalOpenPatch: (() => void) | null = null;
  private _openFilePatch: (() => void) | null = null;
  _lastHotkeys?: string;
  // Cache for flattened revealedItems to avoid recomputing Object.values(...).flat() on hot paths
  _revealedItemsCache: Set<string> | null = null;
  // Original reconcileDeletion method before patching, used to call the real implementation
  _origReconcileDeletion: ((realPath: string, path: string) => Promise<void>) | null =
    null;

  async onload(): Promise<void> {
    await loadSettings(this);
    const needsDetectNotice = ensureDetectAllExtensions(this);
    this._modalOpenPatch = patchModalOpen();
    this._openFilePatch = patchOpenFile(this);
    patchMenuOverlay(this);

    // Initialize _lastHotkeys with current hotkey state to enable change detection
    this._lastHotkeys = serializeMonacoHotkeys(this.app, this.settings);

    this.registerView(viewType, (leaf) => new CodeEditorView(leaf, this));
    initExtensions(this);
    addRibbonIcon(this);
    registerCommands(this);
    registerContextMenus(this);
    this.addSettingTab(new CodeFilesSettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      if (needsDetectNotice) {
        showDetectAllExtensionsNotice();
      }
      updateProjectFolderHighlight(this);
      await cleanStaleRevealedFiles(this);
      // Verify projectRootFolder still exists on disk
      if (this.settings.projectRootFolder) {
        const exists = await this.app.vault.adapter.exists(this.settings.projectRootFolder);
        if (!exists) {
          this.settings.projectRootFolder = '';
          await this.saveSettings();
        }
      }
      await restoreRevealedFiles(this);
      // Re-scan badges only if hidden folders were revealed (key "" in revealedItems)
      if (this.settings.revealedItems[""]?.length) {
        rescanExplorerBadges(this);
        updateProjectFolderHighlight(this);
      }

      // Re-trigger auto-reveal for all currently registered extensions.
      // registerExtensions is called before layoutReady, so the around patch skips it.
      if (this.settings.isAutoRevealRegisteredDotfile) {
        await syncAutoRevealedDotfiles(this, getActiveExtensions(this.settings));
      }
      decorateFolders(this);
    });

    setupExplorerBadges(this);

    this.register(patchAdapter(this));
    this.register(patchRegisterExtensions(this));

    const debouncedDecorateFolders = debounce(() => decorateFolders(this), 400);
    this.registerEvent(this.app.vault.on('create', debouncedDecorateFolders));
    this.registerEvent(this.app.vault.on('delete', debouncedDecorateFolders));
    this.registerEvent(this.app.vault.on('rename', debouncedDecorateFolders));
  }

  onunload(): void {
    this._modalOpenPatch?.();
    this._modalOpenPatch = null;
    this._openFilePatch?.();
    this._openFilePatch = null;
    cleanupExplorerBadges();
    this.ribbonIconEl?.remove();
    cleanupAllConsoles();
    revokeBlobUrlCache();
  }

  async loadSettings(): Promise<void> {
    await loadSettings(this);
  }
  async saveSettings(): Promise<void> {
    await saveSettings(this);
  }
}
