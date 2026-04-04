import { Notice, Plugin, addIcon } from 'obsidian';
import { CodeEditorView } from './editor/codeEditorView.ts';
import { CodeFilesSettingsTab } from './ui/codeFilesSettingsTab.ts';
import {
	DEFAULT_SETTINGS,
	viewType,
	DEFAULT_EDITOR_CONFIG,
	parseEditorConfig,
	type MyPluginSettings
} from './types.ts';
import { loadPersistedLanguages } from './utils/getLanguage.ts';
import {
	getActiveExtensions,
	addExtension,
	removeExtension,
	getCodeEditorViews
} from './utils/extensionUtils.ts';
import { registerCommands } from './ui/commands.ts';
import { registerContextMenus } from './ui/contextMenus.ts';
import { CreateCodeFileModal } from './modals/createCodeFileModal.ts';

export default class CodeFilesPlugin extends Plugin {
	settings!: MyPluginSettings;
	private ribbonIconEl: HTMLElement | null = null;
	/** Snapshot of the active extensions at last registration, used to diff on reregister. */
	private _registeredExts: Set<string> = new Set();

	async onload(): Promise<void> {
		await this.loadSettings();
		await loadPersistedLanguages(this);

		addIcon(
			'code-files-settings',
			'<rect x="5" y="5" width="90" height="90" rx="15" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="50" cy="50" r="25" fill="currentColor"/>'
		);

		this.registerView(viewType, (leaf) => new CodeEditorView(leaf, this));

		const activeExts = this.getActiveExtensions();
		try {
			this.registerExtensions(activeExts, viewType);
			this._registeredExts = new Set(activeExts);
		} catch (e) {
			console.log('code-files plugin error:', e);
			new Notice(
				`Code Files: could not register extensions ${activeExts.join(', ')}`
			);
		}

		this.updateRibbonIcon();
		registerCommands(this);
		registerContextMenus(this);
		this.addSettingTab(new CodeFilesSettingsTab(this.app, this));
	}

	/** Adds or removes the ribbon icon based on the showRibbonIcon setting. */
	updateRibbonIcon(): void {
		this.ribbonIconEl?.remove();
		this.ribbonIconEl = null;
		if (this.settings.showRibbonIcon) {
			this.ribbonIconEl = this.addRibbonIcon(
				'file-json',
				'Create Code File',
				() => {
					(document.activeElement as HTMLElement)?.blur();
					new CreateCodeFileModal(this).open();
				}
			);
		}
	}

	/** Registers a single extension with Obsidian's view registry at runtime, without restart. */
	registerExtension(ext: string): void {
		if (!this.app.viewRegistry.getTypeByExtension(ext)) {
			try {
				this.registerExtensions([ext], viewType);
			} catch (e) {
				console.log(`code-files: could not register extension "${ext}":`, e);
			}
		}
	}

	/** Syncs _registeredExts snapshot with the current active extensions.
	 *  Must be called after any direct add/remove that bypasses reregisterExtensions. */
	syncRegisteredExts(): void {
		this._registeredExts = new Set(this.getActiveExtensions());
	}

	/** Unregisters a single extension from Obsidian's view registry at runtime. */
	unregisterExtension(ext: string): void {
		try {
			this.app.viewRegistry.unregisterExtensions([ext]);
			// Close any open Monaco views for this extension — keeping them open
			// after unregistration would leave stale editors with no save path.
			this.app.workspace.getLeavesOfType(viewType).forEach((leaf) => {
				const view = leaf.view as CodeEditorView;
				if (view.file?.extension === ext) leaf.detach();
			});
		} catch (e) {
			console.log(`code-files: could not unregister extension "${ext}":`, e);
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			// editorConfigs needs a deep merge: a plain spread would overwrite the entire object,
			// losing DEFAULT_EDITOR_CONFIG['*'] if the saved data has no '*' key.
			editorConfigs: {
				'*': DEFAULT_EDITOR_CONFIG,
				...(loaded?.editorConfigs ?? {})
			}
		};
		if (!this.settings.extraExtensions) {
			this.settings.extraExtensions = [];
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
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

	/**
	 * Recomputes and reregisters extensions based on current settings.
	 * Diffs against the last registered snapshot to avoid redundant calls.
	 */
	async reregisterExtensions(): Promise<void> {
		const next = new Set(this.getActiveExtensions());

		for (const ext of this._registeredExts) {
			if (!next.has(ext)) this.unregisterExtension(ext);
		}
		for (const ext of next) {
			if (!this._registeredExts.has(ext)) this.registerExtension(ext);
		}

		this._registeredExts = next;
		await this.saveSettings();
	}

	/** Sends updated editor options to all open code-editor iframes. */
	broadcastOptions(): void {
		for (const view of getCodeEditorViews(this.app)) {
			view.codeEditor?.send('change-options', {
				noSemanticValidation: !this.settings.semanticValidation,
				noSyntaxValidation: !this.settings.syntaxValidation
			});
		}
	}

	/** Applies brightness filter to all open code-editor iframes. */
	broadcastBrightness(): void {
		for (const view of getCodeEditorViews(this.app)) {
			if (view.codeEditor?.iframe) {
				view.codeEditor.iframe.style.filter = `brightness(${this.settings.editorBrightness})`;
			}
		}
	}

	/** Sends updated editor config to all open code-editor iframes matching the extension.
	 *  If ext is '*', rebroadcasts the merged config to all open views. */
	broadcastEditorConfig(ext: string): void {
		const globalCfg = parseEditorConfig(
			this.settings.editorConfigs['*'] ?? DEFAULT_EDITOR_CONFIG
		) as Record<string, unknown>;
		const views = getCodeEditorViews(this.app);
		const targets =
			ext === '*' ? views : views.filter((v) => v.file?.extension === ext);
		for (const view of targets) {
			const fileExt = view.file?.extension ?? '';
			const extCfg = parseEditorConfig(
				this.settings.editorConfigs[fileExt] ?? '{}'
			) as Record<string, unknown>;
			const config = JSON.stringify({ ...globalCfg, ...extCfg });
			view.codeEditor?.send('change-editor-config', { config });
		}
	}
}
