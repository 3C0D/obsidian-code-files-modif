/**
 * Unified editor settings modal with two sections:
 * 1. Toggles for global editor options (auto-save, validation, brightness, project root)
 * 2. Monaco JSON editor for per-extension or global formatter config (tabSize, formatOnSave, etc.)
 * Opened via the gear icon in the tab header. Changes are saved on close and broadcast to all open editors.
 */
import { ButtonComponent, Modal, Setting, debounce, Notice, TFolder } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
	DEFAULT_EDITOR_CONFIG,
	getExtensionConfigTemplate,
	FORMATTABLE_EXTENSIONS
} from '../types/variables.ts';
import type { CodeEditorInstance } from '../types/types.ts';
import { mountCodeEditor } from '../editor/mountCodeEditor.ts';
import { getCodeEditorViews } from '../utils/extensionUtils.ts';
import { buildMergedConfig, saveEditorConfig } from '../utils/settingsUtils.ts';
import {
	broadcastProjectFiles,
	broadcastBrightness,
	broadcastEditorConfig
} from '../utils/broadcast.ts';
import { FolderSuggest } from '../ui/folderSuggest.ts';
import { updateProjectFolderHighlight } from '../utils/explorerUtils.ts';

/** Unified editor settings modal — toggles for global editor options + Monaco JSON editor for formatter config.
 *  Opened via the gear icon in the tab header of code-editor views. */
export class EditorSettingsModal extends Modal {
	private codeEditor!: CodeEditorInstance;
	private isGlobal = false;

	/**
	 * @param plugin - The plugin instance
	 * @param extension - The file extension being edited (e.g., 'ts', 'js', 'md')
	 * @param onSettingsChanged - Callback invoked when validation toggles change. Typically broadcasts options to all open editors.
	 * @param onConfigApplied - Callback invoked on modal close with the merged editor config JSON string (global + per-extension). Use this to send the config to the Monaco iframe via postMessage.
	 * @param restoreFocus - Optional callback to restore focus to the editor after closing the modal, since Obsidian doesn't do this automatically. If not provided, focus will remain on the last clicked element in the modal.
	 */
	constructor(
		private plugin: CodeFilesPlugin,
		private extension: string,
		private onSettingsChanged: () => void,
		private onConfigApplied: (config: string) => void,
		private restoreFocus?: () => void
	) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		super.onOpen();

		// Remove modals background overlay to keep editor fully visible
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
						// Note: This is technical debt; if the architecture is refactored to remove
						// circularity, this should be replaced with a proper 'instanceof' check.
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
				text.setPlaceholder('e.g., my-project').setValue(
					this.plugin.settings.projectRootFolder
				);

				// Validate on blur (when user leaves the field)
				text.inputEl.addEventListener('blur', async () => {
					const trimmed = text.inputEl.value.trim();
					if (trimmed) {
						const folder =
							this.plugin.app.vault.getAbstractFileByPath(trimmed);
						if (!(folder instanceof TFolder)) {
							new Notice('Invalid path: folder does not exist');
							text.inputEl.value = this.plugin.settings.projectRootFolder;
							return;
						}
					}
					this.plugin.settings.projectRootFolder = trimmed;
					await this.plugin.saveSettings();
					await broadcastProjectFiles(this.plugin);
					updateProjectFolderHighlight(this.plugin);
				});

				new FolderSuggest(this.plugin, text.inputEl, async (folder) => {
					this.plugin.settings.projectRootFolder = folder.path;
					await this.plugin.saveSettings();
					await broadcastProjectFiles(this.plugin);
					updateProjectFolderHighlight(this.plugin);
				});
			});

		// ── Formatter Config ──────────────────────────────────────────────────
		const isFormattable = FORMATTABLE_EXTENSIONS.includes(this.extension);

		if (!isFormattable) {
			// Show message for non-formattable extensions
			const nonFormattableSection = contentEl.createEl('div', {
				cls: 'code-files-non-formattable-section'
			});
			nonFormattableSection.style.marginTop = '1rem';
			nonFormattableSection.style.padding = '1rem';
			nonFormattableSection.style.textAlign = 'center';
			nonFormattableSection.style.color = 'var(--text-muted)';

			nonFormattableSection.createEl('hr', {
				attr: {
					style: 'margin: 0 0 1rem 0; border: none; border-top: 1px solid var(--background-modifier-border);'
				}
			});

			nonFormattableSection.createEl('p', {
				text: `Extension .${this.extension} is not formattable`,
				attr: { style: 'font-size: 1.1em; margin: 0;' }
			});
			nonFormattableSection.createEl('p', {
				text: 'No integrated formatter available for this file type',
				attr: { style: 'font-size: 0.9em; margin-top: 0.5rem;' }
			});
			return;
		}

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
			if (this.codeEditor) {
				const cfg =
					this.plugin.settings.editorConfigs?.[global ? '*' : this.extension] ??
					(global
						? DEFAULT_EDITOR_CONFIG
						: getExtensionConfigTemplate(this.extension));
				this.codeEditor.setValue(cfg);
			}
		};

		btnGlobal.onClick(() => switchScope(true));
		btnExt.onClick(() => switchScope(false));
		// Default to extension-specific config on open
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
		const initialValue = existing ?? getExtensionConfigTemplate(this.extension);

		/**
		 * Validates, persists, and broadcasts the current editor config on each keystroke.
		 * Skips save and broadcast if the JSON is invalid or the value hasn't changed.
		 */
		const debouncedSave = debounce(
			async () => {
				if (!this.codeEditor) return;
				const value = this.codeEditor.getValue().trim();
				const key = this.isGlobal ? '*' : this.extension;
				if (saveEditorConfig(this.plugin, key, value)) {
					await this.plugin.saveSettings();
					broadcastEditorConfig(this.plugin, key);
					// Notify Obsidian settings tab to refresh its config editor display
					this.plugin.app.workspace.trigger('code-files:settings-changed');
				}
			},
			600,
			true
		);

		// Mount the Monaco editor with the initial config value
		this.codeEditor = await mountCodeEditor(
			this.plugin,
			'json',
			initialValue,
			`editor-settings-config.jsonc`,
			this.contentEl,
			() => debouncedSave(),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined
		);
		editorContainer.append(this.codeEditor.iframe);
	}

	onClose(): void {
		super.onClose();
		// Restore modal background opacity
		const backgrounds = document.querySelectorAll<HTMLElement>('.modal-bg');
		backgrounds.forEach((bg) => (bg.style.opacity = ''));
		if (this.codeEditor) {
			const raw = this.codeEditor.getValue().trim();
			const key = this.isGlobal ? '*' : this.extension;
			// Final save in case the user closes before debouncedSave fires
			if (saveEditorConfig(this.plugin, key, raw)) {
				void this.plugin.saveSettings();
				// Notify Obsidian settings tab to refresh its config editor display
				this.plugin.app.workspace.trigger('code-files:settings-changed');
				// Push merged config (global + ext) to the Monaco iframe
				this.onConfigApplied(buildMergedConfig(this.plugin, this.extension));
			}
			this.codeEditor.destroy();
		}
		this.contentEl.empty();
		this.restoreFocus?.();
	}
}
