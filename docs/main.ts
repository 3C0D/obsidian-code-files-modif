import {
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	Modal,
	Notice,
	setIcon
} from 'obsidian';
import type { App } from 'obsidian';
import type { DataAdapterEx, FileExplorerView, FolderTreeItem } from 'obsidian-typings';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import { around } from 'monkey-around';
import * as fs from 'fs';
import * as path from 'path';

interface DataAdapterWithInternal extends DataAdapterEx {
	reconcileFileInternal(realPath: string, normalizedPath: string): Promise<void>;
}

interface HiddenFilesSettings {
	excludedFolders: string[];
	excludedExtensions: string[];
	revealedFiles: Record<string, string[]>;
}

const DEFAULT_SETTINGS: HiddenFilesSettings = {
	excludedFolders: ['.git', 'node_modules', '.trash'],
	excludedExtensions: [],
	revealedFiles: {}
};

interface HiddenItem {
	name: string;
	path: string;
	isFolder: boolean;
	size: number;
}

export default class ShowHiddenFilesPlugin extends Plugin {
	settings!: HiddenFilesSettings;
	private _bypassPatch = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.patchAdapter();

		this.app.workspace.onLayoutReady(async () => {
			await this.cleanStaleRevealedFiles();
			await this.restoreRevealedFiles();
			this.decorateFolders();
		});

		this.registerEvent(this.app.vault.on('create', () => this.decorateFolders()));
		this.registerEvent(this.app.vault.on('delete', () => this.decorateFolders()));
		this.registerEvent(this.app.vault.on('rename', () => this.decorateFolders()));

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFolder) {
					const folderPath = file.path;
					menu.addItem((item) => {
						item.setTitle('Show/hide hidden files')
							.setIcon('eye')
							.onClick(() => {
								new HiddenFilesModal(this.app, this, folderPath).open();
							});
					});
				}
			})
		);

		this.addSettingTab(new HiddenFilesSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getAdapter(): DataAdapterWithInternal {
		return getDataAdapterEx(this.app) as DataAdapterWithInternal;
	}

	getBasePath(): string {
		return this.getAdapter().basePath;
	}

	patchAdapter(): void {
		const self = this;
		const adapter = this.getAdapter();

		// Prevent Obsidian from auto-deleting revealed dotfiles
		this.register(
			around(adapter, {
				reconcileDeletion(next) {
					return async function (
						this: DataAdapterEx,
						realPath: string,
						normalizedPath: string
					) {
						const basename = normalizedPath.split('/').pop() || '';
						// Block deletion of dotfiles unless explicitly requested via hideFilesInFolder
						if (basename.startsWith('.') && !self._bypassPatch) {
							return;
						}
						return next.call(this, realPath, normalizedPath);
					};
				}
			})
		);
	}

	async cleanStaleRevealedFiles(): Promise<void> {
		const basePath = this.getBasePath();
		let changed = false;

		for (const [folderPath, itemPaths] of Object.entries(
			this.settings.revealedFiles
		)) {
			const valid = itemPaths.filter((itemPath) => {
				try {
					fs.statSync(path.join(basePath, itemPath));
					return true;
				} catch {
					return false;
				}
			});

			if (valid.length !== itemPaths.length) {
				changed = true;
				if (valid.length === 0) {
					delete this.settings.revealedFiles[folderPath];
				} else {
					this.settings.revealedFiles[folderPath] = valid;
				}
			}
		}

		if (changed) await this.saveSettings();
	}

	async restoreRevealedFiles(): Promise<void> {
		const adapter = this.getAdapter();
		const basePath = this.getBasePath();

		for (const [_, itemPaths] of Object.entries(this.settings.revealedFiles)) {
			for (const itemPath of itemPaths) {
				const realPath = adapter.getRealPath(itemPath);
				const fullPath = path.join(basePath, itemPath);
				try {
					const stat = fs.statSync(fullPath);
					if (stat.isDirectory()) {
						await adapter.reconcileFolderCreation(realPath, itemPath);
					} else {
						await adapter.reconcileFileInternal(realPath, itemPath);
					}
				} catch {
					// fichier n'existe plus
				}
			}
		}
	}

	async decorateFolders(): Promise<void> {
		const explorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
		if (!explorer) return;

		const view = explorer.view as FileExplorerView;
		const fileItems = view.fileItems;
		if (!fileItems) return;

		for (const [filePath, item] of Object.entries(fileItems)) {
			const file = this.app.vault.getFolderByPath(filePath);
			if (!file) continue;

			const hasRevealed = this.settings.revealedFiles[file.path]?.length > 0;
			const selfEl = (item as FolderTreeItem).selfEl;
			const existing = selfEl.querySelector('.hidden-files-badge');

			if (hasRevealed && !existing) {
				const badge = selfEl.createSpan({ cls: 'hidden-files-badge' });
				setIcon(badge, 'eye');
			} else if (!hasRevealed && existing) {
				existing.remove();
			}
		}
	}

	scanHiddenFiles(folderPath: string): HiddenItem[] {
		const basePath = this.getBasePath();
		const fullPath = path.join(basePath, folderPath);
		const items: HiddenItem[] = [];

		try {
			const entries = fs.readdirSync(fullPath);

			for (const entry of entries) {
				if (!entry.startsWith('.')) continue;

				const entryPath = path.join(fullPath, entry);
				const relativePath = folderPath ? `${folderPath}/${entry}` : entry;

				try {
					const stat = fs.statSync(entryPath);
					const isFolder = stat.isDirectory();

					if (isFolder && this.settings.excludedFolders.includes(entry)) {
						continue;
					}

					if (!isFolder) {
						const ext = entry.substring(1);
						if (this.settings.excludedExtensions.includes(ext)) {
							continue;
						}
						if (stat.size > 10 * 1024 * 1024) {
							continue;
						}
					}

					items.push({
						name: entry,
						path: relativePath,
						isFolder,
						size: stat.size
					});
				} catch {
					// ignore permission errors
				}
			}

			items.sort((a, b) => {
				if (a.isFolder && !b.isFolder) return -1;
				if (!a.isFolder && b.isFolder) return 1;
				return a.name.localeCompare(b.name);
			});
		} catch (e) {
			console.error('Scan error:', e);
		}

		return items;
	}

	async revealFiles(folderPath: string, itemPaths: string[]): Promise<void> {
		const adapter = this.getAdapter();
		const basePath = this.getBasePath();

		for (const itemPath of itemPaths) {
			const fullPath = path.join(basePath, itemPath);
			try {
				const stat = fs.statSync(fullPath);
				const realPath = adapter.getRealPath(itemPath);
				if (stat.isDirectory()) {
					await adapter.reconcileFolderCreation(realPath, itemPath);
				} else {
					// Call reconcileFileInternal directly to bypass dotfile guard
					await adapter.reconcileFileInternal(realPath, itemPath);
					const registered = this.app.vault.getFileByPath(itemPath);
					console.log('registered after reveal:', itemPath, registered);
				}
			} catch (e) {
				console.error(`Reveal error ${itemPath}:`, e);
			}
		}

		const existing = this.settings.revealedFiles[folderPath] ?? [];
		this.settings.revealedFiles[folderPath] = [
			...new Set([...existing, ...itemPaths])
		];
		await this.saveSettings();
		this.decorateFolders();
		new Notice(`${itemPaths.length} item(s) revealed`);
	}

	async hideFilesInFolder(folderPath: string, itemPaths: string[]): Promise<void> {
		const adapter = this.getAdapter();

		// Temporarily allow deletion of dotfiles
		this._bypassPatch = true;
		for (const filePath of itemPaths) {
			const realPath = adapter.getRealPath(filePath);
			await adapter.reconcileDeletion(realPath, filePath);
		}
		this._bypassPatch = false;

		const remaining = (this.settings.revealedFiles[folderPath] || []).filter(
			(path) => !itemPaths.includes(path)
		);

		if (remaining.length > 0) {
			this.settings.revealedFiles[folderPath] = remaining;
		} else {
			delete this.settings.revealedFiles[folderPath];
		}

		await this.saveSettings();
		this.decorateFolders();
		new Notice(`${itemPaths.length} file(s) hidden`);
	}
}

class HiddenFilesModal extends Modal {
	plugin: ShowHiddenFilesPlugin;
	folderPath: string;
	items: HiddenItem[];
	private initialRevealed: Set<string>;
	selected: Set<string>;

	constructor(app: App, plugin: ShowHiddenFilesPlugin, folderPath: string) {
		super(app);
		this.plugin = plugin;
		this.folderPath = folderPath;
		this.items = plugin.scanHiddenFiles(folderPath);
		plugin.cleanStaleRevealedFiles();
		const revealed = plugin.settings.revealedFiles[folderPath] || [];
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
					await this.plugin.revealFiles(this.folderPath, toReveal);
				if (toHide.length > 0)
					await this.plugin.hideFilesInFolder(this.folderPath, toHide);
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

class HiddenFilesSettingTab extends PluginSettingTab {
	plugin: ShowHiddenFilesPlugin;

	constructor(app: App, plugin: ShowHiddenFilesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Excluded folders')
			.setDesc('Hidden folders to never show (comma-separated)')
			.addText((text) =>
				text
					.setPlaceholder('.git, node_modules, .trash')
					.setValue(this.plugin.settings.excludedFolders.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Excluded extensions')
			.setDesc('Hidden file extensions to exclude (without dot, comma-separated)')
			.addText((text) =>
				text
					.setPlaceholder('tmp, log, cache')
					.setValue(this.plugin.settings.excludedExtensions.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.excludedExtensions = value
							.split(',')
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);
	}
}
