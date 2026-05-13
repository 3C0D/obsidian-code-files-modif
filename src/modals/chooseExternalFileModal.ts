/**
 * Modal for browsing and opening external files in the config folder (e.g. .obsidian/).
 * Recursively scans the config folder, filters by size and extension,
 * and opens selected files in Monaco Editor.
 */
import { FuzzySuggestModal,Notice } from 'obsidian';
import type { FuzzyMatch } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { getMaxFileSize, isSymlink } from '../utils/hiddenFiles/index.ts';
import type { FileSuggestion } from '../types/index.ts';
import { EXCLUDED_EXTENSIONS } from '../types/index.ts';
import { openInMonacoLeaf } from '../editor/codeEditorView/editorOpeners.ts';

export class ExternalFileBrowserModal extends FuzzySuggestModal<FileSuggestion> {
  private files: FileSuggestion[] = [];

  constructor(private plugin: CodeFilesPlugin) {
    super(plugin.app);
    this.setPlaceholder(`Search files in ${this.plugin.app.vault.configDir}/...`);
  }

  async onOpen(): Promise<void> {
    super.onOpen();
    await this.loadFiles();
    this.inputEl.dispatchEvent(new Event('input'));
  }

  private async loadFiles(): Promise<void> {
    try {
      const configPath = this.plugin.app.vault.configDir;
      await this.scanFolder(configPath);

      if (this.files.length === 0) {
        new Notice(`No files found in ${this.plugin.app.vault.configDir}/`);
        this.close();
      }
    } catch (error) {
      new Notice('Failed to load files');
      console.error('Error loading files:', error);
      this.close();
    }
  }

  private async scanFolder(folderPath: string): Promise<void> {
    const listed = await this.plugin.app.vault.adapter.list(folderPath);

    // Scan files
    for (const filePath of listed.files) {
      const fileName = filePath.split('/').pop() ?? '';
      const ext = fileName.includes('.')
        ? (fileName.split('.').pop()?.toLowerCase() ?? '')
        : '';

      // Skip excluded extensions
      if (EXCLUDED_EXTENSIONS.includes(ext)) continue;

      if (isSymlink(this.plugin, filePath)) continue;

      try {
        const stat = await this.plugin.app.vault.adapter.stat(filePath);
        if (!stat || stat.size > getMaxFileSize(this.plugin)) continue;

        this.files.push({
          name: fileName,
          path: filePath,
          size: stat.size
        });
      } catch {
        continue;
      }
    }

    // Scan subfolders
    for (const subFolder of listed.folders) {
      const folderName = subFolder.split('/').pop() ?? '';

      // Skip excluded folders from settings
      if (this.plugin.settings.excludedFolders.includes(folderName)) {
        continue;
      }

      if (isSymlink(this.plugin, subFolder)) continue;

      await this.scanFolder(subFolder);
    }
  }

  getItems(): FileSuggestion[] {
    return this.files;
  }

  getItemText(item: FileSuggestion): string {
    return item.path;
  }

  async onChooseItem(
    item: FileSuggestion,
    _evt: MouseEvent | KeyboardEvent
  ): Promise<void> {
    await openInMonacoLeaf(item.path, this.plugin, true);
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
