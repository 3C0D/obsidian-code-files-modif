import { Modal, debounce } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { mountCodeEditor } from './mountCodeEditor.ts';
import { DEFAULT_FORMATTER_CONFIG } from './types.ts';
import type { CodeEditorInstance } from './types.ts';

/** Modal to edit the Monaco formatter config for a given extension.
 *  The config is a JSON object with options like tabSize, insertSpaces, formatOnSave, formatOnType.
 *  It is saved to plugin settings on close. */
export class FormatterConfigModal extends Modal {
	private codeEditor!: CodeEditorInstance;

	constructor(
		private plugin: CodeFilesPlugin,
		private extension: string,
		private onSaved?: (config: string) => void
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

		this.titleEl.setText(`Formatter config — .${this.extension}`);
		this.modalEl.style.width = '600px';
		this.modalEl.style.height = '400px';

		const existing = this.plugin.settings.formatterConfigs[this.extension];
		const initialValue = existing ?? DEFAULT_FORMATTER_CONFIG;

		const debouncedSave = debounce(async () => {
			if (!this.codeEditor) return;
			const value = this.codeEditor.getValue().trim();
			if (this.applyFormatterValue(value)) {
				void this.plugin.saveSettings();
				this.onSaved?.(value);
			}
		}, 600, true);

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			'json',
			initialValue,
			`formatter-config-${this.extension}`,
			() => debouncedSave()
		);

		this.contentEl.style.height = '100%';
		this.contentEl.append(this.codeEditor.iframe);
	}

	onClose(): void {
		super.onClose();
		if (this.codeEditor) {
			const value = this.codeEditor.getValue().trim();
			if (this.applyFormatterValue(value)) {
				void this.plugin.saveSettings();
				this.onSaved?.(value);
			}
			this.codeEditor.destroy();
		}
		this.contentEl.empty();
	}
}
