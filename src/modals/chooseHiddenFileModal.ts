/**
 * Modal for discovering and opening hidden files in Monaco.
 * "Hidden" means files not displayed in Obsidian's file explorer tree,
 * regardless of their extension (e.g., .gitignore, .env, .dockerignore).
 * Recursively scans a folder or the entire vault, filtering by size (max 10MB)
 * and excluding binary formats (executables, archives, databases, fonts).
 */
import type { TFolder } from 'obsidian';
import { normalizePath, Notice, SuggestModal } from 'obsidian';
import { CodeEditorView } from '../editor/codeEditorView.ts';
import type CodeFilesPlugin from '../main.ts';
import type { FileExplorerView } from 'obsidian-typings';
import * as fs from 'fs';

/** Extensions to exclude from hidden files list (binary executables, archives, and files that can't be opened as text) */
const EXCLUDED_EXTENSIONS = [
	// Executables and libraries
	'exe',
	'dll',
	'so',
	'dylib',
	'app',
	'dmg',
	'msi',
	// Archives
	'zip',
	'rar',
	'7z',
	'tar',
	'gz',
	'bz2',
	'xz',
	// Database files
	'db',
	'sqlite',
	'mdb',
	// Office binary formats
	'doc',
	'xls',
	'ppt',
	// Fonts
	'ttf',
	'otf',
	'woff',
	'woff2',
	'eot'
];

/** Maximum file size in MB for opening in Monaco (configurable in settings) */
function getMaxFileSize(plugin: CodeFilesPlugin): number {
	return (plugin.settings.maxFileSize || 10) * 1024 * 1024;
}

interface HiddenFileSuggestion {
	name: string;
	path: string;
	size: number;
}

/** Modal for choosing hidden files in a folder to open in Monaco.
 *  "Hidden" means absent from the file explorer tree (fileItems),
 *  regardless of registered extensions. */
export class ChooseHiddenFileModal extends SuggestModal<HiddenFileSuggestion> {
	private hiddenFiles: HiddenFileSuggestion[] = [];

	constructor(
		private plugin: CodeFilesPlugin,
		private folder?: TFolder
	) {
		super(plugin.app);
		this.setPlaceholder('Search hidden files...');
	}

	async onOpen(): Promise<void> {
		super.onOpen();
		await this.loadHiddenFiles();
		this.inputEl.dispatchEvent(new Event('input'));
	}

	/** Builds the set of paths known to the file explorer tree. */
	private getExplorerPaths(): Set<string> {
		const explorerView = this.plugin.app.workspace.getLeavesOfType('file-explorer')[0]
			?.view as FileExplorerView | undefined;
		if (!explorerView?.fileItems) return new Set();
		return new Set<string>(Object.keys(explorerView.fileItems));
	}

	/** Recursively scans the folder for files not present in the explorer tree. */
	private async scanFolder(
		folderPath: string,
		explorerPaths: Set<string>
	): Promise<void> {
		const listed = await this.plugin.app.vault.adapter.list(folderPath);

		for (const filePath of listed.files) {
			if (explorerPaths.has(filePath)) continue;

			const fileName = filePath.split('/').pop() ?? '';
			const ext = fileName.includes('.')
				? (fileName.split('.').pop()?.toLowerCase() ?? '')
				: '';

			if (EXCLUDED_EXTENSIONS.includes(ext)) continue;

			try {
				const stat = await this.plugin.app.vault.adapter.stat(filePath);
				if (!stat || stat.size > getMaxFileSize(this.plugin)) continue;
				this.hiddenFiles.push({
					name: fileName,
					path: filePath,
					size: stat.size
				});
			} catch {
				continue;
			}
		}

		for (const subFolder of listed.folders) {
			const folderName = subFolder.split('/').pop() ?? '';
			if (folderName.startsWith('.')) continue; // ignore hidden folders like .git, .obsidian

			const stat = await this.plugin.app.vault.adapter.stat(subFolder);
			if (!stat) continue;
			// Check for symlinks on desktop only (fs.lstatSync not available on mobile)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const maybeLstat = (fs as any)?.lstatSync;
			if (maybeLstat) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const basePath = (this.plugin.app.vault.adapter as any).basePath;
				if (basePath) {
					try {
						const abs = normalizePath(`${basePath}/${subFolder}`);
						if (maybeLstat(abs).isSymbolicLink()) continue;
					} catch {
						continue;
					}
				}
			}
			await this.scanFolder(subFolder, explorerPaths);
		}
	}

	private async loadHiddenFiles(): Promise<void> {
		try {
			const explorerPaths = this.getExplorerPaths();
			const rootPath = this.folder?.path ?? '/';
			await this.scanFolder(rootPath, explorerPaths);

			if (this.hiddenFiles.length === 0) {
				new Notice('No hidden files found in this folder');
				this.close();
			}
		} catch (error) {
			new Notice('Failed to load hidden files');
			console.error('Error loading hidden files:', error);
			this.close();
		}
	}

	getSuggestions(query: string): HiddenFileSuggestion[] {
		return this.hiddenFiles.filter((file) =>
			file.path.toLowerCase().includes(query.toLowerCase())
		);
	}

	async onChooseSuggestion(item: HiddenFileSuggestion): Promise<void> {
		const path = normalizePath(item.path);
		await CodeEditorView.openExternalFile(path, this.plugin);
	}

	renderSuggestion(item: HiddenFileSuggestion, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'suggestion-content' });
		container.createDiv({ text: item.path, cls: 'suggestion-title' });

		const sizeKB = (item.size / 1024).toFixed(1);
		container.createDiv({
			text: `${sizeKB} KB`,
			cls: 'suggestion-note'
		});
	}
}
