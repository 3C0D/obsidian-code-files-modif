/**
 * Modal for renaming a file (name + extension).
 * Displays the current full filename and allows editing both name and extension.
 * If the new extension is unknown to both Code Files and Obsidian, offers to register it.
 * After renaming, reloads the leaf to open the file with the correct view for the new extension.
 */
import { ButtonComponent, FileView, Modal, Notice, TextComponent } from 'obsidian';
import type { TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { confirmation } from './confirmation.ts';
import {
	isCodeFilesExtension,
	getCodeEditorViews,
	addExtension,
	registerExtension,
	syncRegisteredExts
} from '../utils/extensionUtils.ts';

/** Prompts the user to rename a file (name + extension), updating the file and reloading the view. */
export class RenameExtensionModal extends Modal {
	private newFilename: string;

	constructor(
		private plugin: CodeFilesPlugin,
		private file: TFile,
		private restoreFocus?: () => void
	) {
		super(plugin.app);
		this.newFilename = file.name;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.style.width = '400px';

		// Display current filename
		contentEl.createEl('div', {
			text: 'Current:',
			attr: {
				style: 'font-weight: 500; margin-bottom: 4px; font-size: 0.9em;'
			}
		});
		contentEl.createEl('div', {
			text: this.file.name,
			attr: {
				style: 'color: var(--text-muted); margin-bottom: 16px; font-family: var(--font-monospace); word-break: break-all;'
			}
		});

		// New filename input
		contentEl.createEl('div', {
			text: 'New filename:',
			attr: {
				style: 'font-weight: 500; margin-bottom: 4px; font-size: 0.9em;'
			}
		});

		const row = contentEl.createEl('div', {
			attr: { style: 'display: flex; gap: 8px; align-items: center;' }
		});

		const input = new TextComponent(row);
		input.setPlaceholder('filename.ext or .dotfile');
		input.setValue(this.newFilename);
		input.inputEl.style.flexGrow = '1';
		input.inputEl.style.fontFamily = 'var(--font-monospace)';
		input.onChange((value) => {
			this.newFilename = value.trim();
		});

		this.scope.register([], 'Enter', (e) => {
			e.preventDefault();
			void this.save();
			return false;
		});

		new ButtonComponent(row)
			.setButtonText('Rename')
			.setCta()
			.onClick(() => void this.save());

		input.inputEl.focus();
		input.inputEl.select();
	}

	onClose(): void {
		this.contentEl.empty();
		this.restoreFocus?.();
	}

	/** 
	 * Extracts the extension from a filename.
	 * Handles dotfiles (like .env, .pythonconfig) where the extension is the full name without the leading dot.
	 */
	private getExtension(filename: string): string {
		// Dotfile without extension: .env → "env"
		if (filename.startsWith('.') && !filename.includes('.', 1)) {
			return filename.slice(1);
		}
		// Normal file: myfile.py → "py"
		const lastDot = filename.lastIndexOf('.');
		return lastDot > 0 ? filename.slice(lastDot + 1) : '';
	}

	/** 
	 * Renames the file with the new filename (name + extension).
	 * Handles dotfiles (.env, .pythonconfig) and normal files (myfile.py).
	 * Registers unknown extensions with Code Files if user confirms.
	 */
	private async save(): Promise<void> {
		const newFilename = this.newFilename.trim();

		if (!newFilename) {
			new Notice('Please enter a filename');
			return;
		}

		// Construct new path
		const newPath = this.file.parent
			? `${this.file.parent.path}/${newFilename}`
			: newFilename;
		
		if (newPath === this.file.path) {
			this.close();
			return;
		}

		// Extract extension from new filename
		const ext = this.getExtension(newFilename);
		
		// Register with CodeFiles if extension exists and is unknown to both CodeFiles and Obsidian
		if (ext) {
			const isKnown =
				isCodeFilesExtension(this.plugin.app, ext) ||
				!!this.plugin.app.viewRegistry.typeByExtension[ext];
			if (!isKnown) {
				const ok = await confirmation(
					this.plugin.app,
					`".${ext}" is not a registered extension. Register it with Code Files?`
				);
				if (!ok) return;
				addExtension(this.plugin.settings, ext);
				registerExtension(this.plugin, ext);
				await this.plugin.saveSettings();
				syncRegisteredExts(this.plugin);
				new Notice(`".${ext}" registered with Code Files`);
			}
		}

		this.close();

		try {
			await this.plugin.app.vault.rename(this.file, newPath);
		} catch (e) {
			new Notice('Failed to rename file');
			console.error(e);
			return;
		}

		// Reload the leaf so the correct view opens for the new extension
		const renamedFile = this.plugin.app.vault.getFileByPath(newPath);
		if (!renamedFile) return;

		// Find the leaf that has this file open (any view type)
		const leaves = this.plugin.app.workspace
			.getLeavesOfType('markdown')
			.concat(this.plugin.app.workspace.getLeavesOfType('empty'))
			.concat(getCodeEditorViews(this.app).map((v) => v.leaf));
		const leaf =
			leaves.find((l) => {
				const view = l.view;
				if (view instanceof FileView && view.file)
					return view.file.path === newPath;
				return false;
			}) ?? this.plugin.app.workspace.getMostRecentLeaf();

		if (leaf) await leaf.openFile(renamedFile);
	}
}
