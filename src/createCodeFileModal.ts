import type { TAbstractFile, TFolder } from 'obsidian';
import {
	AbstractInputSuggest,
	ButtonComponent,
	Modal,
	normalizePath,
	Notice,
	TextComponent,
	TFile
} from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';
import { FormatterConfigModal } from './formatterConfigModal.ts';

/** Autocomplete suggester for registered extensions, attached to a text input. */
class ExtensionSuggest extends AbstractInputSuggest<string> {
	constructor(
		private plugin: CodeFilesPlugin,
		inputEl: HTMLInputElement,
		private onChoose: (ext: string) => void
	) {
		super(plugin.app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase().replace(/^\./, '');
		return this.plugin.settings.extensions.filter((ext) => ext.includes(q));
	}

	renderSuggestion(ext: string, el: HTMLElement): void {
		el.setText(`.${ext}`);
	}

	selectSuggestion(ext: string): void {
		this.onChoose(ext);
		this.close();
	}
}

/** Modal for creating a new code file */
export class CreateCodeFileModal extends Modal {
	fileName = 'My Code File';
	fileExtension = '';
	parent: TFolder;

	constructor(
		private plugin: CodeFilesPlugin,
		parent?: TAbstractFile
	) {
		super(plugin.app);
		this.parent =
			((parent instanceof TFile ? parent.parent : parent) as TFolder) ??
			this.plugin.app.vault.getRoot();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.style.display = 'flex';
		contentEl.style.alignItems = 'center';

		// File name input — constrained width to leave room for other controls
		const fileNameInput = new TextComponent(contentEl);
		fileNameInput.inputEl.style.width = '200px';
		fileNameInput.inputEl.style.marginRight = '10px';
		fileNameInput.setValue(this.fileName);
		fileNameInput.inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') this.complete();
		});
		fileNameInput.onChange((value) => {
			this.fileName = value;
		});

		// Extension input with autocomplete from registered extensions
		const extInput = new TextComponent(contentEl);
		extInput.setPlaceholder('.ext');
		extInput.inputEl.title =
			'Type to filter registered extensions, or enter a new one — it will be registered automatically on Create.';
		extInput.setValue('');
		extInput.inputEl.style.width = '80px';
		extInput.inputEl.style.marginRight = '4px';
		extInput.onChange((value) => {
			this.fileExtension = value.replace(/^\./, '');
		});
		extInput.inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') this.complete();
		});

		// Attach autocomplete — selecting a suggestion fills the input and updates fileExtension
		new ExtensionSuggest(this.plugin, extInput.inputEl, (ext) => {
			extInput.setValue(ext);
			this.fileExtension = ext;
		});

		// 'diff' button to add/remove extensions on the fly
		const manageBtn = new ButtonComponent(contentEl);
		manageBtn.setIcon('diff');
		manageBtn.setTooltip('Edit extensions — add or remove');
		manageBtn.buttonEl.style.marginRight = '10px';
		manageBtn.onClick(() => {
			new ChooseExtensionModal(this.plugin, (newExt) => {
				if (newExt) {
					extInput.setValue(newExt);
					this.fileExtension = newExt;
				}
			}).open();
		});

		// Settings button — opens formatter config for the current extension
		const configBtn = new ButtonComponent(contentEl);
		configBtn.setIcon('settings');
		configBtn.setTooltip('Formatter config for this extension');
		configBtn.buttonEl.style.marginRight = '6px';
		configBtn.onClick(() => {
			const ext = this.fileExtension.replace(/^\./, '').trim();
			if (!ext) {
				new Notice('Enter an extension first');
				return;
			}
			new FormatterConfigModal(this.plugin, ext).open();
		});

		// Create button
		const submitButton = new ButtonComponent(contentEl);
		submitButton.setCta();
		submitButton.setButtonText('Create');
		submitButton.onClick(() => this.complete());

		fileNameInput.inputEl.focus();
	}

	/** Creates the new file and opens it in a new leaf, or shows a notice if a file with the same name already exists */
	async complete(): Promise<void> {
		// Normalize: strip leading dot, trim whitespace
		const ext = this.fileExtension.replace(/^\./, '').trim();

		if (!ext) {
			new Notice('Please enter a file extension');
			return;
		}

		if (ext.length < 2) {
			new Notice('Extension must be at least 2 characters');
			return;
		}

		// If the extension is not registered yet, register it on the fly
		if (!this.plugin.settings.extensions.includes(ext)) {
			this.plugin.settings.extensions.push(ext);
			this.plugin.registerExtension(ext);
			await this.plugin.saveSettings();
			new Notice(`Added ".${ext}" to registered extensions`);
		}

		this.close();
		const newPath = normalizePath(`${this.parent.path}/${this.fileName}.${ext}`);
		const existingFile = this.app.vault.getAbstractFileByPath(newPath);
		if (existingFile && existingFile instanceof TFile) {
			new Notice('File already exists');
			const leaf = this.app.workspace.getLeaf(true);
			leaf.openFile(existingFile);
			return;
		}

		const newFile = await this.app.vault.create(newPath, '');
		const leaf = this.app.workspace.getLeaf(true);
		leaf.openFile(newFile);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
