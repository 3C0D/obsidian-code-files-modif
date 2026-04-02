import { Plugin, TFile, TFolder } from 'obsidian';
import { CodeEditorView } from './codeEditorView.ts';
import { CreateCodeFileModal } from './createCodeFileModal.ts';
import { CodeFilesSettingsTab } from './codeFilesSettingsTab.ts';
import { FenceEditModal } from './fenceEditModal.ts';
import { FenceEditContext } from './fenceEditContext.ts';
import { ChooseCssFileModal } from './chooseCssFileModal.ts';
import { RenameExtensionModal } from './renameExtensionModal.ts';
import { FormatterConfigModal } from './formatterConfigModal.ts';
import { DEFAULT_SETTINGS, viewType, type MyPluginSettings } from './types.ts';
import { loadPersistedLanguages } from './getLanguage.ts';

export default class CodeFilesPlugin extends Plugin {
	settings: MyPluginSettings;
	private ribbonIconEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		await loadPersistedLanguages(this);

		this.registerView(viewType, (leaf) => new CodeEditorView(leaf, this));

		try {
			this.registerExtensions(this.settings.extensions, viewType);
		} catch (e) {
			console.log('code-files plugin error:', e);
			new Notification('Code Files Plugin Error', {
				body:
					`Could not register extensions ${this.settings.extensions.join(', ')}; ` +
					`there are probably some other extensions that already registered them. ` +
					`Please change code-files's extensions in the plugin settings or remove conflicting plugins.`
			});
		}

		this.updateRibbonIcon();

		// ── Commands ──────────────────────────────────────────────────────────

		this.addCommand({
			id: 'create',
			name: 'Create new Code File',
			callback: () => new CreateCodeFileModal(this).open()
		});

		this.addCommand({
			id: 'open-codeblock-in-monaco',
			name: 'Open current code block in Monaco Editor',
			editorCallback: (editor) => FenceEditModal.openOnCurrentCode(this, editor)
		});

		this.addCommand({
			id: 'open-current-file-in-monaco',
			name: 'Open current file in Monaco Editor',
			callback: () => {
				const file = this.app.workspace.activeEditor?.file;
				if (!file) {
					new Notification('No viable file open');
					return;
				}
				CodeEditorView.openFile(file, this);
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
				if (!file || !this.settings.extensions.includes(file.extension)) {
					new Notification('No registered code file open');
					return;
				}
				new RenameExtensionModal(this, file).open();
			}
		});

		this.addCommand({
			id: 'formatter-config',
			name: 'Edit formatter config for current file',
			callback: () => {
				const file = this.app.workspace.activeEditor?.file;
				if (!file) {
					new Notification('No file open');
					return;
				}
				new FormatterConfigModal(this, file.extension).open();
			}
		});

		// ── File explorer & tab header context menu ───────────────────────────

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, abstractFile, source) => {
				const isExplorer = source === 'file-explorer-context-menu';
				const isFolder = abstractFile instanceof TFolder;
				const isFile = abstractFile instanceof TFile;
				const isRegistered =
					isFile && this.settings.extensions.includes(abstractFile.extension);

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

				// On a file — Rename + Formatter only
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

				const addFormatter = (m: typeof menu): void => {
					m.addItem((i) =>
						i
							.setTitle('Formatter Config')
							.setIcon('settings')
							.onClick(() =>
								new FormatterConfigModal(
									this,
									(abstractFile as TFile).extension
								).open()
							)
					);
				};

				if (isExplorer && isRegistered) {
					menu.addItem((item) => {
						item.setTitle('Code Files').setIcon('file-json');
						const sub = item.setSubmenu();
						addRename(sub);
						addFormatter(sub);
					});
				} else if (isExplorer) {
					addRename(menu);
				} else {
					// Tab header: flat
					addRename(menu);
					if (isRegistered) addFormatter(menu);
				}
			})
		);

		// ── Editor context menu (right-click in editor + three-dot menu) ──────

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor) => {
				const fenceContext = FenceEditContext.create(this, editor);
				const activeFile = this.app.workspace.activeEditor?.file;
				const isRegistered =
					activeFile && this.settings.extensions.includes(activeFile.extension);

				// Build the list of applicable items
				type MenuItem = { title: string; icon: string; action: () => void };
				const items: MenuItem[] = [];

				if (fenceContext) {
					items.push({
						title: 'Edit Code Block in Monaco Editor',
						icon: 'code',
						action: () => FenceEditModal.openOnCurrentCode(this, editor)
					});
					items.push({
						title: 'Formatter Config (code block)',
						icon: 'settings',
						action: () => {
							const lang = fenceContext.getFenceData().language;
							new FormatterConfigModal(this, lang).open();
						}
					});
				}

				if (isRegistered && activeFile) {
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
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
