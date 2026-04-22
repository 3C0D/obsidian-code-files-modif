import { Modal, normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
	scanHiddenFiles,
	cleanStaleRevealedFiles,
	revealFiles,
	hideFilesInFolder,
	decorateFolders
} from '../utils/hiddenFilesUtils.ts';
import { getActiveExtensions } from '../utils/extensionUtils.ts';
import { getExtension } from '../utils/fileUtils.ts';
import type { HiddenItem } from '../types/types.ts';

/**
 * Modal to scan, reveal, and hide dotfiles within a specific folder.
 */
export class RevealHiddenFilesModal extends Modal {
	plugin: CodeFilesPlugin;
	folderPath: string;
	items: HiddenItem[] = [];
	private initialRevealed: Set<string>;
	selected: Set<string>;

	constructor(plugin: CodeFilesPlugin, folderPath: string) {
		super(plugin.app);
		this.plugin = plugin;
		this.folderPath = normalizePath(folderPath);
		if (this.folderPath === '/') this.folderPath = '';

		// Initialize as empty sets; they will be populated from clean settings in onOpen()
		this.initialRevealed = new Set();
		this.selected = new Set();
	}

	async onOpen(): Promise<void> {
		this.renderLoading();

		// Clean up stale files before scanning to ensure settings are up-to-date
		await cleanStaleRevealedFiles(this.plugin);

		// Re-initialize selections from the cleaned settings
		const revealed = this.plugin.settings.revealedFiles[this.folderPath] || [];
		this.initialRevealed = new Set(revealed);
		this.selected = new Set(revealed);

		// Perform scan for currently existing hidden files
		const allItems = await scanHiddenFiles(this.plugin, this.folderPath);

		// Exclude files already managed by auto-reveal (registered extensions)
		if (this.plugin.settings.autoRevealRegisteredDotfiles) {
			const activeExts = getActiveExtensions(this.plugin.settings);

			this.items = allItems.filter((item) => {
				if (item.isFolder) return true;
				const ext = getExtension(item.name);
				return !ext || !activeExts.includes(ext);
			});
		} else {
			this.items = allItems;
		}

		// Remove auto-managed paths from selected/initialRevealed and from settings
		const itemPaths = new Set(this.items.map((i) => i.path));
		this.initialRevealed = new Set(
			[...this.initialRevealed].filter((p) => itemPaths.has(p))
		);
		this.selected = new Set([...this.selected].filter((p) => itemPaths.has(p)));

		// Persist the cleanup immediately
		const current = this.plugin.settings.revealedFiles[this.folderPath] || [];
		const cleaned = current.filter((p) => itemPaths.has(p));
		if (cleaned.length !== current.length) {
			if (cleaned.length > 0) {
				this.plugin.settings.revealedFiles[this.folderPath] = cleaned;
			} else {
				delete this.plugin.settings.revealedFiles[this.folderPath];
			}
			await this.plugin.saveSettings();
			decorateFolders(this.plugin);
		}

		this.render();
	}

	private renderLoading(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('hidden-files-modal');
		contentEl.createEl('h2', { text: 'Hidden files' });
		contentEl.createEl('p', { text: 'Scanning folder...' });
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

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
					.filter((item) => this.selected.has(item.path))
					.map((item) => item.path);

				const toHide = this.items
					.filter(
						(item) =>
							!this.selected.has(item.path) &&
							this.initialRevealed.has(item.path)
					)
					.map((item) => item.path);

				if (toHide.length > 0) {
					await hideFilesInFolder(this.plugin, this.folderPath, toHide);
				}
				if (toReveal.length > 0) {
					await revealFiles(this.plugin, this.folderPath, toReveal);
				}

				// If nothing selected, ensure the folder entry is fully cleared
				if (this.selected.size === 0) {
					delete this.plugin.settings.revealedFiles[this.folderPath];
					await this.plugin.saveSettings();
					decorateFolders(this.plugin);
				}

				this.close();
			});

		buttonContainer
			.createEl('button', { text: 'Cancel' })
			.addEventListener('click', () => this.close());
	}

	private formatSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
