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
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type { HiddenFileSuggestion } from '../types/types.ts';
import { getMaxFileSize, revealFiles } from '../utils/hiddenFilesUtils.ts';

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

/** Modal for choosing hidden files in a folder to open in Monaco.
 *  "Hidden" means absent from the vault's known files,
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
		// Load files asynchronously
		await this.loadHiddenFiles();
		// Trigger suggestions display immediately after loading
		this.inputEl.dispatchEvent(new Event('input'));
	}

	/** Builds the set of paths known to the vault.
	 * Uses vault.getFiles() instead of file-explorer UI state to avoid dependency on rendered UI,
	 * which may not be available or fully loaded during modal initialization. */
	private getVaultPaths(): Set<string> {
		return new Set(this.plugin.app.vault.getFiles().map((f) => f.path));
	}

	/** Recursively scans the folder for files present on disk but absent from vault's known files.
	 * This identifies "hidden" files that exist but aren't tracked by Obsidian's file system. */
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

			// Skip binary formats that can't be opened as text in Monaco editor
			if (EXCLUDED_EXTENSIONS.includes(ext)) continue;

			try {
				const stat = await this.plugin.app.vault.adapter.stat(filePath);
				// Skip large files to prevent performance issues in the editor
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
			// Skip dot-folders (e.g., .git, .obsidian) as they contain system/VCS data not meant for editing
			if (folderName.startsWith('.')) continue;

			const stat = await this.plugin.app.vault.adapter.stat(subFolder);
			if (!stat) continue;
			// Check for symlinks on desktop only (fs.lstatSync not available on mobile)
			// Symlinks can create infinite recursion if they point to parent directories, so skip them for safety
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fs = (window as any).require?.('fs');
			const maybeLstat = fs?.lstatSync;
			if (maybeLstat) {
				const adapter = getDataAdapterEx(this.app);
				const basePath = adapter.basePath;
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
			// Get known vault files for comparison
			const explorerPaths = this.getVaultPaths();
			const rootPath = this.folder?.path ?? '';
			await this.scanFolder(rootPath, explorerPaths);

			if (this.hiddenFiles.length === 0) {
				new Notice('No hidden files found in this folder');
				// Close modal since there's nothing to display
				this.close();
			}
		} catch (error) {
			new Notice('Failed to load hidden files');
			console.error('Error loading hidden files:', error);
			// Close modal on error to prevent user from getting stuck with empty state
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
		const folder = path.substring(0, path.lastIndexOf('/'));

		// Reveal silently without persisting so the file enters the vault index
		await revealFiles(this.plugin, folder, [path], true, false);

		const file = this.plugin.app.vault.getFileByPath(path);
		if (file) {
			await CodeEditorView.openVaultFile(file, this.plugin, true);
		} else {
			// Shouldnt happen
			await CodeEditorView.openExternalFile(path, this.plugin);
		}
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
