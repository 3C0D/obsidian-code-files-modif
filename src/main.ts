import { Plugin } from 'obsidian';
import { CodeEditorView } from './editor/codeEditorView.ts';
import { CodeFilesSettingsTab } from './ui/codeFilesSettingsTab.ts';
import { viewType, type MyPluginSettings } from './types/types.ts';

import { initExtensions } from './utils/extensionUtils.ts';
import { loadSettings, saveSettings } from './utils/settingsUtils.ts';
import { updateRibbonIcon } from './ui/ribbonIcon.ts';
import { registerCommands } from './ui/commands.ts';
import { registerContextMenus } from './ui/contextMenus.ts';
import { patchModalClose } from './utils/modalPatch.ts';
import { updateProjectFolderHighlight } from './utils/explorerUtils.ts';

export default class CodeFilesPlugin extends Plugin {
	settings!: MyPluginSettings;
	ribbonIconEl: HTMLElement | null = null;
	_registeredExts: Set<string> = new Set();
	private _modalClosePatch: (() => void) | null = null;

	async onload(): Promise<void> {
		await loadSettings(this);
		this._modalClosePatch = patchModalClose();

		this.registerView(viewType, (leaf) => new CodeEditorView(leaf, this));
		initExtensions(this);
		updateRibbonIcon(this);
		registerCommands(this);
		registerContextMenus(this);
		this.addSettingTab(new CodeFilesSettingsTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			updateProjectFolderHighlight(this);
		});
	}

	onunload(): void {
		this._modalClosePatch?.();
		this._modalClosePatch = null;
		this.ribbonIconEl?.remove();
	}

	async loadSettings(): Promise<void> {
		await loadSettings(this);
	}
	async saveSettings(): Promise<void> {
		await saveSettings(this);
	}
}
