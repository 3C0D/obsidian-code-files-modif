/**
 * Modal for renaming a file's extension.
 * Prompts for a new extension with autocomplete from registered extensions.
 * If the extension is unknown to both Code Files and Obsidian, offers to register it.
 * After renaming, reloads the leaf to open the file with the correct view for the new extension.
 */
import { ButtonComponent, FileView, Modal, Notice, TextComponent } from 'obsidian';
import type { TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { ExtensionSuggest } from '../ui/extensionSuggest.ts';
import { confirmation } from './confirmation.ts';
import {
	isCodeFilesExtension,
	getCodeEditorViews,
	addExtension,
	registerExtension,
	syncRegisteredExts
} from '../utils/extensionUtils.ts';

/** Prompts the user to rename a file's extension, updating the file and reloading the view. */
export class RenameExtensionModal extends Modal {
	private newExt: string;

	constructor(
		private plugin: CodeFilesPlugin,
		private file: TFile,
		private restoreFocus?: () => void
	) {
		super(plugin.app);
		this.newExt = file.extension;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.style.width = '360px';

		const pathDisplay = contentEl.createEl('p', {
			text: this.getNewPath(),
			attr: {
				style: 'color: var(--text-muted); font-size: 0.85em; margin-bottom: 12px; word-break: break-all;'
			}
		});

		const row = contentEl.createEl('div', {
			attr: { style: 'display: flex; gap: 8px; align-items: center;' }
		});

		const input = new TextComponent(row);
		input.setPlaceholder('ext. (registers if unknown after confirm)');
		input.inputEl.style.flexGrow = '1';
		input.onChange((value) => {
			this.newExt = value.replace(/^\./, '');
			pathDisplay.textContent = this.getNewPath();
		});

		this.scope.register([], 'Enter', (e) => {
			e.preventDefault();
			void this.save();
			return false;
		});

		new ExtensionSuggest(
			this.plugin,
			input.inputEl,
			(ext) => {
				input.setValue(ext);
				this.newExt = ext;
				pathDisplay.textContent = this.getNewPath();
			},
			() => Object.keys(this.plugin.app.viewRegistry.typeByExtension)
		);

		new ButtonComponent(row)
			.setButtonText('Rename')
			.setCta()
			.onClick(() => void this.save());

		input.inputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.restoreFocus?.();
	}

	private getNewPath(): string {
		const base = this.file.basename;
		const cleanExt = this.newExt.replace(/^\./, '').trim();
		return cleanExt ? `${base}.${cleanExt}` : base;
	}

	private async save(): Promise<void> {
		const ext = this.newExt.replace(/^\./, '').trim();

		if (!ext) {
			new Notice('Please enter an extension');
			return;
		}

		const newPath = `${this.file.basename}.${ext}`;
		if (newPath === this.file.path) {
			this.close();
			return;
		}

		// Register with CodeFiles if unknown to both CodeFiles and Obsidian
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
