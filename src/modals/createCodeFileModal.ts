/**
 * Modal for creating new code files with extension selection.
 * Provides file name input, extension autocomplete from registered extensions,
 * and on-the-fly extension registration. Opens the created file in Monaco automatically.
 */
import type { TAbstractFile, TFolder } from 'obsidian';
import {
	ButtonComponent,
	Modal,
	normalizePath,
	Notice,
	TextComponent,
	TFile
} from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { CodeEditorView } from '../editor/codeEditorView.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';
import { ExtensionSuggest } from '../ui/extensionSuggest.ts';
import {
	getActiveExtensions,
	addExtension,
	registerExtension
} from '../utils/extensionUtils.ts';
import type { DataAdapterEx } from 'obsidian-typings';
import { getDataAdapterEx } from 'obsidian-typings/implementations';

interface DataAdapterWithInternal extends DataAdapterEx {
	reconcileFileInternal(realPath: string, normalizedPath: string): Promise<void>;
}

/** Modal for creating a new code file */
export class CreateCodeFileModal extends Modal {
	fileName = 'My Code File';
	fileExtension = '';
	parent: TFolder;

	getAdapter(): DataAdapterWithInternal {
		return getDataAdapterEx(this.app) as DataAdapterWithInternal;
	}

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

		// Attach autocomplete — selecting a suggestion fills the input and updates fileExtension
		new ExtensionSuggest(this.plugin, extInput.inputEl, (ext) => {
			extInput.setValue(ext);
			this.fileExtension = ext;
		});

		// button to add/remove extensions on the fly
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

		// Create button
		const submitButton = new ButtonComponent(contentEl);
		submitButton.setCta();
		submitButton.setButtonText('Create');
		submitButton.onClick(() => this.complete());

		this.scope.register([], 'Enter', () => {
			void this.complete();
			return false;
		});

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

		let cleanName = this.fileName.trim();
		let finalPath: string;

		// Hidden file typed directly in the name field (e.g. ".prettierrc")
		if (cleanName.startsWith('.') && !cleanName.slice(1).includes('.')) {
			finalPath = normalizePath(`${this.parent.path}/${cleanName}`);
		} else {
			if (!cleanName) {
				cleanName = `.${ext}`;
				const confirmed = await new Promise<boolean>((resolve) => {
					const modal = new Modal(this.app);
					modal.titleEl.setText('Create file without name?');
					modal.contentEl.createEl('p', { text: `Create file: ${cleanName}` });
					const btnContainer = modal.contentEl.createDiv({
						cls: 'modal-button-container'
					});
					new ButtonComponent(btnContainer)
						.setButtonText('Cancel')
						.onClick(() => {
							modal.close();
							resolve(false);
						});
					new ButtonComponent(btnContainer)
						.setButtonText('Create')
						.setCta()
						.onClick(() => {
							modal.close();
							resolve(true);
						});
					modal.open();
				});

				if (!confirmed) return;
				finalPath = normalizePath(`${this.parent.path}/${cleanName}`);
			} else {
				// If user typed 'myFile.js' and ext is set to 'js', prevent 'myFile.js.js'
				if (cleanName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
					cleanName = cleanName.slice(0, cleanName.length - ext.length - 1);
				} else if (cleanName.endsWith('.')) {
					cleanName = cleanName.slice(0, -1);
				}
				finalPath = normalizePath(`${this.parent.path}/${cleanName}.${ext}`);
			}
		}

		// If the extension is not registered yet, register it on the fly
		if (!getActiveExtensions(this.plugin.settings).includes(ext)) {
			addExtension(this.plugin.settings, ext);
			registerExtension(this.plugin, ext);
			await this.plugin.saveSettings();
			new Notice(`Added ".${ext}" to registered extensions`);
		}

		this.close();
		const newPath = finalPath;
		const basename = newPath.split('/').pop() ?? '';
		const adapter = this.getAdapter();

		if (await adapter.exists(newPath)) {
			// If it's a hidden file (e.g. .prettierrc), Obsidian's vault mechanism doesn't track it by default.
			// This means getAbstractFileByPath will return null even if it exists on disk.
			// We manually call reconcileFileInternal to force Obsidian to add it to the vault cache
			// so we can properly open it as a TFile.
			if (
				basename.startsWith('.') &&
				!this.app.vault.getAbstractFileByPath(newPath)
			) {
				await adapter.reconcileFileInternal(
					adapter.getRealPath(newPath),
					newPath
				);
				// Give the vault a bit of time to update its cache
				await new Promise((resolve) => setTimeout(resolve, 50));
			}

			const existingFile = this.app.vault.getAbstractFileByPath(newPath);
			if (existingFile && existingFile instanceof TFile) {
				new Notice('File already exists, opening...');
				void CodeEditorView.openVaultFile(existingFile, this.plugin, true);
			} else {
				new Notice('File already exists but could not be opened');
			}
			return;
		}

		let newFile: TFile | null = null;
		try {
			if (basename.startsWith('.')) {
				// Create the file using the adapter's write method (works for hidden files)
				await adapter.write(newPath, '');
				// Again, for hidden files we just created, the vault won't see them automatically.
				// We force reconciliation so getFileByPath can successfully return the newly created TFile.
				await adapter.reconcileFileInternal(
					adapter.getRealPath(newPath),
					newPath
				);
				await new Promise((resolve) => setTimeout(resolve, 50));
				newFile = this.app.vault.getFileByPath(newPath);
			} else {
				newFile = await this.app.vault.create(newPath, '');
			}
		} catch (e) {
			console.error(e);
			new Notice(`Failed to create file: ${newPath}`);
			return;
		}

		if (!newFile) {
			new Notice(`Failed to create file: ${newPath}`);
			return;
		}
		void CodeEditorView.openFile(newFile, this.plugin, true);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
