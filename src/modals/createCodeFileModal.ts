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
import { getRealPathSafe } from '../utils/fileUtils.ts';
import { openInMonacoLeaf } from '../editor/codeEditorView/editorOpeners.ts';
import { ChooseExtensionModal } from './chooseExtensionModal.ts';
import { ExtensionSuggest } from '../ui/extensionSuggest.ts';
import {
	getActiveExtensions,
	addExtension,
	registerExtension
} from '../utils/extensionUtils.ts';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type { DataAdapterWithInternal } from '../types/index.ts';
import { confirmation } from './confirmationModal.ts';

/** Modal for creating a new code file */
export class CreateCodeFileModal extends Modal {
	fileName = 'My Code File';
	fileExtension = '';
	parent: TFolder;

	getAdapter(): DataAdapterWithInternal {
		return getDataAdapterEx(this.app) as unknown as DataAdapterWithInternal;
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
		this.modalEl.style.width = 'min(520px, 90vw)';
		contentEl.style.display = 'flex';
		contentEl.style.flexDirection = 'column';
		contentEl.style.gap = '8px';

		// Row 1: Manage extensions
		const manageRow = contentEl.createEl('div');
		manageRow.style.display = 'flex';
		manageRow.style.alignItems = 'center';
		manageRow.style.gap = '8px';
		manageRow.createEl('span', { text: 'Manage extensions' });

		const manageBtn = new ButtonComponent(manageRow);
		manageBtn.setIcon('diff');
		manageBtn.setTooltip('Add or remove registered extensions');
		manageBtn.onClick(() => {
			new ChooseExtensionModal(this.plugin, (newExt) => {
				if (newExt) {
					extInput.setValue(newExt);
					this.fileExtension = newExt;
				}
			}).open();
		});

		// Row 2: Create file
		const inputRow = contentEl.createEl('div');
		inputRow.style.display = 'flex';
		inputRow.style.alignItems = 'center';
		inputRow.style.gap = '4px';
		inputRow.style.flexWrap = 'wrap';

		const fileNameInput = new TextComponent(inputRow);
		fileNameInput.inputEl.style.flex = '1';
		fileNameInput.inputEl.style.minWidth = '0';
		fileNameInput.setValue(this.fileName);
		fileNameInput.onChange((value) => {
			this.fileName = value;
		});

		const extInput = new TextComponent(inputRow);
		extInput.setPlaceholder('.ext');
		extInput.inputEl.title =
			'Type to filter registered extensions, or enter a new one — it will be registered automatically on Create.';
		extInput.inputEl.style.width = '90px';
		extInput.inputEl.style.flexShrink = '0';
		extInput.onChange((value) => {
			this.fileExtension = value.replace(/^\./, '');
		});

		new ExtensionSuggest(this.plugin, extInput.inputEl, (ext) => {
			extInput.setValue(ext);
			this.fileExtension = ext;
		});

		const cancelButton = new ButtonComponent(inputRow);
		cancelButton.setButtonText('Cancel');
		cancelButton.onClick(() => this.close());

		const submitButton = new ButtonComponent(inputRow);
		submitButton.setCta();
		submitButton.setButtonText('Create');
		submitButton.onClick(() => this.complete());

		this.scope.register([], 'Enter', () => {
			void this.complete();
			return false;
		});

		fileNameInput.inputEl.focus();
	}

	async complete(): Promise<void> {
		const ext = this.fileExtension.replace(/^\./, '').trim();
		if (!ext) {
			new Notice('Please enter a file extension');
			return;
		}

		let cleanName = this.fileName.trim();
		let finalPath: string;
		let isHiddenFromName = false;
		let shouldRegisterExt = false;
		const isExtRegistered = getActiveExtensions(this.plugin.settings).includes(ext);

		// Case 1: hidden file typed directly in name field (e.g. ".prettierrc")
		if (cleanName.startsWith('.') && !cleanName.slice(1).includes('.')) {
			finalPath = normalizePath(`${this.parent.path}/${cleanName}`);
			isHiddenFromName = true;

			// Case 2: dotfile — no name, only extension
		} else if (!cleanName) {
			const dotfileName = `.${ext}`;
			const confirmed = await confirmation(
				this.app,
				`Create dot file: ${dotfileName}?`
			);
			if (!confirmed) return;
			cleanName = dotfileName;
			finalPath = normalizePath(`${this.parent.path}/${cleanName}`);

			if (!isExtRegistered) {
				shouldRegisterExt = await confirmation(
					this.app,
					`Register ".${ext}" as a new extension with Code Files?`
				);
			}

			// Case 3: named file
		} else {
			if (cleanName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
				cleanName = cleanName.slice(0, cleanName.length - ext.length - 1);
			} else if (cleanName.endsWith('.')) {
				cleanName = cleanName.slice(0, -1);
			}
			finalPath = normalizePath(`${this.parent.path}/${cleanName}.${ext}`);
		}

		if (shouldRegisterExt) {
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
			if (
				basename.startsWith('.') &&
				!this.app.vault.getAbstractFileByPath(newPath)
			) {
				await adapter.reconcileFileInternal?.(
					getRealPathSafe(adapter, newPath),
					newPath
				);
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			const existingFile = this.app.vault.getAbstractFileByPath(newPath);
			if (existingFile && existingFile instanceof TFile) {
				new Notice('File already exists, opening...');
				void openInMonacoLeaf(existingFile, this.plugin, true, null, false, true);
			} else {
				new Notice('File already exists but could not be opened');
			}
			return;
		}

		let newFile: TFile | null = null;
		try {
			if (basename.startsWith('.')) {
				await adapter.write(newPath, '');
				await adapter.reconcileFileInternal?.(
					getRealPathSafe(adapter, newPath),
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

		// Named file with unregistered extension: ask after creation
		if (
			!isHiddenFromName &&
			!isExtRegistered &&
			!shouldRegisterExt &&
			cleanName !== `.${ext}`
		) {
			const registerExt = await confirmation(
				this.app,
				`Register ".${ext}" as a new extension with Code Files?`
			);
			if (registerExt) {
				addExtension(this.plugin.settings, ext);
				registerExtension(this.plugin, ext);
				await this.plugin.saveSettings();
				new Notice(`Added ".${ext}" to registered extensions`);
			}
		}

		void openInMonacoLeaf(newFile, this.plugin, true, null, false, true);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
