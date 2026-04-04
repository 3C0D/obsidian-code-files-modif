import type { App } from 'obsidian';
import { debounce, PluginSettingTab, Setting, TextAreaComponent, TextComponent } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';
import { DEFAULT_EDITOR_CONFIG } from './types.ts';
import { ExtensionSuggest } from './extensionSuggest.ts';

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
			.setName('Use extended extensions list')
			.setDesc('Register a broad curated list of extensions. Each mode (manual/extended) keeps its own independent list when toggling.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allExtensions)
					.onChange(async (value) => {
						this.plugin.settings.allExtensions = value;
						if (!value) {
							for (const ext of this.plugin.settings.extraExtensions) {
								if (!this.plugin.settings.extensions.includes(ext))
									this.plugin.settings.extensions.push(ext);
							}
							this.plugin.settings.extraExtensions = [];
						}
						await this.plugin.reregisterExtensions();
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
			text: 'Active: ' + (this.plugin.getActiveExtensions().sort().join(', ') || 'none'),
			attr: { style: 'margin: -10px 0 16px 0; color: var(--text-muted); font-size: 0.9em;' }
		});

		// -- Formatter Config -------------------------------------------------
		containerEl.createEl('h3', { text: 'Editor Config' });
		containerEl.createEl('p', {
			text: 'Per-extension editor options (tabSize, insertSpaces, formatOnSave, formatOnType, and any Monaco IEditorOptions).',
			attr: { style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;' }
		});

		const extensions = this.plugin.getActiveExtensions();
		let selectedExt = '';

		const extInput = new TextComponent(containerEl);
		extInput.setPlaceholder('Type or select an extension...');
		extInput.inputEl.style.width = '100%';
		extInput.inputEl.style.marginBottom = '8px';

		const extLabel = containerEl.createEl('p', {
			attr: { style: 'font-size: 0.85em; color: var(--text-muted); margin-bottom: 4px;' }
		});
		extLabel.setText('Editor Config - select an extension above');

		const textarea = new TextAreaComponent(containerEl);
		textarea.inputEl.style.width = '100%';
		textarea.inputEl.style.height = '120px';
		textarea.inputEl.style.fontFamily = 'monospace';
		textarea.inputEl.style.fontSize = '0.85em';
		textarea.inputEl.style.opacity = '0.6';
		textarea.setValue(DEFAULT_EDITOR_CONFIG);
		textarea.inputEl.disabled = true;

		const updateLabel = (ext: string): void => {
			extLabel.setText(`Editor Config - .${ext}`);
		};

		const showExt = (ext: string): void => {
			selectedExt = ext;
			const existing = this.plugin.settings.editorConfigs?.[ext];
			updateLabel(ext);
			textarea.setValue(existing ?? DEFAULT_EDITOR_CONFIG);
			textarea.inputEl.disabled = false;
			textarea.inputEl.style.opacity = '1';
		};

		new ExtensionSuggest(this.plugin, extInput.inputEl, showExt, () => extensions);

		const debouncedSave = debounce(async () => {
			if (!selectedExt) return;
			const val = textarea.getValue().trim();
			try {
				JSON.parse(val);
				if (val === DEFAULT_EDITOR_CONFIG.trim()) {
					delete this.plugin.settings.editorConfigs[selectedExt];
				} else {
					this.plugin.settings.editorConfigs[selectedExt] = val;
				}
				await this.plugin.saveSettings();
				this.plugin.broadcastEditorConfig(selectedExt);
				updateLabel(selectedExt);
			} catch {
				// invalid JSON - wait for valid input
			}
		}, 600, true);

		textarea.inputEl.addEventListener('input', () => debouncedSave());
	}
}
