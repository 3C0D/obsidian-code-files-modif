import { ButtonComponent, Modal, Notice, TextComponent } from 'obsidian';
import type { TFile, View, WorkspaceLeaf } from 'obsidian';
import type CodeFilesPlugin from './main.ts';

/** Modal to rename the extension of an existing file.
 *  Shows the current path and updates it live as the user types.
 *  After renaming, reopens the file if it was already open. */
export class RenameExtensionModal extends Modal {
	private newExt: string;

	constructor(
		private plugin: CodeFilesPlugin,
		private file: TFile
	) {
		super(plugin.app);
		this.newExt = file.extension;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.style.width = '360px';

		// Live path preview
		const pathDisplay = contentEl.createEl('p', {
			text: this.getNewPath(),
			attr: {
				style: 'color: var(--text-muted); font-size: 0.85em; margin-bottom: 12px; word-break: break-all;'
			}
		});

		const row = contentEl.createEl('div', {
			attr: { style: 'display: flex; gap: 8px; align-items: center;' }
		});

		const input = new TextComponent(row).setValue(this.newExt).onChange((value) => {
			this.newExt = value.replace(/^\./, '');
			pathDisplay.textContent = this.getNewPath();
		});

		input.inputEl.style.flexGrow = '1';
		input.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') this.save();
			if (e.key === 'Escape') this.close();
		});

		new ButtonComponent(row)
			.setButtonText('Rename')
			.setCta()
			.onClick(() => this.save());

		input.inputEl.focus();
		input.inputEl.select();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private getNewPath(): string {
		const base = this.file.path.slice(0, this.file.path.lastIndexOf('.'));
		return this.newExt ? `${base}.${this.newExt}` : base;
	}

	private async save(): Promise<void> {
		const ext = this.newExt.replace(/^\./, '').trim();

		if (!ext) {
			new Notice('Please enter an extension');
			return;
		}

		if (ext.length < 2) {
			new Notice('Extension must be at least 2 characters');
			return;
		}

		const newPath =
			this.file.path.slice(0, this.file.path.lastIndexOf('.') + 1) + ext;
		if (newPath === this.file.path) {
			this.close();
			return;
		}

		// Register the new extension if not already known
		if (!this.plugin.settings.extensions.includes(ext)) {
			this.plugin.settings.extensions.push(ext);
			this.plugin.registerExtension(ext);
			await this.plugin.saveSettings();
			new Notice(`Added ".${ext}" to registered extensions`);
		}

		// Check if the file is currently open so we can reopen it after rename
		const openLeaves = this.app.workspace
			.getLeavesOfType('code-editor')
			.concat(this.app.workspace.getLeavesOfType('markdown'));
		const openLeaf = openLeaves.find(
			(l: WorkspaceLeaf) => (l.view as View & { file?: TFile }).file === this.file
		);

		await this.app.vault.rename(this.file, newPath);
		setTimeout(() => this.close(), 0);

		// Force a full view reload so Monaco picks up the new language
		if (openLeaf) {
			const renamedFile = this.app.vault.getFileByPath(newPath);
			if (renamedFile) {
				await openLeaf.openFile(renamedFile, { active: true });
			}
		}
	}
}
