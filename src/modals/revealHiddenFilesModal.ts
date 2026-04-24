import { Modal, normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
	scanDotEntries,
	cleanStaleRevealedFiles,
	revealFiles,
	hideFilesInFolder,
	decorateFolders
} from '../utils/hiddenFilesUtils.ts';
import {
	addExtension,
	getActiveExtensions,
	reregisterExtensions
} from '../utils/extensionUtils.ts';
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
	selectedForRegistration: Set<string> = new Set();

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
		this.selectedForRegistration = new Set();

		// Perform scan for currently existing hidden files
		const allItems = await scanDotEntries(this.plugin, this.folderPath);

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
		const titleEl = contentEl.createEl('h2', { cls: 'hidden-files-title' });
		titleEl.createSpan({ text: 'Hidden files' });
		if (this.folderPath) {
			titleEl.createSpan({
				cls: 'hidden-files-folder-path',
				text: ` in ${this.folderPath}`
			});
		}
		contentEl.createEl('p', { text: 'Scanning folder...' });
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Title with inline folder path (wraps if too long)
		const titleEl = contentEl.createEl('h2', { cls: 'hidden-files-title' });
		titleEl.createSpan({ text: 'Hidden files' });
		if (this.folderPath) {
			titleEl.createSpan({
				cls: 'hidden-files-folder-path',
				text: ` in: ${this.folderPath}`
			});
		}

		// Two-column description
		const descEl = contentEl.createDiv({ cls: 'hidden-files-desc-columns' });

		const leftDesc = descEl.createDiv({ cls: 'hidden-files-desc-col' });
		for (const text of [
			'Check a file to reveal it',
			'Uncheck to hide it again',
			'Click Apply to confirm'
		])
			leftDesc.createEl('p', { text: `• ${text}` });

		const rightDesc = descEl.createDiv({ cls: 'hidden-files-desc-col' });
		for (const text of ['Register as code editor view', 'Click Apply to confirm'])
			rightDesc.createEl('p', { text: `• ${text}` });
		const noteEl = rightDesc.createEl('p');
		noteEl.createSpan({ text: "• This file won't be visible here anymore " });
		noteEl.createEl('small', { text: '(because always visible in explorer)' });

		contentEl.createEl('hr', { cls: 'hidden-files-separator' });

		if (this.items.length === 0) {
			contentEl.createEl('p', {
				text: 'No hidden files found',
				cls: 'hidden-files-empty'
			});
		} else {
			const listEl = contentEl.createDiv({ cls: 'hidden-files-list' });
			const registerableItems = this.items.filter(
				(i) => !i.isFolder && getExtension(i.name)
			);

			// Master row
			const masterEl = listEl.createDiv({
				cls: 'hidden-file-item hidden-file-master'
			});

			const masterRevealSection = masterEl.createDiv({
				cls: 'hidden-file-reveal-section'
			});
			const masterReveal = masterRevealSection.createEl('input', {
				type: 'checkbox'
			});
			masterReveal.checked = this.items.every((i) => this.selected.has(i.path));
			masterReveal.indeterminate = !masterReveal.checked && this.selected.size > 0;
			masterRevealSection.createSpan({ text: 'All' });

			const masterRegisterSection = masterEl.createDiv({
				cls: 'hidden-file-register-section'
			});
			const masterRegister = masterRegisterSection.createEl('input', {
				type: 'checkbox'
			});
			masterRegister.checked =
				registerableItems.length > 0 &&
				registerableItems.every((i) => this.selectedForRegistration.has(i.path));
			masterRegister.indeterminate =
				!masterRegister.checked && this.selectedForRegistration.size > 0;
			masterRegisterSection.createSpan({ text: 'All' });

			const itemRevealCbs: HTMLInputElement[] = [];
			const itemRegisterCbs: HTMLInputElement[] = [];

			for (const item of this.items) {
				const ext = item.isFolder ? null : getExtension(item.name);
				const rowEl = listEl.createDiv({ cls: 'hidden-file-item' });

				// Left: reveal checkbox + icon + name + size
				const revealSection = rowEl.createDiv({
					cls: 'hidden-file-reveal-section'
				});
				const revealCb = revealSection.createEl('input', { type: 'checkbox' });
				revealCb.checked = this.selected.has(item.path);
				itemRevealCbs.push(revealCb);
				revealSection.createSpan({
					cls: 'hidden-file-icon',
					text: item.isFolder ? '📁' : '📄'
				});
				revealSection.createSpan({ cls: 'hidden-file-name', text: item.name });
				if (!item.isFolder) {
					revealSection.createSpan({
						cls: 'hidden-file-size',
						text: this.formatSize(item.size)
					});
				}

				// Right: register checkbox
				const registerSection = rowEl.createDiv({
					cls: 'hidden-file-register-section'
				});
				if (!item.isFolder && ext) {
					const registerCb = registerSection.createEl('input', {
						type: 'checkbox'
					});
					registerCb.checked = this.selectedForRegistration.has(item.path);
					itemRegisterCbs.push(registerCb);
					registerSection.createSpan({ text: `register as .${ext}` });

					registerCb.addEventListener('change', () => {
						if (registerCb.checked)
							this.selectedForRegistration.add(item.path);
						else this.selectedForRegistration.delete(item.path);
						masterRegister.checked = registerableItems.every((i) =>
							this.selectedForRegistration.has(i.path)
						);
						masterRegister.indeterminate =
							!masterRegister.checked &&
							this.selectedForRegistration.size > 0;
					});
				}

				revealCb.addEventListener('change', () => {
					if (revealCb.checked) this.selected.add(item.path);
					else this.selected.delete(item.path);
					masterReveal.checked = this.items.every((i) =>
						this.selected.has(i.path)
					);
					masterReveal.indeterminate =
						!masterReveal.checked && this.selected.size > 0;
				});
			}

			masterReveal.addEventListener('change', () => {
				if (masterReveal.checked)
					this.items.forEach((i) => this.selected.add(i.path));
				else this.items.forEach((i) => this.selected.delete(i.path));
				itemRevealCbs.forEach((cb) => (cb.checked = masterReveal.checked));
			});

			masterRegister.addEventListener('change', () => {
				if (masterRegister.checked)
					registerableItems.forEach((i) =>
						this.selectedForRegistration.add(i.path)
					);
				else
					registerableItems.forEach((i) =>
						this.selectedForRegistration.delete(i.path)
					);
				itemRegisterCbs.forEach((cb) => (cb.checked = masterRegister.checked));
			});
		}

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

				if (toHide.length > 0)
					await hideFilesInFolder(this.plugin, this.folderPath, toHide);
				if (toReveal.length > 0)
					await revealFiles(this.plugin, this.folderPath, toReveal);

				if (this.selected.size === 0) {
					delete this.plugin.settings.revealedFiles[this.folderPath];
					await this.plugin.saveSettings();
					decorateFolders(this.plugin);
				}

				// Register selected extensions with Code Files
				let anyRegistered = false;
				for (const filePath of this.selectedForRegistration) {
					const item = this.items.find((i) => i.path === filePath);
					if (!item || item.isFolder) continue;
					const ext = getExtension(item.name);
					if (ext && addExtension(this.plugin.settings, ext))
						anyRegistered = true;
				}
				if (anyRegistered) await reregisterExtensions(this.plugin);

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
