import { Plugin } from 'obsidian';
import { CodeEditorView } from './editor/codeEditorView/index.ts';
import { CodeFilesSettingsTab } from './ui/codeFilesSettingsTab.ts';
import type { MyPluginSettings } from './types/types.ts';
import { viewType } from './types/variables.ts';

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
	cleanupExplorerBadges
} from './utils/explorerUtils.ts';
import { patchAdapter, patchRegisterExtensions } from './utils/hiddenFiles/index.ts';
import {
	cleanStaleRevealedFiles,
	restoreRevealedFiles,
	syncAutoRevealedDotfiles
} from './utils/hiddenFiles/sync.ts';
import { decorateFolders } from './utils/hiddenFiles/index.ts';
import { patchMenuOverlay } from './utils/menuPatch.ts';
import { revokeBlobUrlCache } from './editor/mountCodeEditor/buildBlobUrl.ts';

export default class CodeFilesPlugin extends Plugin {
	settings!: MyPluginSettings;
	ribbonIconEl: HTMLElement | null = null;
	_registeredExts: Set<string> = new Set();
	private _modalOpenPatch: (() => void) | null = null;
	private _openFilePatch: (() => void) | null = null;
	_lastHotkeys?: string;
	_origReconcileDeletion: ((realPath: string, path: string) => Promise<void>) | null =
		null;
	_origRename: ((src: string, dest: string) => Promise<void>) | null = null;

	async onload(): Promise<void> {
		await loadSettings(this);
		const needsDetectNotice = ensureDetectAllExtensions(this);
		this._modalOpenPatch = patchModalOpen();
		this._openFilePatch = patchOpenFile(this);
		patchMenuOverlay(this);

		// Initialize _lastHotkeys with current hotkey state to enable change detection
		this._lastHotkeys = serializeMonacoHotkeys(this.app);

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
			await restoreRevealedFiles(this);
			// Re-trigger auto-reveal for all currently registered extensions.
			// registerExtensions is called before layoutReady, so the around patch skips it.
			if (this.settings.autoRevealRegisteredDotfiles) {
				await syncAutoRevealedDotfiles(this, getActiveExtensions(this.settings));
			}
			await decorateFolders(this);
		});

		setupExplorerBadges(this);

		this.register(patchAdapter(this));
		this.register(patchRegisterExtensions(this));
		this.registerEvent(this.app.vault.on('create', () => decorateFolders(this)));
		this.registerEvent(this.app.vault.on('delete', () => decorateFolders(this)));
		this.registerEvent(this.app.vault.on('rename', () => decorateFolders(this)));
	}

	onunload(): void {
		this._modalOpenPatch?.();
		this._modalOpenPatch = null;
		this._openFilePatch?.();
		this._openFilePatch = null;
		cleanupExplorerBadges();
		this.ribbonIconEl?.remove();
		revokeBlobUrlCache();
	}

	async loadSettings(): Promise<void> {
		await loadSettings(this);
	}
	async saveSettings(): Promise<void> {
		await saveSettings(this);
	}
}
