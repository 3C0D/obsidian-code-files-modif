import type { TAbstractFile, TFolder } from 'obsidian';
import {
	ButtonComponent,
	DropdownComponent,
	Modal,
	normalizePath,
	Notice,
	TextComponent,
	TFile
} from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';

/** Modal for creating a new code file */
export class CreateCodeFileModal extends Modal {
	fileName = 'My Code File';

	fileExtension = this.plugin.settings.extensions[0];

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
		const fileNameInput = new TextComponent(contentEl);
		fileNameInput.inputEl.style.flexGrow = '1';
		fileNameInput.inputEl.style.marginRight = '10px';
		fileNameInput.setValue(this.fileName);
		fileNameInput.inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				this.complete();
			}
		});
		fileNameInput.onChange((value) => {
			this.fileName = value;
		});

		const fileExtensionInput = new DropdownComponent(contentEl);
		fileExtensionInput.selectEl.style.marginRight = '4px';
		fileExtensionInput.addOptions(
			Object.fromEntries(this.plugin.settings.extensions.map((ext) => [ext, ext]))
		);
		fileExtensionInput.setValue(this.fileExtension);
		fileExtensionInput.onChange((value) => {
			this.fileExtension = value;
		});

		fileExtensionInput.selectEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				this.complete();
			}
		});

		// '+' button to add a new extension on the fly without leaving the modal
		const addExtBtn = new ButtonComponent(contentEl);
		addExtBtn.setIcon('plus');
		addExtBtn.setTooltip('Add a new extension');
		addExtBtn.buttonEl.style.marginRight = '10px';
		addExtBtn.onClick(() => {
			new ChooseExtensionModal(this.plugin, (newExt) => {
				// Reload the dropdown with the updated list and select the new extension
				fileExtensionInput.selectEl.empty();
				for (const ext of this.plugin.settings.extensions) {
					fileExtensionInput.selectEl.createEl('option', { text: ext, value: ext });
				}
				if (newExt) {
					fileExtensionInput.setValue(newExt);
					this.fileExtension = newExt;
				}
			}).open();
		});

		const submitButton = new ButtonComponent(contentEl);
		submitButton.setCta();
		submitButton.setButtonText('Create');
		submitButton.onClick(() => this.complete());

		fileNameInput.inputEl.focus();
	}

	/** Creates the new file and opens it in a new leaf, or shows a notice if a file with the same name already exists */
	async complete(): Promise<void> {
		this.close();
		const newPath = normalizePath(
			`${this.parent.path}/${this.fileName}.${this.fileExtension}`
		);
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
		const { contentEl } = this;
		contentEl.empty();
	}
}
