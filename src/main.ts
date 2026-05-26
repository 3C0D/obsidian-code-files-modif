import { Plugin, debounce, type TAbstractFile } from 'obsidian';
import { CodeEditorView } from './editor/codeEditorView/index.ts';
import { CodeFilesSettingsTab } from './ui/codeFilesSettingsTab.ts';
import type { MyPluginSettings } from './types/index.ts';
import { viewType } from './types/index.ts';

import { initExtensions } from './utils/extensionUtils.ts';
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
import { cleanStaleRevealedFiles, initRevealedFiles } from './utils/hiddenFiles/sync.ts';
import { patchMenuOverlay } from './utils/menuPatch.ts';
import {
  revokeBlobUrlCache,
  cleanupAllConsoles
} from './editor/mountCodeEditor/index.ts';
import { broadcastProjectFiles } from './utils/broadcast.ts';

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
    // Patch modal open behavior to intercept settings close and broadcast hotkeys
    this._modalOpenPatch = patchModalOpen();

    // Patch file open to route code files to the Monaco editor view
    this._openFilePatch = patchOpenFile(this);
    patchMenuOverlay(this);

    // Snapshot current hotkey state — used later to detect changes and broadcast updates
    this._lastHotkeys = serializeMonacoHotkeys(this.app, this.settings);

    // Register the Monaco-based code editor view for all tracked extensions
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

      // Remove revealedItems entries whose files no longer exist on disk
      await cleanStaleRevealedFiles(this);

      // If the saved projectRootFolder was deleted externally, reset it
      if (this.settings.projectRootFolder) {
        const exists = await this.app.vault.adapter.exists(
          this.settings.projectRootFolder
        );
        if (!exists) {
          this.settings.projectRootFolder = '';
          await this.saveSettings();
        }
      }

      // Restore dotfile visibility from persisted revealedItems
      await initRevealedFiles(this);

      // Badges and folder highlight only needed if hidden folders were manually revealed
      if (this.settings.revealedItems['']?.length) {
        rescanExplorerBadges(this);
        updateProjectFolderHighlight(this);
      }
    });

    // Mount extension badges on explorer items (file-type indicators)
    setupExplorerBadges(this);

    // Patch adapter to intercept reconcileDeletion (dotfile protection) and rename (drag-and-drop fix)
    this.register(patchAdapter(this));

    // Patch registerExtensions / unregisterExtensions to sync dotfile visibility with extension state
    this.register(patchRegisterExtensions(this));

    // Keep folder eye-badges in sync with revealedItems on any vault structural change
    const debouncedDecorateFolders = debounce(() => decorateFolders(this), 400);
    this.registerEvent(this.app.vault.on('create', debouncedDecorateFolders));
    this.registerEvent(this.app.vault.on('delete', debouncedDecorateFolders));
    this.registerEvent(this.app.vault.on('rename', debouncedDecorateFolders));

    // Broadcast updated project files to Monaco when tsconfig.json changes
    const onTsConfigChange = async (file: TAbstractFile): Promise<void> => {
      const root = this.settings.projectRootFolder;
      if (!root || file.path !== root + '/tsconfig.json') return;
      await broadcastProjectFiles(this);
    };
    this.registerEvent(this.app.vault.on('modify', onTsConfigChange));
    this.registerEvent(this.app.vault.on('create', onTsConfigChange));
    this.registerEvent(this.app.vault.on('delete', onTsConfigChange));
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
