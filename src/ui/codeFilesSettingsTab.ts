/**
 * Obsidian plugin settings tab.
 * Provides UI for:
 * - Extension management (manual vs extended mode, add/remove extensions)
 * - Per-extension editor config with Monaco JSON editor
 */
import type { App } from 'obsidian';
import { debounce, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import type { CodeEditorInstance } from '../types/types.ts';
import { ChooseExtensionModal } from '../modals/chooseExtensionModal.ts';
import {
	DEFAULT_EDITOR_CONFIG,
	DEFAULT_SETTINGS,
	FORMATTABLE_EXTENSIONS,
	getExtensionConfigTemplate
} from '../types/variables.ts';
import { broadcastEditorConfig } from '../utils/broadcast.ts';
import {
	getActiveExtensions,
	reregisterExtensions,
	getAllMonacoExtensions
} from '../utils/extensionUtils.ts';
import { saveEditorConfig } from '../utils/settingsUtils.ts';
import { ExtensionSuggest } from './extensionSuggest.ts';
import {
	getObsidianHotkey,
	parseHotkeyOverride,
	formatHotkey
} from '../utils/hotkeyUtils.ts';
import { mountCodeEditor } from '../editor/mountCodeEditor.ts';
import {
	syncAutoRevealedDotfiles,
	hideAutoRevealedDotfiles
} from '../utils/hiddenFiles/hiddenFilesUtils.ts';

export class CodeFilesSettingsTab extends PluginSettingTab {
	private codeEditor: CodeEditorInstance | null = null;

	constructor(
		app: App,
		public plugin: CodeFilesPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		// Clean up previous Monaco editor if it exists
		if (this.codeEditor) {
			this.codeEditor.destroy();
			this.codeEditor = null;
		}

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Code Files Settings' });
		containerEl.createEl('p', {
			text: 'Most editor settings (Theme, Word Wrap, Folding, Line Numbers, Minimap, Semantic & Syntax Validation) are directly accessible from the editor interface via the gear icon or the palette icon in the tab header.'
		});

		// -- File Extensions --------------------------------------------------
		containerEl.createEl('h3', { text: 'File Extensions' });

		new Setting(containerEl)
			.setName('Use extended extensions list')
			.setDesc(
				'Register a broad curated list of extensions. Customizations (added/excluded extensions) are preserved when switching modes.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allExtensions)
					.onChange(async (value) => {
						this.plugin.settings.allExtensions = value;
						if (value) {
							// Switching to extended mode: set extensions[] to all Monaco extensions
							this.plugin.settings.extensions = getAllMonacoExtensions();
						} else {
							// Switching to manual mode: reset extensions[] to default list
							this.plugin.settings.extensions = [
								...DEFAULT_SETTINGS.extensions
							];
						}
						await reregisterExtensions(this.plugin);
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
			text:
				'Active: ' +
				(getActiveExtensions(this.plugin.settings).sort().join(', ') || 'none'),
			attr: {
				style: 'margin: -10px 0 16px 0; color: var(--text-muted); font-size: 0.9em;'
			}
		});

		new Setting(containerEl)
			.setName('Maximum file size')
			.setDesc(
				'Maximum file size in MB for opening files in Monaco (default: 10 MB)'
			)
			.addText((text) =>
				text
					.setPlaceholder('10')
					.setValue(String(this.plugin.settings.maxFileSize))
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num > 0 && num <= 100) {
							this.plugin.settings.maxFileSize = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// -- Formatter Config -------------------------------------------------
		containerEl.createEl('h3', { text: 'Editor Config' });
		containerEl.createEl('p', {
			text: 'Per-extension editor options (tabSize, insertSpaces, formatOnSave, formatOnType, and any Monaco IEditorOptions).',
			attr: {
				style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;'
			}
		});

		const extensions = getActiveExtensions(this.plugin.settings);
		// Only show formattable extensions in the selector
		const formattableExts = extensions.filter((ext) =>
			FORMATTABLE_EXTENSIONS.includes(ext)
		);
		let selectedExt = this.plugin.settings.lastSelectedConfigExtension || '';
		let isGlobal = !selectedExt;

		// Scope buttons row
		const scopeRow = containerEl.createEl('div', {
			attr: {
				style: 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;'
			}
		});

		const btnGlobal = scopeRow.createEl('button', {
			text: 'Global (*)',
			cls: 'mod-cta'
		});
		btnGlobal.style.flex = '0 0 auto';

		const btnExt = scopeRow.createEl('button', {
			text: 'ext?',
			cls: ''
		});
		btnExt.style.flex = '0 0 auto';
		btnExt.disabled = true;

		scopeRow.createEl('span', {
			text: 'Choose a specific ext:',
			attr: {
				style: 'margin-left: auto; margin-right: 8px; color: var(--text-muted); font-size: 0.9em;'
			}
		});

		const extInput = new TextComponent(scopeRow);
		extInput.setPlaceholder('Type extension...');
		extInput.inputEl.style.width = '150px';

		// Monaco editor container
		const editorContainer = containerEl.createEl('div', {
			attr: {
				style: 'border: 1px solid var(--background-modifier-border); border-radius: 4px; overflow: hidden; height: 190px; margin-top: 8px;'
			}
		});

		const debouncedSave = debounce(
			async () => {
				if (!this.codeEditor) return;
				const value = this.codeEditor.getValue().trim();
				const key = isGlobal ? '*' : selectedExt;
				if (saveEditorConfig(this.plugin, key, value)) {
					await this.plugin.saveSettings();
					broadcastEditorConfig(this.plugin, key);
					this.plugin.app.workspace.trigger('code-files:settings-changed');
				}
			},
			600,
			true
		);

		const switchScope = async (global: boolean, ext?: string): Promise<void> => {
			isGlobal = global;
			if (!global && ext) {
				selectedExt = ext;
				// Save the selected extension
				this.plugin.settings.lastSelectedConfigExtension = ext;
				await this.plugin.saveSettings();
			} else if (global) {
				// Clear saved extension when switching to global
				this.plugin.settings.lastSelectedConfigExtension = '';
				await this.plugin.saveSettings();
			}

			// Update button states
			if (global) {
				btnGlobal.classList.add('mod-cta');
				btnExt.classList.remove('mod-cta');
			} else {
				btnGlobal.classList.remove('mod-cta');
				btnExt.classList.add('mod-cta');
				btnExt.setText(`.${selectedExt}`);
				btnExt.disabled = false;
			}

			// Load the appropriate config
			const key = global ? '*' : selectedExt;
			const cfg = this.plugin.settings.editorConfigs?.[key];
			const defaultCfg = global
				? DEFAULT_EDITOR_CONFIG
				: getExtensionConfigTemplate(selectedExt);
			if (this.codeEditor) {
				this.codeEditor.setValue(cfg ?? defaultCfg);
			}
		};

		btnGlobal.addEventListener('click', () => switchScope(true));
		btnExt.addEventListener('click', () => {
			if (selectedExt) switchScope(false, selectedExt);
		});

		const showExt = async (ext: string): Promise<void> => {
			if (!ext) return;
			await switchScope(false, ext);
			extInput.setValue('');
			extInput.inputEl.blur();
		};

		// Only suggest formattable extensions
		new ExtensionSuggest(
			this.plugin,
			extInput.inputEl,
			showExt,
			() => formattableExts
		);

		// Initialize Monaco editor
		void (async () => {
			this.codeEditor = await mountCodeEditor(
				this.plugin,
				'json',
				DEFAULT_EDITOR_CONFIG,
				'settings-editor-config.jsonc',
				containerEl,
				() => debouncedSave(),
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				false // autoFocus: false to prevent focus on settings tab open
			);
			editorContainer.append(this.codeEditor.iframe);
			// Restore last selected extension or default to global
			if (selectedExt && formattableExts.includes(selectedExt)) {
				await switchScope(false, selectedExt);
			} else {
				await switchScope(true);
			}
		})();

		// -- Monaco Hotkey Overrides -----------------------------------------
		containerEl.createEl('h3', { text: 'Monaco Hotkey Overrides' });
		containerEl.createEl('p', {
			text: 'Override Obsidian shortcuts for Monaco editor. Leave empty to use Obsidian defaults (will autofill). Format: Ctrl+P, Ctrl + P, or Ctrl P.',
			attr: {
				style: 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 8px;'
			}
		});

		const createHotkeyOverrideSetting = (
			name: string,
			commandId: string,
			overrideKey:
				| 'commandPaletteHotkeyOverride'
				| 'settingsHotkeyOverride'
				| 'deleteFileHotkeyOverride'
		): void => {
			const obsidianHotkey = getObsidianHotkey(this.plugin.app, commandId);
			// Display Obsidian hotkey with platform-specific modifier names (Ctrl on Windows, Cmd on Mac)
			const defaultStr = obsidianHotkey ? formatHotkey(obsidianHotkey, true) : '';
			const currentOverride = this.plugin.settings[overrideKey];

			new Setting(containerEl)
				.setName(name)
				.setDesc(`Current Obsidian: ${defaultStr || 'none'}`)
				.addText((text) => {
					const displayOverride = currentOverride
						? formatHotkey(parseHotkeyOverride(currentOverride)!, true)
						: '';
					text.setValue(displayOverride || `${defaultStr} (default)`);
					text.setPlaceholder('Ctrl+P, Ctrl + P, or Ctrl P');
					text.inputEl.style.width = '200px';

					text.inputEl.addEventListener('blur', async () => {
						let value = text.getValue().trim();

						// Remove " (default)" suffix if present
						if (value.endsWith(' (default)')) {
							value = value.replace(/ \(default\)$/, '').trim();
						}

						// If empty, reset to default
						if (!value) {
							this.plugin.settings[overrideKey] = '';
							text.setValue(`${defaultStr} (default)`);
							await this.plugin.saveSettings();
							return;
						}

						// Validate and normalize format (converts Ctrl/Cmd/Meta → Mod internally)
						const parsed = parseHotkeyOverride(value);
						if (!parsed) {
							// Invalid format, reset to default
							this.plugin.settings[overrideKey] = '';
							text.setValue(`${defaultStr} (default)`);
							await this.plugin.saveSettings();
							return;
						}

						// Format with + and no spaces (stores as Mod+P internally)
						const formatted = formatHotkey(parsed);
						this.plugin.settings[overrideKey] = formatted;
						// Display with platform-specific modifier for user clarity
						text.setValue(formatHotkey(parsed, true));
						await this.plugin.saveSettings();
					});
				});
		};

		createHotkeyOverrideSetting(
			'Command Palette',
			'command-palette:open',
			'commandPaletteHotkeyOverride'
		);
		createHotkeyOverrideSetting(
			'Settings',
			'app:open-settings',
			'settingsHotkeyOverride'
		);
		createHotkeyOverrideSetting(
			'Delete File',
			'app:delete-file',
			'deleteFileHotkeyOverride'
		);

		// -- Hidden Files -----------------------------------------------------
		containerEl.createEl('h3', { text: 'Hidden Files' });

		new Setting(containerEl)
			.setName('Auto-reveal registered dotfiles')
			.setDesc(
				'Automatically make dotfiles visible in the file explorer when their extension is registered with Code Files. ' +
					'For example, if you register the "env" extension, .env files will become visible. ' +
					'You can still manually reveal/hide files per folder using the context menu.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoRevealRegisteredDotfiles)
					.onChange(async (value) => {
						this.plugin.settings.autoRevealRegisteredDotfiles = value;
						await this.plugin.saveSettings();
						if (value) {
							await syncAutoRevealedDotfiles(
								this.plugin,
								getActiveExtensions(this.plugin.settings)
							);
						} else {
							await hideAutoRevealedDotfiles(this.plugin);
						}
					})
			);

		new Setting(containerEl)
			.setName('Excluded folders')
			.setDesc('Hidden folders to never show (comma-separated)')
			.addText((text) =>
				text
					.setPlaceholder('.git, node_modules, .trash')
					.setValue(this.plugin.settings.excludedFolders.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Excluded extensions')
			.setDesc('Hidden file extensions to exclude (without dot, comma-separated)')
			.addText((text) =>
				text
					.setPlaceholder('tmp, log, cache')
					.setValue(this.plugin.settings.excludedExtensions.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.excludedExtensions = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
						await reregisterExtensions(this.plugin);
					})
			);
	}
}
