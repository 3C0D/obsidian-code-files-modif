import type { App } from 'obsidian';
import { AbstractInputSuggest, debounce, PluginSettingTab, Setting, TextAreaComponent, TextComponent } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';
import { getAllMonacoExtensions } from './getLanguage.ts';
import { DEFAULT_FORMATTER_CONFIG } from './types.ts';

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
						this.plugin.updateRibbonIcon();
						await this.plugin.saveSettings();
					})
			);

		// -- File Extensions --------------------------------------------------
		containerEl.createEl('h3', { text: 'File Extensions' });

		new Setting(containerEl)
			.setName('Use all Monaco extensions')
			.setDesc('Automatically register all extensions supported by Monaco, minus the excluded list below.')
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
			containerEl.createEl('p', {
				text: 'Excluded extensions (will not open in Monaco):',
				attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 4px;' }
			});

			const excluded = this.plugin.settings.excludedExtensions;

			const tagContainer = containerEl.createDiv({
				attr: { style: 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;' }
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
					text: 'x',
					attr: { style: 'font-weight: bold; margin-left: 4px;' }
				});
				removeBtn.addEventListener('click', async () => {
					this.plugin.settings.excludedExtensions = excluded.filter((e) => e !== ext);
					await this.plugin.saveSettings();
					await this.plugin.reregisterExtensions();
					this.display();
				});
			}

			let addInput = '';
			new Setting(containerEl)
				.setName('Add exclusion')
				.setDesc('Extension to exclude from Monaco (without dot). Press Enter or click Add.')
				.addText((text) => {
					text.setPlaceholder('e.g. svg');
					text.onChange((v) => { addInput = v; });
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
				attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;' }
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
						new ChooseExtensionModal(this.plugin, () => this.display()).open();
					});
				});

			containerEl.createEl('p', {
				text: `Active: ${this.plugin.settings.extensions.join(', ') || 'none'}`,
				attr: { style: 'margin: -10px 0 16px 0; color: var(--text-muted); font-size: 0.9em;' }
			});
		}

		// -- Formatter Config -------------------------------------------------
		containerEl.createEl('h3', { text: 'Formatter Config' });
		containerEl.createEl('p', {
			text: 'Per-extension formatter options (tabSize, insertSpaces, formatOnSave, formatOnType).',
			attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;' }
		});

		const extensions = this.plugin.settings.extensions;
		let selectedExt = '';

		const extInput = new TextComponent(containerEl);
		extInput.setPlaceholder('Type or select an extension...');
		extInput.inputEl.style.width = '100%';
		extInput.inputEl.style.marginBottom = '8px';

		const extLabel = containerEl.createEl('p', {
			attr: { style: 'font-size: 0.85em; color: var(--text-muted); margin-bottom: 4px;' }
		});
		extLabel.setText('Formatter - select an extension above');

		const textarea = new TextAreaComponent(containerEl);
		textarea.inputEl.style.width = '100%';
		textarea.inputEl.style.height = '120px';
		textarea.inputEl.style.fontFamily = 'monospace';
		textarea.inputEl.style.fontSize = '0.85em';
		textarea.inputEl.style.opacity = '0.6';
		textarea.setValue(DEFAULT_FORMATTER_CONFIG);
		textarea.inputEl.disabled = true;

		const updateLabel = (ext: string): void => {
			extLabel.setText(`Formatter - .${ext}`);
		};

		const showExt = (ext: string): void => {
			selectedExt = ext;
			const existing = this.plugin.settings.formatterConfigs?.[ext];
			updateLabel(ext);
			textarea.setValue(existing ?? DEFAULT_FORMATTER_CONFIG);
			textarea.inputEl.disabled = false;
			textarea.inputEl.style.opacity = '1';
		};

		new ExtensionInputSuggest(this.plugin, extInput.inputEl, extensions, showExt);

		const debouncedSave = debounce(async () => {
			if (!selectedExt) return;
			const val = textarea.getValue().trim();
			try {
				JSON.parse(val);
				if (val === DEFAULT_FORMATTER_CONFIG.trim()) {
					delete this.plugin.settings.formatterConfigs[selectedExt];
				} else {
					this.plugin.settings.formatterConfigs[selectedExt] = val;
				}
				await this.plugin.saveSettings();
				this.plugin.broadcastFormatterConfig(selectedExt);
				updateLabel(selectedExt);
			} catch {
				// invalid JSON - wait for valid input
			}
		}, 600, true);

		textarea.inputEl.addEventListener('input', () => debouncedSave());
	}
}

class ExtensionInputSuggest extends AbstractInputSuggest<string> {
	constructor(
		private plugin: CodeFilesPlugin,
		inputEl: HTMLInputElement,
		private extensions: string[],
		private onChoose: (ext: string) => void
	) {
		super(plugin.app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase().replace(/^\./, '');
		return this.extensions.filter((ext) => ext.includes(q));
	}

	renderSuggestion(ext: string, el: HTMLElement): void {
		el.setText(`.${ext}`);
	}

	selectSuggestion(ext: string): void {
		this.onChoose(ext);
		this.setValue(ext);
		this.close();
	}
}
