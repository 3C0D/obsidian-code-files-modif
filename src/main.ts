import { Plugin, TFile, TFolder, addIcon } from 'obsidian';
import { CodeEditorView } from './codeEditorView.ts';
import { CreateCodeFileModal } from './createCodeFileModal.ts';
import { CodeFilesSettingsTab } from './codeFilesSettingsTab.ts';
import { FenceEditModal } from './fenceEditModal.ts';
import { FenceEditContext } from './fenceEditContext.ts';
import { ChooseCssFileModal } from './chooseCssFileModal.ts';
import { RenameExtensionModal } from './renameExtensionModal.ts';
import { EditorSettingsModal } from './editorSettingsModal.ts';
import { DEFAULT_SETTINGS, viewType, DEFAULT_FORMATTER_CONFIG, type MyPluginSettings } from './types.ts';
import { getAllMonacoExtensions, loadPersistedLanguages } from './getLanguage.ts';

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
			new Notification('Code Files Plugin Error', {
				body:
					`Could not register extensions ${activeExts.join(', ')}; ` +
					`there are probably some other extensions that already registered them. ` +
					`Please change code-files's extensions in the plugin settings or remove conflicting plugins.`
			});
		}

		this.updateRibbonIcon();

		// ── Commands ──────────────────────────────────────────────────────────

		this.addCommand({
			id: 'create',
			name: 'Create new Code File',
			callback: () => {
				(document.activeElement as HTMLElement)?.blur();
				new CreateCodeFileModal(this).open();
			}
		});

		this.addCommand({
			id: 'open-codeblock-in-monaco',
			name: 'Open current code block in Monaco Editor',
			editorCheckCallback: (checking, editor) => {
				if (!FenceEditContext.create(this, editor)) return false;
				if (!checking) FenceEditModal.openOnCurrentCode(this, editor);
				return true;
			}
		});

		this.addCommand({
			id: 'open-current-file-in-monaco',
			name: 'Open current file in Monaco Editor',
			checkCallback: (checking) => {
				const file = this.app.workspace.activeEditor?.file;
				const activeView = this.app.workspace.getActiveViewOfType(CodeEditorView);
				if (!file || activeView) return false;
				if (!checking) CodeEditorView.openFile(file, this);
				return true;
			}
		});

		this.addCommand({
			id: 'open-css-snippet',
			name: 'Edit CSS Snippet',
			callback: () =>
				new ChooseCssFileModal(this, this.app.customCss.snippets).open()
		});

		this.addCommand({
			id: 'rename-extension',
			name: 'Rename extension of current file',
			callback: () => {
				const file = this.app.workspace.activeEditor?.file;
				if (!file || !this.getActiveExtensions().includes(file.extension)) {
					new Notification('No registered code file open');
					return;
				}
				new RenameExtensionModal(this, file).open();
			}
		});

		this.addCommand({
			id: 'formatter-config',
			name: 'Edit formatter config for current file',
			checkCallback: (checking) => {
				const file = this.app.workspace.activeEditor?.file;
				const isCodeFile =
					file && this.getActiveExtensions().includes(file.extension);
				if (!isCodeFile) return false;
				if (!checking) {
					(document.activeElement as HTMLElement)?.blur();
					new EditorSettingsModal(this, file.extension, () => this.broadcastOptions(), (config) => this.broadcastFormatterConfig(file.extension)).open();
				}
				return true;
			}
		});

		// ── File explorer & tab header context menu ───────────────────────────

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, abstractFile, source) => {
				const isExplorer = source === 'file-explorer-context-menu';
				const isFolder = abstractFile instanceof TFolder;
				const isFile = abstractFile instanceof TFile;

				if (isFolder) {
					menu.addItem((i) =>
						i
							.setTitle('Create Code File')
							.setIcon('file-plus')
							.onClick(() =>
								new CreateCodeFileModal(this, abstractFile).open()
							)
					);
					return;
				}

				// On a file — Rename only
				const addRename = (m: typeof menu): void => {
					m.addItem((i) =>
						i
							.setTitle('Rename Extension')
							.setIcon('pencil')
							.onClick(() =>
								new RenameExtensionModal(
									this,
									abstractFile as TFile
								).open()
							)
					);
				};

				if (isExplorer && isFile) {
					addRename(menu);
				} else if (!isExplorer) {
					addRename(menu);
				}
			})
		);

		// ── Editor context menu (right-click in editor + three-dot menu) ──────

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor) => {
				const fenceContext = FenceEditContext.create(this, editor);
				const activeFile = this.app.workspace.activeEditor?.file;
				const isRegistered =
					activeFile && this.getActiveExtensions().includes(activeFile.extension);

				// Build the list of applicable items
				type MenuItem = { title: string; icon: string; action: () => void };
				const items: MenuItem[] = [];

				if (fenceContext) {
					items.push({
						title: 'Edit Code Block in Monaco Editor',
						icon: 'code',
						action: () => FenceEditModal.openOnCurrentCode(this, editor)
					});
				}

				if (isRegistered && activeFile && !fenceContext) {
					items.push({
						title: 'Rename Extension',
						icon: 'pencil',
						action: () => new RenameExtensionModal(this, activeFile).open()
					});
				}

				if (items.length === 0) return;

				if (items.length === 1) {
					// Single item: flat
					menu.addItem((i) =>
						i
							.setTitle(items[0].title)
							.setIcon(items[0].icon)
							.onClick(items[0].action)
					);
				} else {
					// Multiple items: submenu
					menu.addItem((item) => {
						item.setTitle('Code Files').setIcon('file-json');
						const sub = item.setSubmenu();
						for (const it of items) {
							sub.addItem((i) =>
								i.setTitle(it.title).setIcon(it.icon).onClick(it.action)
							);
						}
					});
				}
			})
		);

		this.addSettingTab(new CodeFilesSettingsTab(this.app, this));
	}

	onunload(): void {}

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

	/** Unregisters a single extension from Obsidian's view registry at runtime. */
	unregisterExtension(ext: string): void {
		try {
			this.app.viewRegistry.unregisterExtensions([ext]);
		} catch (e) {
			console.log(`code-files: could not unregister extension "${ext}":`, e);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
		if (!this.settings.extraExtensions) {
			this.settings.extraExtensions = [];
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Returns the computed list of active extensions based on current settings. */
	getActiveExtensions(): string[] {
		if (this.settings.allExtensions) {
			return [
				...getAllMonacoExtensions(this.settings.excludedExtensions),
				...this.settings.extraExtensions
			];
		}
		return this.settings.extensions;
	}

	/** Adds an extension to the appropriate list depending on the current mode. */
	addExtension(ext: string): void {
		if (this.settings.allExtensions) {
			if (!this.settings.extraExtensions.includes(ext))
				this.settings.extraExtensions.push(ext);
		} else {
			if (!this.settings.extensions.includes(ext))
				this.settings.extensions.push(ext);
		}
	}

	/** Removes an extension from the appropriate list depending on the current mode. */
	removeExtension(ext: string): void {
		if (this.settings.allExtensions) {
			const idx = this.settings.extraExtensions.indexOf(ext);
			if (idx !== -1) {
				this.settings.extraExtensions.splice(idx, 1);
			} else if (!this.settings.excludedExtensions.includes(ext)) {
				this.settings.excludedExtensions.push(ext);
			}
		} else {
			const idx = this.settings.extensions.indexOf(ext);
			if (idx !== -1) this.settings.extensions.splice(idx, 1);
		}
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
		const views = this.app.workspace
			.getLeavesOfType(viewType)
			.map((l) => l.view as CodeEditorView);
		for (const view of views) {
			view.codeEditor?.send('change-options', {
				wordWrap: this.settings.wordWrap,
				lineNumbers: this.settings.lineNumbers ? 'on' : 'off',
				minimap: this.settings.minimap,
				folding: this.settings.folding,
				noSemanticValidation: !this.settings.semanticValidation,
				noSyntaxValidation: !this.settings.syntaxValidation
			});
		}
	}

	/** Sends updated formatter config to all open code-editor iframes matching the extension. */
	broadcastFormatterConfig(ext: string): void {
		const config = this.settings.formatterConfigs[ext] ?? DEFAULT_FORMATTER_CONFIG;
		const views = this.app.workspace
			.getLeavesOfType(viewType)
			.map((l) => l.view as CodeEditorView)
			.filter((v) => v.file?.extension === ext);
		for (const view of views) {
			view.codeEditor?.send('change-formatter-config', { config });
		}
	}
}
