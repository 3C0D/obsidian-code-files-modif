import { Plugin } from 'obsidian';
import { CodeEditorView } from './editor/codeEditorView.ts';
import { CodeFilesSettingsTab } from './ui/codeFilesSettingsTab.ts';
import type { MyPluginSettings } from './types/types.ts';
import { viewType } from './types/variables.ts';

import { initExtensions } from './utils/extensionUtils.ts';
import { loadSettings, saveSettings } from './utils/settingsUtils.ts';
import { serializeMonacoHotkeys } from './utils/hotkeyUtils.ts';
import { updateRibbonIcon } from './ui/ribbonIcon.ts';
import { registerCommands } from './ui/commands.ts';
import { registerContextMenus } from './ui/contextMenus.ts';
import { patchModalOpen } from './utils/modalPatch.ts';
import { patchOpenFile } from './utils/openFilePatch.ts';
import {
	updateProjectFolderHighlight,
	setupExplorerBadges,
	cleanupExplorerBadges
} from './utils/explorerUtils.ts';
import {
	patchAdapter,
	cleanStaleRevealedFiles,
	restoreRevealedFiles,
	decorateFolders
} from './utils/hiddenFilesUtils.ts';
import { patchMenuOverlay } from './utils/menuPatch.ts';

export default class CodeFilesPlugin extends Plugin {
	settings!: MyPluginSettings;
	ribbonIconEl: HTMLElement | null = null;
	_registeredExts: Set<string> = new Set();
	private _modalOpenPatch: (() => void) | null = null;
	private _openFilePatch: (() => void) | null = null;
	_lastHotkeys?: string;

	async onload(): Promise<void> {
		await loadSettings(this);
		this._modalOpenPatch = patchModalOpen();
		this._openFilePatch = patchOpenFile(this);
		patchMenuOverlay(this);

		// Initialize _lastHotkeys with current hotkey state to enable change detection
		this._lastHotkeys = serializeMonacoHotkeys(this.app);

		this.registerView(viewType, (leaf) => new CodeEditorView(leaf, this));
		initExtensions(this);
		updateRibbonIcon(this);
		registerCommands(this);
		registerContextMenus(this);
		this.addSettingTab(new CodeFilesSettingsTab(this.app, this));

		this.app.workspace.onLayoutReady(async () => {
			updateProjectFolderHighlight(this);
			await cleanStaleRevealedFiles(this);
			await restoreRevealedFiles(this);
			await decorateFolders(this);
		});

		setupExplorerBadges(this);

		this.register(patchAdapter(this));
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
	}

	async loadSettings(): Promise<void> {
		await loadSettings(this);
	}
	async saveSettings(): Promise<void> {
		await saveSettings(this);
	}
}
