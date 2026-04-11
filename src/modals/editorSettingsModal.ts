import { ButtonComponent, Modal, Setting, debounce } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
	DEFAULT_EDITOR_CONFIG,
	DEFAULT_EXTENSION_CONFIG
} from '../types/types.ts';
import type { CodeEditorInstance } from '../types/types.ts';
import { mountCodeEditor } from '../editor/mountCodeEditor.ts';
import { getCodeEditorViews } from '../utils/extensionUtils.ts';
import { buildMergedConfig, applyEditorConfig } from '../utils/settingsUtils.ts';
import {
	broadcastProjectFiles,
	broadcastBrightness,
	broadcastEditorConfig
} from '../utils/broadcast.ts';
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

	async onOpen(): Promise<void> {
		super.onOpen();
		// Remove modal background overlay to keep editor fully visible
		setTimeout(() => {
			const backgrounds = document.querySelectorAll<HTMLElement>('.modal-bg');
			backgrounds.forEach((bg) => (bg.style.opacity = '0'));
		}, 0);
		this.titleEl.setText('Editor Settings');
		this.modalEl.style.width = '560px';
		this.modalEl.style.minHeight = '385px';
		this.modalEl.style.maxHeight = '90vh';
		this.modalEl.style.position = 'fixed';
		// Position modal at 65% from left if there's space, otherwise center it
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
					// Update all open code editor views to show/hide dirty badge
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
					.onChange(async () => {
						// Brightness is applied in real-time via input listener below
						await this.plugin.saveSettings();
					});
				// Apply brightness in real-time while dragging
				s.sliderEl.addEventListener('input', () => {
					const value = parseFloat(s.sliderEl.value);
					this.plugin.settings.editorBrightness = value;
					broadcastBrightness(this.plugin);
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
						await broadcastProjectFiles(this.plugin);
					});
				new FolderSuggest(this.plugin, text.inputEl, async (folder) => {
					this.plugin.settings.projectRootFolder = folder.path;
					await this.plugin.saveSettings();
					await broadcastProjectFiles(this.plugin);
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
			// Update button states and title
			if (global) {
				btnGlobal.setCta();
				btnExt.buttonEl.removeClass('mod-cta');
				configTitle.setText('Editor Config — *');
			} else {
				btnExt.setCta();
				btnGlobal.buttonEl.removeClass('mod-cta');
				configTitle.setText(`Editor Config — .${this.extension}`);
			}
			// Load the appropriate config (existing or default)
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
		editorContainer.style.height = '190px';

		const existing = this.plugin.settings.editorConfigs[this.extension];
		const initialValue = existing ?? DEFAULT_EXTENSION_CONFIG;

		const debouncedSave = debounce(
			async () => {
				if (!this.codeEditor) return;
				const value = this.codeEditor.getValue().trim();
				const key = this.isGlobal ? '*' : this.extension;
				if (applyEditorConfig(this.plugin, key, value)) {
					await this.plugin.saveSettings();
					broadcastEditorConfig(
						this.plugin,
						key
					);
					// Notify settings tab to refresh
					this.plugin.app.workspace.trigger('code-files:settings-changed');
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
			const key = this.isGlobal ? '*' : this.extension;
			if (applyEditorConfig(this.plugin, key, raw)) {
				void this.plugin.saveSettings();
				// Notify settings tab to refresh
				this.plugin.app.workspace.trigger('code-files:settings-changed');
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
