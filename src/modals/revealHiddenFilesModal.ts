import { Modal, normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
  scanDotEntries,
  cleanStaleRevealedFiles,
  revealItems,
  unrevealItems,
  decorateFolders,
  getAdapter
} from '../utils/hiddenFiles/index.ts';
import {
  addExtension,
  getActiveExtensions,
  reregisterExtensions
} from '../utils/extensionUtils.ts';
import { getExtension } from '../utils/fileUtils.ts';
import type { FolderSection } from '../types/index.ts';

/**
 * Modal to scan, reveal, and hide dotfiles within a specific folder and its subfolders.
 */
export class RevealHiddenFilesModal extends Modal {
  plugin: CodeFilesPlugin;
  folderPath: string;
  private sections: FolderSection[] = [];
  private hasSubfolders = false;

  constructor(plugin: CodeFilesPlugin, folderPath: string) {
    super(plugin.app);
    this.plugin = plugin;
    this.folderPath = normalizePath(folderPath);
    if (this.folderPath === '/') this.folderPath = '';
  }

  async onOpen(): Promise<void> {
    this.renderLoading();
    await cleanStaleRevealedFiles(this.plugin);

    const allFolderPaths = [
      this.folderPath,
      ...(await this.getSubfolderPathsFromDisk(this.folderPath))
    ];

    this.hasSubfolders = allFolderPaths.length > 1;

    const activeExts = this.plugin.settings.isAutoRevealRegisteredDotfile
      ? getActiveExtensions(this.plugin.settings)
      : null;

    // Always fetch registered extensions to pre-check the registration column on re-open
    const registeredExts = getActiveExtensions(this.plugin.settings);

    this.sections = [];

    for (const folderPath of allFolderPaths) {
      const revealed = this.plugin.settings.revealedItems[folderPath] || [];
      const initialRevealed = new Set<string>(revealed);
      const selected = new Set<string>(revealed);

      const allItems = await scanDotEntries(this.plugin, folderPath);

      const items = activeExts
        ? allItems.filter((item) => {
            if (item.isFolder) return true;
            const ext = getExtension(item.name);
            return !ext || !activeExts.includes(ext);
          })
        : allItems;

      if (items.length === 0) continue;

      const itemPaths = new Set(items.map((i) => i.path));

      // Sync settings: remove stale entries that are now auto-managed
      const current = this.plugin.settings.revealedItems[folderPath] || [];
      const cleaned = current.filter((p) => itemPaths.has(p));
      if (cleaned.length !== current.length) {
        if (cleaned.length > 0) {
          this.plugin.settings.revealedItems[folderPath] = cleaned;
        } else {
          delete this.plugin.settings.revealedItems[folderPath];
        }
        await this.plugin.saveSettings();
        decorateFolders(this.plugin);
      }

      this.sections.push({
        folderPath,
        items,
        initialRevealed: new Set([...initialRevealed].filter((p) => itemPaths.has(p))),
        selected: new Set([...selected].filter((p) => itemPaths.has(p))),
        selectedForRegistration: new Set(
          items
            .filter((item) => {
              if (item.isFolder) return false;
              const ext = getExtension(item.name);
              return ext !== null && registeredExts.includes(ext);
            })
            .map((item) => item.path)
        )
      });
    }

    this.render();
  }

  /** Collects all non-hidden subfolders recursively via adapter.list(), independent of vault index state. */
  private async getSubfolderPathsFromDisk(folderPath: string): Promise<string[]> {
    const adapter = getAdapter(this.plugin);
    const results: string[] = [];

    const collect = async (dir: string): Promise<void> => {
      try {
        const listed = await adapter.list(dir || '');
        for (const rawFolder of listed.folders) {
          const childPath = normalizePath(rawFolder);
          const basename = childPath.split('/').pop() || '';
          if (basename.startsWith('.')) continue; // dot-subfolders are items to reveal, not containers to scan
          if (this.plugin.settings.excludedFolders.includes(basename)) continue;
          results.push(childPath);
          await collect(childPath);
        }
      } catch {
        /* ignore listing errors */
      }
    };

    await collect(folderPath);
    return results;
  }

  private renderLoading(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('hidden-files-modal');
    this.renderTitle(contentEl, false);
    contentEl.createEl('p', { text: 'Scanning folder...' });
  }

  private renderTitle(contentEl: HTMLElement, hasSubfolders: boolean): void {
    const titleEl = contentEl.createEl('h2', { cls: 'hidden-files-title' });
    titleEl.createSpan({ text: 'Hidden files in:' });
    if (this.folderPath) {
      titleEl.createSpan({
        cls: 'u-pop hidden-files-folder-path',
        text: ` ${this.folderPath}`
      });
    }
    if (hasSubfolders) {
      titleEl.createEl('small', {
        cls: 'hidden-files-subfolders-hint',
        text: ' + subfolders'
      });
    }
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const hasSubfolderSections = this.hasSubfolders || this.sections.length > 1;
    this.renderTitle(contentEl, hasSubfolderSections);

    if (this.sections.length === 0) {
      contentEl.createEl('p', {
        text: 'No hidden files found',
        cls: 'hidden-files-empty'
      });
      const buttonContainer = contentEl.createDiv({
        cls: 'modal-button-container'
      });
      buttonContainer
        .createEl('button', { text: 'Close' })
        .addEventListener('click', () => this.close());
      return;
    }

    // Two-column description (shown once at the top)
    const descEl = contentEl.createDiv({ cls: 'hidden-files-desc-columns' });
    const leftDesc = descEl.createDiv({ cls: 'hidden-files-desc-col' });
    for (const text of ['Check a file to reveal it', 'Uncheck to hide it again'])
      leftDesc.createEl('p', { text: `• ${text}` });
    const rightDesc = descEl.createDiv({ cls: 'hidden-files-desc-col' });
    rightDesc.createEl('p', { text: '• Register as code editor view' });
    const noteEl = rightDesc.createEl('p');
    noteEl.createSpan({
      text: '• This file will become always visible (unless isAutoRevealRegisteredDotfile is unchecked in plugin settings)'
    });

    contentEl.createEl('hr', { cls: 'hidden-files-separator' });

    for (let i = 0; i < this.sections.length; i++) {
      if (i > 0) {
        contentEl.createEl('hr', {
          cls: 'hidden-files-separator hidden-files-section-separator'
        });
      }
      this.renderSection(contentEl, this.sections[i], hasSubfolderSections);
    }

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    buttonContainer
      .createEl('button', { text: 'Apply', cls: 'mod-cta' })
      .addEventListener('click', async () => {
        let anyRegistered = false;

        // 1. Process registrations first
        for (const section of this.sections) {
          for (const filePath of section.selectedForRegistration) {
            const item = section.items.find((i) => i.path === filePath);
            if (!item || item.isFolder) continue;
            const ext = getExtension(item.name);
            if (ext && addExtension(this.plugin.settings, ext)) anyRegistered = true;
          }
        }

        if (anyRegistered) {
          await reregisterExtensions(this.plugin);
        }

        // 2. Then process reveal / unreveal items to avoid visual flash
        for (const section of this.sections) {
          const toReveal = section.items
            .filter(
              (item) =>
                section.selected.has(item.path) &&
                !section.selectedForRegistration.has(item.path)
            )
            .map((item) => item.path);

          const toHide = section.items
            .filter(
              (item) =>
                !section.selected.has(item.path) && section.initialRevealed.has(item.path)
            )
            .map((item) => item.path);

          if (toHide.length > 0)
            await unrevealItems(this.plugin, section.folderPath, toHide);
          if (toReveal.length > 0)
            await revealItems(this.plugin, section.folderPath, toReveal);

          if (
            section.selected.size === 0 &&
            toHide.length === 0 &&
            toReveal.length === 0
          ) {
            delete this.plugin.settings.revealedItems[section.folderPath];
            await this.plugin.saveSettings();
            decorateFolders(this.plugin);
          }
        }

        this.close();
      });

    buttonContainer
      .createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close());
  }

  private renderSection(
    contentEl: HTMLElement,
    section: FolderSection,
    showFolderLabel: boolean
  ): void {
    if (showFolderLabel) {
      const sectionHeader = contentEl.createDiv({
        cls: 'hidden-files-section-header'
      });
      sectionHeader.createSpan({
        cls: 'u-pop hidden-files-folder-path',
        text: section.folderPath || '(vault root)'
      });
    }

    const listEl = contentEl.createDiv({ cls: 'hidden-files-list' });
    const registerableItems = section.items.filter(
      (i) => !i.isFolder && getExtension(i.name)
    );

    // Master row
    const masterEl = listEl.createDiv({ cls: 'hidden-file-item hidden-file-master' });
    const masterRevealSection = masterEl.createDiv({
      cls: 'hidden-file-reveal-section'
    });
    const masterReveal = masterRevealSection.createEl('input', { type: 'checkbox' });
    masterReveal.checked = section.items.every((i) => section.selected.has(i.path));
    masterReveal.indeterminate = !masterReveal.checked && section.selected.size > 0;
    masterRevealSection.createSpan({ text: 'All' });

    const masterRegisterSection = masterEl.createDiv({
      cls: 'hidden-file-register-section'
    });
    const masterRegister = masterRegisterSection.createEl('input', {
      type: 'checkbox'
    });
    masterRegister.checked =
      registerableItems.length > 0 &&
      registerableItems.every((i) => section.selectedForRegistration.has(i.path));
    masterRegister.indeterminate =
      !masterRegister.checked && section.selectedForRegistration.size > 0;
    masterRegisterSection.createSpan({ text: 'All' });

    const itemRevealCbs: HTMLInputElement[] = [];
    const itemRegisterCbs: HTMLInputElement[] = [];

    for (const item of section.items) {
      const ext = item.isFolder ? null : getExtension(item.name);
      const rowEl = listEl.createDiv({ cls: 'hidden-file-item' });

      const revealSec = rowEl.createDiv({ cls: 'hidden-file-reveal-section' });
      const revealCb = revealSec.createEl('input', { type: 'checkbox' });
      revealCb.checked = section.selected.has(item.path);
      itemRevealCbs.push(revealCb);
      revealSec.createSpan({
        cls: 'hidden-file-icon',
        text: item.isFolder ? '📁' : '📄'
      });
      revealSec.createSpan({ cls: 'hidden-file-name', text: item.name });
      if (!item.isFolder) {
        revealSec.createSpan({
          cls: 'hidden-file-size',
          text: this.formatSize(item.size)
        });
      }

      const registerSec = rowEl.createDiv({ cls: 'hidden-file-register-section' });
      if (!item.isFolder && ext) {
        const registerCb = registerSec.createEl('input', { type: 'checkbox' });
        registerCb.checked = section.selectedForRegistration.has(item.path);
        itemRegisterCbs.push(registerCb);
        registerSec.createSpan({ text: `register as .${ext}` });

        registerCb.addEventListener('change', () => {
          if (registerCb.checked) {
            section.selectedForRegistration.add(item.path);
            // Registering an extension makes it auto-visible: force reveal checked.
            revealCb.checked = true;
            section.selected.add(item.path);
            masterReveal.checked = section.items.every((i) => section.selected.has(i.path));
            masterReveal.indeterminate = !masterReveal.checked && section.selected.size > 0;
          } else {
            section.selectedForRegistration.delete(item.path);
          }
          masterRegister.checked = registerableItems.every((i) =>
            section.selectedForRegistration.has(i.path)
          );
          masterRegister.indeterminate =
            !masterRegister.checked && section.selectedForRegistration.size > 0;
        });
      }

      revealCb.addEventListener('change', () => {
        if (revealCb.checked) section.selected.add(item.path);
        else section.selected.delete(item.path);
        masterReveal.checked = section.items.every((i) => section.selected.has(i.path));
        masterReveal.indeterminate = !masterReveal.checked && section.selected.size > 0;
      });
    }

    masterReveal.addEventListener('change', () => {
      if (masterReveal.checked)
        section.items.forEach((i) => section.selected.add(i.path));
      else section.items.forEach((i) => section.selected.delete(i.path));
      itemRevealCbs.forEach((cb) => (cb.checked = masterReveal.checked));
    });

    masterRegister.addEventListener('change', () => {
      if (masterRegister.checked)
        registerableItems.forEach((i) => section.selectedForRegistration.add(i.path));
      else
        registerableItems.forEach((i) => section.selectedForRegistration.delete(i.path));
      itemRegisterCbs.forEach((cb) => (cb.checked = masterRegister.checked));
    });
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
