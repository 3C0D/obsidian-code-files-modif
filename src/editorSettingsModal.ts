import { Modal, Setting, debounce } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { DEFAULT_EDITOR_CONFIG, parseEditorConfig } from './types.ts';
import type { CodeEditorInstance } from './types.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';

/** Unified editor settings modal — toggles for global editor options + Monaco JSON editor for formatter config.
 *  Opened via the gear icon in the tab header of code-editor views. */
export class EditorSettingsModal extends Modal {
	private codeEditor!: CodeEditorInstance;
	private isGlobal = false;

	constructor(
		private plugin: CodeFilesPlugin,
		private extension: string,
		private onSettingsChanged: () => void,
		private onFormatterSaved: (config: string) => void
	) {
		super(plugin.app);
	}

	private applyFormatterValue(value: string): boolean {
		const key = this.isGlobal ? '*' : this.extension;
		try {
			parseEditorConfig(value);
			if (value === DEFAULT_EDITOR_CONFIG.trim()) {
				delete this.plugin.settings.editorConfigs[key];
			} else {
				this.plugin.settings.editorConfigs[key] = value;
			}
			return true;
		} catch {
			return false;
		}
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		setTimeout(() => {
			const bg = document.querySelector<HTMLElement>('.modal-bg');
			if (bg) bg.style.opacity = '0';
		}, 0);
		this.titleEl.setText('Editor Settings');
		this.modalEl.style.width = '560px';
		this.modalEl.style.height = '700px';
		this.modalEl.style.position = 'fixed';
		setTimeout(() => {
			const { innerWidth } = window;
			const { offsetWidth } = this.modalEl;
			const desiredLeft = innerWidth * 0.65;
			if (desiredLeft + offsetWidth / 2 > innerWidth - 10) {
				this.modalEl.style.left = '50%';
			} else {
				this.modalEl.style.left = '65%';
			}
			this.modalEl.style.top = '10%';
			this.modalEl.style.transform = 'translateX(-50%)';
		}, 0);

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

		new Setting(toggleSection)
			.setName('Editor Brightness')
			.setDesc('Adjust Monaco editor brightness (0.2 – 2.0)')
			.addSlider((s) =>
				s
					.setLimits(0.2, 2, 0.1)
					.setValue(this.plugin.settings.editorBrightness)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.editorBrightness = v;
						await this.plugin.saveSettings();
						this.plugin.broadcastBrightness();
					})
			);

		// ── Formatter Config ──────────────────────────────────────────────────
		const formatterSection = contentEl.createEl('div', {
			cls: 'code-files-editor-config-section'
		});
		formatterSection.style.marginTop = '1rem';
		formatterSection.style.flex = '1';
		formatterSection.style.display = 'flex';
		formatterSection.style.flexDirection = 'column';

		formatterSection.createEl('hr', { attr: { style: 'margin: 0 0 0.5rem 0; border: none; border-top: 1px solid var(--background-modifier-border);' } });

		const configTitle = new Setting(formatterSection)
			.setName(`Editor Config — .${this.extension}`)
			.setDesc('Applied to this extension only')
			.addToggle((t) =>
				t.setValue(this.isGlobal).onChange((v) => {
					this.isGlobal = v;
					const key = v ? '*' : this.extension;
					configTitle.setName(v ? 'Editor Config — *' : `Editor Config — .${this.extension}`);
					configTitle.setDesc(v ? 'Applied to all extensions' : 'Applied to this extension only');
					const cfg = this.plugin.settings.editorConfigs?.[key];
					this.codeEditor.setValue(cfg ?? DEFAULT_EDITOR_CONFIG);
				})
			);

		const editorContainer = formatterSection.createEl('div', {
			cls: 'code-files-editor-config-editor'
		});
		editorContainer.style.border = '1px solid var(--background-modifier-border)';
		editorContainer.style.marginTop = '8px';
		editorContainer.style.borderRadius = '4px';
		editorContainer.style.overflow = 'hidden';
		editorContainer.style.flex = '1';

		const existing = this.plugin.settings.editorConfigs[this.extension];
		const initialValue = existing ?? DEFAULT_EDITOR_CONFIG;

		const debouncedSave = debounce(
			async () => {
				if (!this.codeEditor) return;
				const value = this.codeEditor.getValue().trim();
				if (this.applyFormatterValue(value)) {
					await this.plugin.saveSettings();
					this.plugin.broadcastEditorConfig(this.extension);
				}
			},
			600,
			true
		);

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			'jsonc',
			initialValue,
			`editor-settings-formatter-${this.extension}`,
			() => debouncedSave()
		);
		editorContainer.append(this.codeEditor.iframe);

		// Save button removed - config is saved on close
	}

	onClose(): void {
		super.onClose();
		const bg = document.querySelector<HTMLElement>('.modal-bg');
		if (bg) bg.style.opacity = '';
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
