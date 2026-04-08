import { ButtonComponent, Modal, Setting, debounce } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
	DEFAULT_EDITOR_CONFIG,
	DEFAULT_EXTENSION_CONFIG,
	parseEditorConfig
} from '../types/types.ts';
import type { CodeEditorInstance } from '../types/types.ts';
import { mountCodeEditor } from '../editor/mountCodeEditor.ts';
import { getCodeEditorViews } from '../utils/extensionUtils.ts';
import { buildMergedConfig } from '../utils/settingsUtils.ts';
import { FolderSuggest } from '../ui/folderSuggest.ts';

/** Unified editor settings modal — toggles for global editor options + Monaco JSON editor for formatter config.
 *  Opened via the gear icon in the tab header of code-editor views. */
export class EditorSettingsModal extends Modal {
	private codeEditor!: CodeEditorInstance;
	private isGlobal = false;

	constructor(
		private plugin: CodeFilesPlugin,
		private extension: string,
		private onSettingsChanged: () => void,
		private onConfigApplied: (config: string) => void
	) {
		super(plugin.app);
	}

	private applyFormatterValue(value: string): boolean {
		const key = this.isGlobal ? '*' : this.extension;
		const defaultForKey = this.isGlobal
			? DEFAULT_EDITOR_CONFIG
			: DEFAULT_EXTENSION_CONFIG;
		try {
			parseEditorConfig(value);
			if (key !== '*' && value === defaultForKey.trim()) {
				// Only delete overrides, never
				// the global '*' key.
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
			// Remove all semi-transparent overlays so the editor remains fully visible
			const backgrounds = document.querySelectorAll<HTMLElement>('.modal-bg');
			backgrounds.forEach((bg) => (bg.style.opacity = '0'));
		}, 0);
		this.titleEl.setText('Editor Settings');
		this.modalEl.style.width = '560px';
		this.modalEl.style.minHeight = '400px';
		this.modalEl.style.maxHeight = '90vh';
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
					for (const view of getCodeEditorViews(this.app)) {
						// Duck typing avoids the circular import between editorSettingsModal and codeEditorView,
						// which esbuild resolves in the wrong order and leaves the class undefined at runtime.
						if (!('clearDirty' in view)) continue;
						if (v) {
							view.clearDirty();
						}
						view.updateDirtyBadgeVisibility();
					}
					this.onSettingsChanged();
				})
			);

		const isJsTs = ['js', 'ts', 'jsx', 'tsx'].includes(this.extension);

		if (isJsTs) {
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
					t
						.setValue(this.plugin.settings.syntaxValidation)
						.onChange(async (v) => {
							this.plugin.settings.syntaxValidation = v;
							await this.plugin.saveSettings();
							this.onSettingsChanged();
						})
				);
		}

		new Setting(toggleSection)
			.setName('Editor Brightness')
			.setDesc('Adjust Monaco editor brightness (0.2 – 2.0)')
			.addSlider((s) => {
				s.setLimits(0.2, 2, 0.1)
					.setValue(this.plugin.settings.editorBrightness)
					.setDynamicTooltip()
					.onChange(async (v) => {
						// this.plugin.settings.editorBrightness = v; — moved to input listener
						await this.plugin.saveSettings();
						// this.plugin.broadcastBrightness(); — moved to input listener
					});
				// Apply brightness in real-time while dragging
				s.sliderEl.addEventListener('input', () => {
					const value = parseFloat(s.sliderEl.value);
					this.plugin.settings.editorBrightness = value;
					this.plugin.broadcastBrightness();
				});
			});

		new Setting(toggleSection)
			.setName('Project Root Folder')
			.setDesc('Base folder for inter-file navigation and imports resolution')
			.addText((text) => {
				text.setPlaceholder('e.g., my-project')
					.setValue(this.plugin.settings.projectRootFolder)
					.onChange(async (value) => {
						this.plugin.settings.projectRootFolder = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.broadcastProjectFiles();
					});
				new FolderSuggest(this.plugin, text.inputEl, async (folder) => {
					this.plugin.settings.projectRootFolder = folder.path;
					await this.plugin.saveSettings();
					await this.plugin.broadcastProjectFiles();
				});
			});

		// ── Formatter Config ──────────────────────────────────────────────────
		const formatterSection = contentEl.createEl('div', {
			cls: 'code-files-editor-config-section'
		});
		formatterSection.style.marginTop = '1rem';
		formatterSection.style.display = 'flex';
		formatterSection.style.flexDirection = 'column';

		formatterSection.createEl('hr', {
			attr: {
				style: 'margin: 0 0 0.5rem 0; border: none; border-top: 1px solid var(--background-modifier-border);'
			}
		});

		const scopeRow = formatterSection.createEl('div', {
			attr: { style: 'display: flex; gap: 8px; margin-bottom: 6px;' }
		});
		const btnGlobal = new ButtonComponent(scopeRow).setButtonText('Global (*)');
		const btnExt = new ButtonComponent(scopeRow).setButtonText(`.${this.extension}`);

		const configTitle = formatterSection.createEl('div', {
			text: `Editor Config — .${this.extension}`,
			cls: 'code-files-editor-config-title'
		});

		const switchScope = (global: boolean): void => {
			this.isGlobal = global;
			if (global) {
				btnGlobal.setCta();
				btnExt.buttonEl.removeClass('mod-cta');
				configTitle.setText('Editor Config — *');
			} else {
				btnExt.setCta();
				btnGlobal.buttonEl.removeClass('mod-cta');
				configTitle.setText(`Editor Config — .${this.extension}`);
			}
			const cfg =
				this.plugin.settings.editorConfigs?.[global ? '*' : this.extension];
			if (this.codeEditor)
				this.codeEditor.setValue(
					cfg ?? (global ? DEFAULT_EDITOR_CONFIG : DEFAULT_EXTENSION_CONFIG)
				);
		};

		btnGlobal.onClick(() => switchScope(true));
		btnExt.onClick(() => switchScope(false));
		switchScope(false);

		const editorContainer = formatterSection.createEl('div', {
			cls: 'code-files-editor-config-editor'
		});
		editorContainer.style.border = '1px solid var(--background-modifier-border)';
		editorContainer.style.marginTop = '8px';
		editorContainer.style.borderRadius = '4px';
		editorContainer.style.overflow = 'hidden';
		editorContainer.style.flex = '0 0 auto';
		editorContainer.style.height = 'auto';
		editorContainer.style.minHeight = '200px';

		const existing = this.plugin.settings.editorConfigs[this.extension];
		const initialValue = existing ?? DEFAULT_EXTENSION_CONFIG;

		const debouncedSave = debounce(
			async () => {
				if (!this.codeEditor) return;
				const value = this.codeEditor.getValue().trim();
				if (this.applyFormatterValue(value)) {
					await this.plugin.saveSettings();
					this.plugin.broadcastEditorConfig(
						this.isGlobal ? '*' : this.extension
					);
				}
			},
			600,
			true
		);

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			'json',
			initialValue,
			`editor-settings-config.jsonc`,
			() => debouncedSave()
		);
		editorContainer.append(this.codeEditor.iframe);

		// Save button removed - config is saved on close
	}

	onClose(): void {
		super.onClose();
		const backgrounds = document.querySelectorAll<HTMLElement>('.modal-bg');
		backgrounds.forEach((bg) => (bg.style.opacity = ''));
		if (this.codeEditor) {
			const raw = this.codeEditor.getValue().trim();
			if (this.applyFormatterValue(raw)) {
				void this.plugin.saveSettings();
				// Send the MERGED config
				// (global + ext) so the iframe
				// keeps inherited settings like
				// formatOnSave.
				this.onConfigApplied(buildMergedConfig(this.plugin, this.extension));
			}
			this.codeEditor.destroy();
		}
		this.contentEl.empty();
	}
}
