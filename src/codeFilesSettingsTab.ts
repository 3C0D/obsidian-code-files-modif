import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { themes } from './themes.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';

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
			.setName('File Extensions')
			.setDesc(
				'Files with these extensions will be opened with the Monaco editor. ' +
				'Changes require a restart to take effect.'
			)
			.addButton((btn) => {
				btn.setButtonText('Add / Remove').onClick(() => {
					new ChooseExtensionModal(this.plugin, () => this.display()).open();
				});
			});

		// Display current extensions list below the setting
		containerEl.createEl('p', {
			text: `Active: ${this.plugin.settings.extensions.join(', ') || 'none'}`,
			attr: { style: 'margin: -10px 0 16px 0; color: var(--text-muted); font-size: 0.9em;' }
		});

		new Setting(containerEl)
			.setName('Folding')
			.setDesc('Editor will support code block folding.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.folding).onChange(async (value) => {
					this.plugin.settings.folding = value;
					await this.plugin.saveSettings();
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
					})
			);

		new Setting(containerEl)
			.setName('Minimap')
			.setDesc('Editor will show a minimap.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.minimap).onChange(async (value) => {
					this.plugin.settings.minimap = value;
					await this.plugin.saveSettings();
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
					})
			);
	}
}
