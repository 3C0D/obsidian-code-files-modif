import { Modal, ButtonComponent } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';
import { DEFAULT_FORMATTER_CONFIG } from './types.ts';
import type { CodeEditorInstance } from './types.ts';

/** Modal to edit the Monaco formatter config for a given extension.
 *  The config is a JSON object with options like tabSize, insertSpaces, formatOnSave, formatOnType.
 *  It is saved to plugin settings on close. */
export class FormatterConfigModal extends Modal {
	private codeEditor: CodeEditorInstance;

	constructor(
		private plugin: CodeFilesPlugin,
		private extension: string,
		private onSaved?: (config: string) => void
	) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		super.onOpen();

		this.titleEl.setText(`Formatter config — .${this.extension}`);
		this.modalEl.style.width = '600px';
		this.modalEl.style.height = '400px';

		// Load existing config or fall back to default
		const existing = this.plugin.settings.formatterConfigs[this.extension];
		const initialValue = existing ?? DEFAULT_FORMATTER_CONFIG;

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			'json',
			initialValue,
			`formatter-config-${this.extension}`
		);

		this.contentEl.style.height = 'calc(100% - 60px)';
		this.contentEl.append(this.codeEditor.iframe);

		// Save button
		const footer = this.modalEl.createEl('div', {
			attr: { style: 'display:flex; justify-content:flex-end; padding: 8px 16px;' }
		});
		new ButtonComponent(footer)
			.setButtonText('Save')
			.setCta()
			.onClick(() => this.save());
	}

	onClose(): void {
		super.onClose();
		this.codeEditor?.destroy();
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const value = this.codeEditor.getValue().trim();
		try {
			JSON.parse(value); // validate JSON before saving
			this.plugin.settings.formatterConfigs[this.extension] = value;
			await this.plugin.saveSettings();
			this.onSaved?.(value);
			this.close();
		} catch {
			// Leave modal open so user can fix the JSON
			const notice = this.modalEl.querySelector('.formatter-error') as HTMLElement;
			if (notice) {
				notice.textContent = 'Invalid JSON — please fix before saving.';
			} else {
				this.modalEl.createEl('p', {
					text: 'Invalid JSON — please fix before saving.',
					cls: 'formatter-error',
					attr: { style: 'color: var(--text-error); padding: 0 16px;' }
				});
			}
		}
	}
}
