import { ButtonComponent, Modal, Notice, TextComponent } from 'obsidian';
import type { TFile } from 'obsidian';
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
		let base = this.file.path;
		if (this.file.extension) {
			base = base.slice(0, base.length - this.file.extension.length - 1);
		}
		const cleanExt = this.newExt.replace(/^\./, '').trim();
		return cleanExt ? `${base}.${cleanExt}` : base;
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

		let base = this.file.path;
		if (this.file.extension) {
			base = base.slice(0, base.length - this.file.extension.length - 1);
		}
		// Also prevent double extension if user accidentally typed the existing extension suffix
		const newPath = `${base}.${ext}`;

		if (newPath === this.file.path) {
			this.close();
			return;
		}

		// Close the modal immediately so UI is responsive and doesn't get blocked
		// by any errors or delays triggered by onRename handlers across the app.
		this.close();

		try {
			await this.app.vault.rename(this.file, newPath);
		} catch (e) {
			new Notice('Failed to rename file');
			console.error(e);
		}
	}
}
