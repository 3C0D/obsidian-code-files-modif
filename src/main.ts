import { Plugin } from 'obsidian';
import { CodeEditorView } from './editor/codeEditorView.ts';
import { CodeFilesSettingsTab } from './ui/codeFilesSettingsTab.ts';
import { viewType, type MyPluginSettings } from './types.ts';

import {
	getActiveExtensions,
	addExtension,
	removeExtension,
	initExtensions,
	registerExtension,
	unregisterExtension,
	syncRegisteredExts,
	reregisterExtensions
} from './utils/extensionUtils.ts';
import {
	broadcastOptions,
	broadcastBrightness,
	broadcastEditorConfig
} from './utils/broadcast.ts';
import { loadSettings, saveSettings } from './utils/settingsUtils.ts';
import { updateRibbonIcon } from './ui/ribbonIcon.ts';
import { registerCommands } from './ui/commands.ts';
import { registerContextMenus } from './ui/contextMenus.ts';
import { patchModalClose } from './utils/modalPatch.ts';

/**
 * Obsidian plugin entry point.
 *
 * Facade pattern: all public methods delegate to
 * utility modules in `utils/` and `ui/`. This keeps
 * the plugin class thin and testable.
 */
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

	getActiveExtensions(): string[] {
		return getActiveExtensions(this.settings);
	}
	addExtension(ext: string): void {
		addExtension(this.settings, ext);
	}
	removeExtension(ext: string): void {
		removeExtension(this.settings, ext);
	}

	registerExtension(ext: string): void {
		registerExtension(this, ext);
	}
	unregisterExtension(ext: string): void {
		unregisterExtension(this, ext);
	}
	syncRegisteredExts(): void {
		syncRegisteredExts(this);
	}
	async reregisterExtensions(): Promise<void> {
		await reregisterExtensions(this);
	}
	updateRibbonIcon(): void {
		updateRibbonIcon(this);
	}

	broadcastOptions(): void {
		broadcastOptions(this);
	}
	broadcastBrightness(): void {
		broadcastBrightness(this);
	}
	broadcastEditorConfig(ext: string): void {
		broadcastEditorConfig(this, ext);
	}
}
