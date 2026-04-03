import { Modal, Setting, debounce } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { DEFAULT_FORMATTER_CONFIG } from './types.ts';
import type { CodeEditorInstance } from './types.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';

/** Unified editor settings modal — toggles for global editor options + Monaco JSON editor for formatter config.
 *  Opened via the gear icon in the tab header of code-editor views. */
export class EditorSettingsModal extends Modal {
	private codeEditor!: CodeEditorInstance;

	constructor(
		private plugin: CodeFilesPlugin,
		private extension: string,
		private onSettingsChanged: () => void,
		private onFormatterSaved: (config: string) => void
	) {
		super(plugin.app);
	}

	private applyFormatterValue(value: string): boolean {
		try {
			JSON.parse(value);
			if (value === DEFAULT_FORMATTER_CONFIG.trim()) {
				delete this.plugin.settings.formatterConfigs[this.extension];
			} else {
				this.plugin.settings.formatterConfigs[this.extension] = value;
			}
			return true;
		} catch {
			return false;
		}
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		this.titleEl.setText('Editor Settings');
		this.modalEl.style.width = '560px';

		const { contentEl } = this;
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';

		// ── Toggles ──────────────────────────────────────────────────────────
		const toggleSection = contentEl.createEl('div', {
			cls: 'code-files-settings-toggles'
		});

		new Setting(toggleSection)
			.setName('Auto Save')
			.setDesc('(Ctrl+S) to save when Off')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoSave).onChange(async (v) => {
					this.plugin.settings.autoSave = v;
					await this.plugin.saveSettings();
					this.onSettingsChanged();
				})
			);

		new Setting(toggleSection)
			.setName('Word Wrap')
			.setDesc('(Alt+Z)')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.wordWrap === 'on').onChange(async (v) => {
					this.plugin.settings.wordWrap = v ? 'on' : 'off';
					await this.plugin.saveSettings();
					this.onSettingsChanged();
				})
			);

		new Setting(toggleSection).setName('Folding').addToggle((t) =>
			t.setValue(this.plugin.settings.folding).onChange(async (v) => {
				this.plugin.settings.folding = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			})
		);

		new Setting(toggleSection).setName('Line Numbers').addToggle((t) =>
			t.setValue(this.plugin.settings.lineNumbers).onChange(async (v) => {
				this.plugin.settings.lineNumbers = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			})
		);

		new Setting(toggleSection).setName('Minimap').addToggle((t) =>
			t.setValue(this.plugin.settings.minimap).onChange(async (v) => {
				this.plugin.settings.minimap = v;
				await this.plugin.saveSettings();
				this.onSettingsChanged();
			})
		);

		new Setting(toggleSection)
			.setName('Semantic Validation')
			.setDesc('Type errors for JS/TS.')
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.semanticValidation)
					.onChange(async (v) => {
						this.plugin.settings.semanticValidation = v;
						await this.plugin.saveSettings();
						this.onSettingsChanged();
					})
			);

		new Setting(toggleSection)
			.setName('Syntax Validation')
			.setDesc('Syntax errors for JS/TS.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.syntaxValidation).onChange(async (v) => {
					this.plugin.settings.syntaxValidation = v;
					await this.plugin.saveSettings();
					this.onSettingsChanged();
				})
			);

		// ── Formatter Config ──────────────────────────────────────────────────
		const formatterSection = contentEl.createEl('div', {
			cls: 'code-files-formatter-section'
		});
		formatterSection.style.marginTop = '1rem';
		formatterSection.createEl('div', {
			text: `Formatter — .${this.extension}`,
			cls: 'code-files-formatter-title'
		});

		const editorContainer = formatterSection.createEl('div', {
			cls: 'code-files-formatter-editor'
		});
		editorContainer.style.height = '200px';
		editorContainer.style.border = '1px solid var(--background-modifier-border)';
		editorContainer.style.marginTop = '8px';
		editorContainer.style.borderRadius = '4px';
		editorContainer.style.overflow = 'hidden';

		const existing = this.plugin.settings.formatterConfigs[this.extension];
		const initialValue = existing ?? DEFAULT_FORMATTER_CONFIG;

		const debouncedSave = debounce(async () => {
			if (!this.codeEditor) return;
			const value = this.codeEditor.getValue().trim();
			if (this.applyFormatterValue(value)) {
				await this.plugin.saveSettings();
				this.plugin.broadcastFormatterConfig(this.extension);
			}
		}, 600, true);

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			'json',
			initialValue,
			`editor-settings-formatter-${this.extension}`,
			() => debouncedSave()
		);
		editorContainer.append(this.codeEditor.iframe);

		// Save button removed - config is saved on close
	}

	onClose(): void {
		super.onClose();
		if (this.codeEditor) {
			const value = this.codeEditor.getValue().trim();
			if (this.applyFormatterValue(value)) {
				void this.plugin.saveSettings();
				this.onFormatterSaved(value);
			}
			this.codeEditor.destroy();
		}
		this.contentEl.empty();
	}
}
