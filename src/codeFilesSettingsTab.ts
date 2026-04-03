import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { themes } from './themes.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';
import { FormatterConfigModal } from './formatterConfigModal.ts';
import { getAllMonacoExtensions } from './getLanguage.ts';
import { OBSIDIAN_NATIVE_EXTENSIONS } from './types.ts';

export class CodeFilesSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		public plugin: CodeFilesPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Code Files Settings' });
		containerEl.createEl('p', {
			text: 'If you change any settings, you need to reopen already opened files for the changes to take effect.'
		});

		new Setting(containerEl)
			.setName('Theme')
			.setDesc(
				'Theme of the editor, defaults to dark or light based on the current editor theme.'
			)
			.addDropdown((dropdown) => {
				dropdown.addOption('default', 'Default');
				for (const theme of themes) {
					dropdown.addOption(theme, theme);
				}
				dropdown.setValue(this.plugin.settings.theme).onChange(async (value) => {
					this.plugin.settings.theme = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Overwrite background with Obsidian background')
			.setDesc(
				'Always use the background of Obsidian as background, instead of the theme default background.' +
					" It's recommended to turn this off if you are using" +
					' custom themes. Disable this if the text colors are illegible on Obsidians background.'
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.overwriteBg).onChange(async (v) => {
					this.plugin.settings.overwriteBg = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Show ribbon icon')
			.setDesc('Show the Code Files icon in the left sidebar ribbon.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRibbonIcon)
					.onChange(async (value) => {
						this.plugin.settings.showRibbonIcon = value;
						this.plugin.updateRibbonIcon();
						await this.plugin.saveSettings();
					})
			);

		// ── File Extensions ───────────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'File Extensions' });

		new Setting(containerEl)
			.setName('Use all Monaco extensions')
			.setDesc(
				'Automatically register all extensions supported by Monaco, minus the excluded list below.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allExtensions)
					.onChange(async (value) => {
						this.plugin.settings.allExtensions = value;
						await this.plugin.saveSettings();
						await this.plugin.reregisterExtensions();
						this.display();
					})
			);

		if (this.plugin.settings.allExtensions) {
			// ── Excluded extensions ───────────────────────────────────────────
			containerEl.createEl('p', {
				text: 'Excluded extensions (will not open in Monaco):',
				attr: {
					style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 4px;'
				}
			});

			const excluded = this.plugin.settings.excludedExtensions;

			const tagContainer = containerEl.createDiv({
				attr: {
					style: 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;'
				}
			});
			for (const ext of [...excluded].sort()) {
				const tag = tagContainer.createEl('span', {
					attr: {
						style:
							'background: var(--background-modifier-border); ' +
							'border-radius: 4px; padding: 2px 8px; font-size: 0.85em; ' +
							'cursor: pointer; display: flex; align-items: center; gap: 4px;'
					}
				});
				tag.createSpan({ text: ext });
				const removeBtn = tag.createEl('span', {
					text: '×',
					attr: { style: 'font-weight: bold; margin-left: 4px;' }
				});
				removeBtn.addEventListener('click', async () => {
					this.plugin.settings.excludedExtensions = excluded.filter(
						(e) => e !== ext
					);
					await this.plugin.saveSettings();
					await this.plugin.reregisterExtensions();
					this.display();
				});
			}

			let addInput = '';
			new Setting(containerEl)
				.setName('Add exclusion')
				.setDesc(
					'Extension to exclude from Monaco (without dot). Press Enter or click Add.'
				)
				.addText((text) => {
					text.setPlaceholder('e.g. svg');
					text.onChange((v) => {
						addInput = v;
					});
					text.inputEl.addEventListener('keydown', async (e) => {
						if (e.key === 'Enter') {
							const val = addInput.trim().toLowerCase().replace(/^\./, '');
							if (val && !excluded.includes(val)) {
								this.plugin.settings.excludedExtensions.push(val);
								await this.plugin.saveSettings();
								await this.plugin.reregisterExtensions();
								this.display();
							}
						}
					});
				})
				.addButton((btn) =>
					btn.setButtonText('Add').onClick(async () => {
						const val = addInput.trim().toLowerCase().replace(/^\./, '');
						if (val && !excluded.includes(val)) {
							this.plugin.settings.excludedExtensions.push(val);
							await this.plugin.saveSettings();
							await this.plugin.reregisterExtensions();
							this.display();
						}
					})
				);

			containerEl.createEl('p', {
				text: `Active: ${getAllMonacoExtensions(excluded).length} extensions registered`,
				attr: {
					style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;'
				}
			});
		} else {
			new Setting(containerEl)
				.setName('Manage extensions')
				.setDesc(
					'Extensions registered with Obsidian. ' +
						'Adding an extension makes files with that extension open in Monaco. ' +
						'Removing one hands them back to Obsidian.'
				)
				.addButton((btn) => {
					btn.setButtonText('Add / Remove').onClick(() => {
						new ChooseExtensionModal(this.plugin, () =>
							this.display()
						).open();
					});
				});

			containerEl.createEl('p', {
				text: `Active: ${this.plugin.settings.extensions.join(', ') || 'none'}`,
				attr: {
					style: 'margin: -10px 0 16px 0; color: var(--text-muted); font-size: 0.9em;'
				}
			});
		}

		new Setting(containerEl)
			.setName('Folding')
			.setDesc('Editor will support code block folding.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.folding).onChange(async (value) => {
					this.plugin.settings.folding = value;
					await this.plugin.saveSettings();
					this.plugin.broadcastOptions();
				})
			);

		new Setting(containerEl)
			.setName('Line Numbers')
			.setDesc('Editor will show line numbers.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lineNumbers)
					.onChange(async (value) => {
						this.plugin.settings.lineNumbers = value;
						await this.plugin.saveSettings();
						this.plugin.broadcastOptions();
					})
			);

		new Setting(containerEl)
			.setName('Minimap')
			.setDesc('Editor will show a minimap.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.minimap).onChange(async (value) => {
					this.plugin.settings.minimap = value;
					await this.plugin.saveSettings();
					this.plugin.broadcastOptions();
				})
			);

		new Setting(containerEl)
			.setName('Semantic Validation')
			.setDesc('Editor will show semantic validation errors.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.semanticValidation)
					.onChange(async (value) => {
						this.plugin.settings.semanticValidation = value;
						await this.plugin.saveSettings();
						this.plugin.broadcastOptions();
					})
			);

		new Setting(containerEl)
			.setName('Syntax Validation')
			.setDesc('Editor will show syntax validation errors.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syntaxValidation)
					.onChange(async (value) => {
						this.plugin.settings.syntaxValidation = value;
						await this.plugin.saveSettings();
						this.plugin.broadcastOptions();
					})
			);

		// ── Formatter Config ──────────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'Formatter Config' });
		containerEl.createEl('p', {
			text: 'Configure Monaco formatter options per extension (tabSize, insertSpaces, formatOnSave, formatOnType).',
			attr: {
				style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;'
			}
		});

		const extensions = this.plugin.settings.extensions;
		for (const ext of extensions) {
			const hasConfig = !!this.plugin.settings.formatterConfigs?.[ext];
			new Setting(containerEl)
				.setName(`.${ext}`)
				.setDesc(hasConfig ? 'Custom config' : 'Using defaults')
				.addButton((btn) => {
					btn.setButtonText('Edit')
						.setIcon('settings')
						.onClick(() => {
							new FormatterConfigModal(this.plugin, ext).open();
						});
				});
		}
	}
}
