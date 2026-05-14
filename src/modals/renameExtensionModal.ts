/**
 * Modal for renaming a file (name + extension).
 * Displays the current full filename and allows editing both name and extension.
 * If the new extension is unknown to both Code Files and Obsidian, offers to register it.
 * After renaming, reloads the leaf to open the file with the correct view for the new extension.
 */
import { ButtonComponent, Modal, Notice, TextComponent, View } from 'obsidian';
import type { TFile, WorkspaceLeaf } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { confirmation } from './confirmationModal.ts';
import {
  addExtension,
  registerExtension,
  syncRegisteredExts
} from '../utils/extensionUtils.ts';
import { getExtension } from '../utils/fileUtils.ts';
import { ExtensionSuggest } from '../ui/extensionSuggest.ts';
import { getActiveExtensions } from '../utils/extensionUtils.ts';
import { revealItems } from '../utils/hiddenFiles/operations.ts';
import { viewType } from '../types/variables.ts';

/** Prompts the user to rename a file (name + extension), updating the file and reloading the view. */
export class RenameExtensionModal extends Modal {
  constructor(
    private plugin: CodeFilesPlugin,
    private file: TFile,
    private restoreFocus?: () => void
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.display = 'flex';
    contentEl.style.flexDirection = 'column';
    contentEl.style.gap = '8px';
    this.modalEl.style.width = 'min(480px, 90vw)';

    // Current filename display
    contentEl.createEl('div', {
      text: 'Current:',
      attr: { style: 'font-weight: 500; font-size: 0.9em;' }
    });
    contentEl.createEl('div', {
      text: this.file.name,
      attr: {
        style:
          'color: var(--text-muted); margin-bottom: 8px; font-family: var(--font-monospace); word-break: break-all;'
      }
    });

    // Name + extension row
    const inputRow = contentEl.createEl('div', {
      attr: {
        style: 'display: flex; align-items: center; gap: 4px; flex-wrap: wrap;'
      }
    });

    const nameInput = new TextComponent(inputRow);
    nameInput.inputEl.style.flex = '1';
    nameInput.inputEl.style.minWidth = '0';

    // Pre-fill name and extension from current file
    const currentExt = getExtension(this.file.name);
    const currentName = currentExt
      ? this.file.name.slice(0, -(currentExt.length + 1))
      : this.file.name;
    nameInput.setValue(currentName);

    const extInput = new TextComponent(inputRow);
    extInput.setPlaceholder('.ext');
    extInput.inputEl.style.width = '80px';
    if (currentExt) extInput.setValue(currentExt);

    new ExtensionSuggest(this.plugin, extInput.inputEl, (ext) => {
      extInput.setValue(ext);
    });

    new ButtonComponent(inputRow).setButtonText('Cancel').onClick(() => this.close());

    new ButtonComponent(inputRow)
      .setButtonText('Rename')
      .setCta()
      .onClick(() => void this.save(nameInput, extInput));

    this.scope.register([], 'Enter', (e) => {
      e.preventDefault();
      void this.save(nameInput, extInput);
      return false;
    });

    nameInput.inputEl.focus();
    nameInput.inputEl.select();
  }

  onClose(): void {
    this.contentEl.empty();
    this.restoreFocus?.();
  }

  private async save(nameInput: TextComponent, extInput: TextComponent): Promise<void> {
    const ext = extInput.getValue().replace(/^\./, '').trim();
    let cleanName = nameInput.getValue().trim();

    if (!ext && !cleanName.startsWith('.')) {
      new Notice('Please enter a file extension');
      return;
    }

    let newFilename: string;
    const isExtRegistered = getActiveExtensions(this.plugin.settings).includes(ext);

    // Dotfile: no name, only extension
    if (!cleanName) {
      const confirmed = await confirmation(this.app, `Rename to dotfile: .${ext}?`);
      if (!confirmed) return;
      newFilename = `.${ext}`;
      // Hidden file typed directly in name field
    } else if (cleanName.startsWith('.') && !cleanName.slice(1).includes('.')) {
      newFilename = cleanName;
    } else {
      if (cleanName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
        cleanName = cleanName.slice(0, cleanName.length - ext.length - 1);
      } else if (cleanName.endsWith('.')) {
        cleanName = cleanName.slice(0, -1);
      }
      newFilename = `${cleanName}.${ext}`;
    }

    const newPath = this.file.parent
      ? `${this.file.parent.path}/${newFilename}`
      : newFilename;

    if (newPath === this.file.path) {
      this.close();
      return;
    }

    // Unregistered extension confirmation
    if (ext && !isExtRegistered) {
      const isKnown = !!this.plugin.app.viewRegistry.typeByExtension[ext];
      if (!isKnown) {
        const ok = await confirmation(
          this.plugin.app,
          `".${ext}" is not registered. Register it with Code Files?`
        );
        if (ok) {
          addExtension(this.plugin.settings, ext);
          registerExtension(this.plugin, ext);
          await this.plugin.saveSettings();
          syncRegisteredExts(this.plugin);
          new Notice(`".${ext}" registered with Code Files`);
        }
      }
    }

    // Check if any ancestor of this file is a revealed hidden folder
    // e.g. { "": [".obsidian"] } covers .obsidian/anything
    const allRevealedPaths = Object.values(this.plugin.settings.revealedItems).flat();
    const folderPath = this.file.parent?.path ?? '';
    const isInRevealedFolder = allRevealedPaths.some((p) =>
      this.file.path.startsWith(p + '/')
    );

    // View works even from the explorer
    const activeLeaf = this.plugin.app.workspace.getActiveViewOfType(View)?.leaf ?? null;

    // Snapshot only CodeFiles leaves for this file — Obsidian handles its own views natively
    const codeFilesLeaves: WorkspaceLeaf[] = [];
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      const stateFile = leaf.getViewState().state?.file as string | undefined;
      if (leaf.getViewState().type === viewType && stateFile === this.file.path) {
        codeFilesLeaves.push(leaf);
      }
    });

    this.close();

    try {
      await this.plugin.app.vault.rename(this.file, newPath);
    } catch (e) {
      new Notice('Failed to rename file');
      console.error(e);
      return;
    }

    const renamedFile = this.plugin.app.vault.getFileByPath(newPath);
    if (!renamedFile) return;

    if (isInRevealedFolder) {
      await revealItems(this.plugin, folderPath, [newPath], false);
    }

    // Reopen CodeFiles leaves with the new path.
    // Obsidian handles its own view types (markdown, PDF, etc.) natively on rename.
    const isCodeFilesExt =
      !ext || getActiveExtensions(this.plugin.settings).includes(ext);

    for (const leaf of codeFilesLeaves) {
      const isActive = leaf === activeLeaf;
      if (isCodeFilesExt) {
        await leaf.setViewState({
          type: viewType,
          active: isActive,
          state: { file: renamedFile.path }
        });
      } else {
        // Extension changed to something Obsidian handles: reopen natively
        await leaf.openFile(renamedFile);
      }
    }
  }
}
