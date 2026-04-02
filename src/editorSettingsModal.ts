import { Modal, Setting, ButtonComponent } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { DEFAULT_FORMATTER_CONFIG } from './types.ts';
import type { CodeEditorInstance } from './types.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';

/** Unified editor settings modal — toggles for global editor options + Monaco JSON editor for formatter config.
 *  Opened via the gear icon in the tab header of code-editor views. */
export class EditorSettingsModal extends Modal {
	private codeEditor: CodeEditorInstance;

	constructor(
		private plugin: CodeFilesPlugin,
		private extension: string,
		private onSettingsChanged: () => void,
		private onFormatterSaved: (config: string) => void
	) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		this.titleEl.setText('Editor Settings');
		this.modalEl.style.width = '560px';
		this.modalEl.style.height = '600px';

		const { contentEl } = this;
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.height = 'calc(100% - 40px)';

		// ── Toggles ──────────────────────────────────────────────────────────
		const toggleSection = contentEl.createEl('div', { cls: 'code-files-settings-toggles' });

		new Setting(toggleSection)
			.setName('Auto Save')
			.setDesc('If off, only Ctrl+S saves the file.')
			.addToggle((t) => t.setValue(this.plugin.settings.autoSave).onChange(async (v) => {
				this.plugin.settings.autoSave = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			}));

		new Setting(toggleSection)
			.setName('Word Wrap')
			.addToggle((t) => t.setValue(this.plugin.settings.wordWrap === 'on').onChange(async (v) => {
				this.plugin.settings.wordWrap = v ? 'on' : 'off';
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			}));

		new Setting(toggleSection)
			.setName('Folding')
			.addToggle((t) => t.setValue(this.plugin.settings.folding).onChange(async (v) => {
				this.plugin.settings.folding = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			}));

		new Setting(toggleSection)
			.setName('Line Numbers')
			.addToggle((t) => t.setValue(this.plugin.settings.lineNumbers).onChange(async (v) => {
				this.plugin.settings.lineNumbers = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			}));

		new Setting(toggleSection)
			.setName('Minimap')
			.addToggle((t) => t.setValue(this.plugin.settings.minimap).onChange(async (v) => {
				this.plugin.settings.minimap = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			}));

		new Setting(toggleSection)
			.setName('Semantic Validation')
			.setDesc('Type errors for JS/TS.')
			.addToggle((t) => t.setValue(this.plugin.settings.semanticValidation).onChange(async (v) => {
				this.plugin.settings.semanticValidation = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			}));

		new Setting(toggleSection)
			.setName('Syntax Validation')
			.setDesc('Syntax errors for JS/TS.')
			.addToggle((t) => t.setValue(this.plugin.settings.syntaxValidation).onChange(async (v) => {
				this.plugin.settings.syntaxValidation = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			}));

		// ── Formatter Config ──────────────────────────────────────────────────
		const formatterSection = contentEl.createEl('div', { cls: 'code-files-formatter-section' });
		formatterSection.createEl('div', {
			text: `Formatter — .${this.extension}`,
			cls: 'code-files-formatter-title'
		});

		const editorContainer = formatterSection.createEl('div', { cls: 'code-files-formatter-editor' });

		const existing = this.plugin.settings.formatterConfigs[this.extension];
		const initialValue = existing ?? DEFAULT_FORMATTER_CONFIG;

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			'json',
			initialValue,
			`editor-settings-formatter-${this.extension}`
		);
		editorContainer.append(this.codeEditor.iframe);

		// Save button
		const footer = this.modalEl.createEl('div', { cls: 'code-files-settings-footer' });
		new ButtonComponent(footer)
			.setButtonText('Save Formatter')
			.setCta()
			.onClick(() => this.saveFormatter());
	}

	onClose(): void {
		super.onClose();
		this.codeEditor?.destroy();
		this.contentEl.empty();
	}

	private async saveFormatter(): Promise<void> {
		const value = this.codeEditor.getValue().trim();
		try {
			JSON.parse(value);
			this.plugin.settings.formatterConfigs[this.extension] = value;
			await this.plugin.saveSettings();
			this.onFormatterSaved(value);
			this.close();
		} catch {
			const existing = this.modalEl.querySelector('.code-files-formatter-error') as HTMLElement;
			if (existing) {
				existing.textContent = 'Invalid JSON — please fix before saving.';
			} else {
				this.modalEl.createEl('p', {
					text: 'Invalid JSON — please fix before saving.',
					cls: 'code-files-formatter-error',
					attr: { style: 'color: var(--text-error); padding: 0 16px;' }
				});
			}
		}
	}
}
