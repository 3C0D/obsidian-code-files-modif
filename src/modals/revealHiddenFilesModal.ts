import { Modal, normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
	type HiddenItem,
	scanHiddenFiles,
	cleanStaleRevealedFiles,
	revealFiles,
	hideFilesInFolder
} from '../utils/hiddenFilesUtils.ts';

export class RevealHiddenFilesModal extends Modal {
	plugin: CodeFilesPlugin;
	folderPath: string;
	items: HiddenItem[];
	private initialRevealed: Set<string>;
	selected: Set<string>;

	constructor(plugin: CodeFilesPlugin, folderPath: string) {
		super(plugin.app);
		this.plugin = plugin;
		this.folderPath = normalizePath(folderPath);
		if (this.folderPath === '/') this.folderPath = '';
		this.items = scanHiddenFiles(plugin, this.folderPath);
		void cleanStaleRevealedFiles(plugin);
		const revealed = plugin.settings.revealedFiles[this.folderPath] || [];
		this.initialRevealed = new Set(revealed);
		this.selected = new Set(revealed);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('hidden-files-modal');

		contentEl.createEl('h2', { text: 'Hidden files' });
		contentEl.createEl('p', { text: `Folder: ${this.folderPath || '(root)'}` });

		const desc = contentEl.createEl('p', { cls: 'hidden-files-desc' });
		desc.setText(
			'Check a file to reveal it in the explorer. Uncheck to hide it again. Click Apply to confirm.'
		);

		if (this.items.length === 0) {
			contentEl.createEl('p', {
				text: 'No hidden files found',
				cls: 'hidden-files-empty'
			});
			return;
		}

		const listEl = contentEl.createDiv({ cls: 'hidden-files-list' });

		const masterEl = listEl.createDiv({ cls: 'hidden-file-item hidden-file-master' });
		const masterCheckbox = masterEl.createEl('input', { type: 'checkbox' });
		masterCheckbox.checked = this.items.every((item) => this.selected.has(item.path));
		masterCheckbox.indeterminate = !masterCheckbox.checked && this.selected.size > 0;
		masterEl.createSpan({ cls: 'hidden-file-name', text: 'All' });

		const itemCheckboxes: HTMLInputElement[] = [];

		for (const item of this.items) {
			const itemEl = listEl.createDiv({ cls: 'hidden-file-item' });
			const checkbox = itemEl.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selected.has(item.path);
			itemCheckboxes.push(checkbox);

			checkbox.addEventListener('change', () => {
				if (checkbox.checked) this.selected.add(item.path);
				else this.selected.delete(item.path);
				masterCheckbox.checked = this.items.every((i) =>
					this.selected.has(i.path)
				);
				masterCheckbox.indeterminate =
					!masterCheckbox.checked && this.selected.size > 0;
			});

			const icon = itemEl.createSpan({ cls: 'hidden-file-icon' });
			icon.textContent = item.isFolder ? '📁' : '📄';
			itemEl.createSpan({ cls: 'hidden-file-name', text: item.name });
			if (!item.isFolder) {
				itemEl.createSpan({
					cls: 'hidden-file-size',
					text: this.formatSize(item.size)
				});
			}
		}

		masterCheckbox.addEventListener('change', () => {
			if (masterCheckbox.checked)
				this.items.forEach((i) => this.selected.add(i.path));
			else this.items.forEach((i) => this.selected.delete(i.path));
			itemCheckboxes.forEach((cb) => (cb.checked = masterCheckbox.checked));
		});

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		buttonContainer
			.createEl('button', { text: 'Apply', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				const toReveal = this.items
					.map((i) => i.path)
					.filter((p) => this.selected.has(p) && !this.initialRevealed.has(p));
				const toHide = this.items
					.map((i) => i.path)
					.filter((p) => !this.selected.has(p) && this.initialRevealed.has(p));

				if (toReveal.length > 0)
					await revealFiles(this.plugin, this.folderPath, toReveal);
				if (toHide.length > 0)
					await hideFilesInFolder(this.plugin, this.folderPath, toHide);
				this.close();
			});

		buttonContainer
			.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());
	}

	formatSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
