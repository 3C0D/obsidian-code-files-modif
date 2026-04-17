/**
 * Obsidian plugin settings tab.
 * Provides UI for:
 * - Ribbon icon toggle
 * - Extension management (manual vs extended mode, add/remove extensions)
 * - Per-extension editor config with Monaco JSON editor
 * - Project root folder highlight color customization
 */
import type { App } from 'obsidian';
import { debounce, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import type { CodeEditorInstance } from '../types/types.ts';
import { ChooseExtensionModal } from '../modals/chooseExtensionModal.ts';
import { DEFAULT_EDITOR_CONFIG, DEFAULT_EXTENSION_CONFIG } from '../types/types.ts';
import { broadcastEditorConfig } from '../utils/broadcast.ts';
import { getActiveExtensions, reregisterExtensions } from '../utils/extensionUtils.ts';
import { saveEditorConfig } from '../utils/settingsUtils.ts';
import { updateRibbonIcon } from './ribbonIcon.ts';
import { ExtensionSuggest } from './extensionSuggest.ts';
import { updateProjectFolderHighlight } from '../utils/explorerUtils.ts';

export class CodeFilesSettingsTab extends PluginSettingTab {
	private codeEditor: CodeEditorInstance | null = null;

	constructor(
		app: App,
		public plugin: CodeFilesPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		// Clean up previous Monaco editor if it exists
		if (this.codeEditor) {
			this.codeEditor.destroy();
			this.codeEditor = null;
		}

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Code Files Settings' });
		containerEl.createEl('p', {
			text: 'Most editor settings (Theme, Word Wrap, Folding, Line Numbers, Minimap, Semantic & Syntax Validation) are directly accessible from the editor interface via the gear icon or the palette icon in the tab header.'
		});

		new Setting(containerEl)
			.setName('Show ribbon icon')
			.setDesc('Show the Code Files icon in the left sidebar ribbon.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRibbonIcon)
					.onChange(async (value) => {
						this.plugin.settings.showRibbonIcon = value;
						updateRibbonIcon(this.plugin);
						await this.plugin.saveSettings();
					})
			);

		// -- File Extensions --------------------------------------------------
		containerEl.createEl('h3', { text: 'File Extensions' });

		new Setting(containerEl)
			.setName('Use extended extensions list')
			.setDesc(
				'Register a broad curated list of extensions. Each mode (manual/extended) keeps its own independent list when toggling.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allExtensions)
					.onChange(async (value) => {
						this.plugin.settings.allExtensions = value;
						// When switching from extended to manual mode, merge extraExtensions into extensions
						if (!value) {
							for (const ext of this.plugin.settings.extraExtensions) {
								if (!this.plugin.settings.extensions.includes(ext))
									this.plugin.settings.extensions.push(ext);
							}
							this.plugin.settings.extraExtensions = [];
						}
						await reregisterExtensions(this.plugin);
						this.display();
					})
			);

		new Setting(containerEl)
			.setName('Manage extensions')
			.setDesc(
				'Extensions registered with Obsidian. ' +
					'Adding an extension makes files with that extension open in Monaco. ' +
					'Removing one hands them back to Obsidian.'
			)
			.addButton((btn) => {
				btn.setButtonText('Add / Remove').onClick(() => {
					new ChooseExtensionModal(this.plugin, () => this.display()).open();
				});
			});

		containerEl.createEl('p', {
			text:
				'Active: ' +
				(getActiveExtensions(this.plugin.settings).sort().join(', ') || 'none'),
			attr: {
				style: 'margin: -10px 0 16px 0; color: var(--text-muted); font-size: 0.9em;'
			}
		});

		new Setting(containerEl)
			.setName('Maximum file size')
			.setDesc(
				'Maximum file size in MB for opening files in Monaco (default: 10 MB)'
			)
			.addText((text) =>
				text
					.setPlaceholder('10')
					.setValue(String(this.plugin.settings.maxFileSize))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0 && num <= 100) {
							this.plugin.settings.maxFileSize = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// -- Formatter Config -------------------------------------------------
		containerEl.createEl('h3', { text: 'Editor Config' });
		containerEl.createEl('p', {
			text: 'Per-extension editor options (tabSize, insertSpaces, formatOnSave, formatOnType, and any Monaco IEditorOptions).',
			attr: {
				style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;'
			}
		});

		const extensions = getActiveExtensions(this.plugin.settings);
		let selectedExt = this.plugin.settings.lastSelectedConfigExtension || '';
		let isGlobal = !selectedExt;

		// Scope buttons row
		const scopeRow = containerEl.createEl('div', {
			attr: {
				style: 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;'
			}
		});

		const btnGlobal = scopeRow.createEl('button', {
			text: 'Global (*)',
			cls: 'mod-cta'
		});
		btnGlobal.style.flex = '0 0 auto';

		const btnExt = scopeRow.createEl('button', {
			text: 'ext?',
			cls: ''
		});
		btnExt.style.flex = '0 0 auto';
		btnExt.disabled = true;

		scopeRow.createEl('span', {
			text: 'Choose a specific ext:',
			attr: {
				style: 'margin-left: auto; margin-right: 8px; color: var(--text-muted); font-size: 0.9em;'
			}
		});

		const extInput = new TextComponent(scopeRow);
		extInput.setPlaceholder('Type extension...');
		extInput.inputEl.style.width = '150px';

		// Monaco editor container
		const editorContainer = containerEl.createEl('div', {
			attr: {
				style: 'border: 1px solid var(--background-modifier-border); border-radius: 4px; overflow: hidden; height: 190px; margin-top: 8px;'
			}
		});

		const debouncedSave = debounce(
			async () => {
				if (!this.codeEditor) return;
				const value = this.codeEditor.getValue().trim();
				const key = isGlobal ? '*' : selectedExt;
				if (saveEditorConfig(this.plugin, key, value)) {
					await this.plugin.saveSettings();
					broadcastEditorConfig(this.plugin, key);
					this.plugin.app.workspace.trigger('code-files:settings-changed');
				}
			},
			600,
			true
		);

		const switchScope = async (global: boolean, ext?: string): Promise<void> => {
			isGlobal = global;
			if (!global && ext) {
				selectedExt = ext;
				// Save the selected extension
				this.plugin.settings.lastSelectedConfigExtension = ext;
				await this.plugin.saveSettings();
			} else if (global) {
				// Clear saved extension when switching to global
				this.plugin.settings.lastSelectedConfigExtension = '';
				await this.plugin.saveSettings();
			}

			// Update button states
			if (global) {
				btnGlobal.classList.add('mod-cta');
				btnExt.classList.remove('mod-cta');
			} else {
				btnGlobal.classList.remove('mod-cta');
				btnExt.classList.add('mod-cta');
				btnExt.setText(`.${selectedExt}`);
				btnExt.disabled = false;
			}

			// Load the appropriate config
			const key = global ? '*' : selectedExt;
			const cfg = this.plugin.settings.editorConfigs?.[key];
			const defaultCfg = global ? DEFAULT_EDITOR_CONFIG : DEFAULT_EXTENSION_CONFIG;
			if (this.codeEditor) {
				this.codeEditor.setValue(cfg ?? defaultCfg);
			}
		};

		btnGlobal.addEventListener('click', () => switchScope(true));
		btnExt.addEventListener('click', () => {
			if (selectedExt) switchScope(false, selectedExt);
		});

		const showExt = async (ext: string): Promise<void> => {
			if (!ext) return;
			await switchScope(false, ext);
			extInput.setValue('');
		};

		new ExtensionSuggest(this.plugin, extInput.inputEl, showExt, () => extensions);

		// Initialize Monaco editor
		void (async () => {
			const { mountCodeEditor } = await import('../editor/mountCodeEditor.ts');
			this.codeEditor = await mountCodeEditor(
				this.plugin,
				'json',
				DEFAULT_EDITOR_CONFIG,
				'settings-editor-config.jsonc',
				containerEl,
				() => debouncedSave(),
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				false // autoFocus: false to prevent focus on settings tab open
			);
			editorContainer.append(this.codeEditor.iframe);
			// Restore last selected extension or default to global
			if (selectedExt && extensions.includes(selectedExt)) {
				await switchScope(false, selectedExt);
			} else {
				await switchScope(true);
			}
		})();

		// -- Project Root Folder Color --------------------------------------------
		containerEl.createEl('h3', { text: 'Project Root Folder' });

		const colorSetting = new Setting(containerEl)
			.setName('Folder highlight color')
			.setDesc(
				'Color used to highlight the project root folder in the file explorer. Leave default to use violet (#c644cf).'
			);

		const colorInput = colorSetting.controlEl.createEl('input');
		colorInput.type = 'color';
		colorInput.value = this.plugin.settings.projectRootFolderColor || '#c644cf';
		colorInput.style.marginRight = '8px';
		colorInput.style.cursor = 'pointer';

		colorInput.addEventListener('input', async () => {
			this.plugin.settings.projectRootFolderColor = colorInput.value;
			await this.plugin.saveSettings();
			updateProjectFolderHighlight(this.plugin);
		});

		colorSetting.addButton((btn) =>
			btn.setButtonText('Reset').onClick(async () => {
				this.plugin.settings.projectRootFolderColor = '';
				colorInput.value = '#c644cf';
				await this.plugin.saveSettings();
				updateProjectFolderHighlight(this.plugin);
			})
		);
	}
}
