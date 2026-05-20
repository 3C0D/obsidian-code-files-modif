/**
 * Modal for discovering and opening hidden files in Monaco.
 * "Hidden" means files not displayed in Obsidian's file explorer tree,
 * regardless of their extension (e.g., .gitignore, .env, .dockerignore).
 * Recursively scans a folder or the entire vault, filtering by size (max 10MB)
 * and excluding binary formats (executables, archives, databases, fonts).
 */
import type { TFolder } from 'obsidian';
import { FuzzySuggestModal, normalizePath, Notice } from 'obsidian';
import type { FuzzyMatch } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { handleTemporaryReveal, isSymlink } from '../utils/hiddenFiles/index.ts';
import { getMaxFileSize } from '../utils/fileUtils.ts';
import { EXCLUDED_EXTENSIONS, type FileSuggestion } from '../types/index.ts';
import { openInMonacoLeaf } from '../editor/codeEditorView/editorOpeners.ts';

/** Modal for choosing hidden files in a folder to open in Monaco.
 *  "Hidden" means absent from the vault's known files,
 *  regardless of registered extensions. */
export class ChooseHiddenFileModal extends FuzzySuggestModal<FileSuggestion> {
  private hiddenFiles: FileSuggestion[] = [];

  constructor(
    private plugin: CodeFilesPlugin,
    private folder?: TFolder
  ) {
    super(plugin.app);
    this.setPlaceholder('Search hidden files...');
    this.setInstructions([
      {
        command: '💡',
        purpose:
          'Files inside revealed hidden folders are also included. For .obsidian, use "Open config files".'
      }
    ]);
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
    const configDir = this.plugin.app.vault.configDir;

    for (const rawPath of listed.files) {
      const filePath = normalizePath(rawPath);
      if (explorerPaths.has(filePath)) continue;

      const fileName = filePath.split('/').pop() ?? '';
      const ext = fileName.includes('.')
        ? (fileName.split('.').pop()?.toLowerCase() ?? '')
        : '';

      // Skip binary formats that can't be opened as text in Monaco editor
      if (EXCLUDED_EXTENSIONS.includes(ext)) continue;

      if (isSymlink(this.plugin, filePath)) continue;

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

    for (const rawSubFolder of listed.folders) {
      const subFolder = normalizePath(rawSubFolder);
      const folderName = subFolder.split('/').pop() ?? '';

      // configDir (.obsidian) is handled by ExternalFileBrowserModal — never recurse into it
      if (subFolder === configDir || subFolder.startsWith(`${configDir}/`)) continue;

      if (folderName.startsWith('.')) {
        // Only recurse into dot-folders explicitly revealed by the user via RevealHiddenFilesModal.
        // getAbstractFileByPath() is wrong here: .obsidian is indexed by Obsidian itself and would pass that check.
        const isRevealedFolder = Object.values(this.plugin.settings.revealedItems)
          .flat()
          .includes(subFolder);
        if (!isRevealedFolder) continue;
      }
      if (isSymlink(this.plugin, subFolder)) continue;
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

  getItems(): FileSuggestion[] {
    return this.hiddenFiles;
  }

  getItemText(item: FileSuggestion): string {
    return item.path;
  }

  async onChooseItem(
    item: FileSuggestion,
    _evt: MouseEvent | KeyboardEvent
  ): Promise<void> {
    const path = normalizePath(item.path);
    await handleTemporaryReveal(this.plugin, path);
    await openInMonacoLeaf(path, this.plugin, true, null, false, true);
  }

  renderSuggestion(item: FuzzyMatch<FileSuggestion>, el: HTMLElement): void {
    const container = el.createDiv({ cls: 'suggestion-content' });
    container.createDiv({ text: item.item.path, cls: 'suggestion-title' });

    const sizeKB = (item.item.size / 1024).toFixed(1);
    container.createDiv({
      text: `${sizeKB} KB`,
      cls: 'suggestion-note'
    });
  }
}
