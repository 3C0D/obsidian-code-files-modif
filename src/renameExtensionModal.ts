import { ButtonComponent, Modal, Notice, TextComponent } from 'obsidian';
import type { TFile } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { ExtensionSuggest } from './extensionSuggest.ts';
import { confirmation } from './confirmation.ts';
import { isCodeFilesExtension, getCodeEditorViews } from './extensionUtils.ts';

export class RenameExtensionModal extends Modal {
	private newExt: string;

	constructor(
		private plugin: CodeFilesPlugin,
		private file: TFile
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
		input.setPlaceholder('ext — unknown extensions will be registered');
		input.setValue(this.newExt);
		input.inputEl.style.flexGrow = '1';
		input.onChange((value) => {
			this.newExt = value.replace(/^\./, '');
			pathDisplay.textContent = this.getNewPath();
		});
		input.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') void this.save();
			if (e.key === 'Escape') this.close();
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

		new ButtonComponent(row).setButtonText('Rename').setCta().onClick(() => void this.save());

		input.inputEl.focus();
		input.inputEl.select();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private getNewPath(): string {
		const base = this.getBasePath();
		const cleanExt = this.newExt.replace(/^\./, '').trim();
		return cleanExt ? `${base}.${cleanExt}` : base;
	}

	private getBasePath(): string {
		const { path, extension } = this.file;
		return extension ? path.slice(0, path.length - extension.length - 1) : path;
	}

	private async save(): Promise<void> {
		const ext = this.newExt.replace(/^\./, '').trim();

		if (!ext) {
			new Notice('Please enter an extension');
			return;
		}

		const newPath = `${this.getBasePath()}.${ext}`;
		if (newPath === this.file.path) {
			this.close();
			return;
		}

		// Register with CodeFiles if unknown to both CodeFiles and Obsidian
		const isKnown = isCodeFilesExtension(this.app, ext)
			|| !!this.plugin.app.viewRegistry.typeByExtension[ext];
		if (!isKnown) {
			const ok = await confirmation(
				this.app,
				`".${ext}" is not a registered extension. Register it with Code Files?`
			);
			if (!ok) return;
			this.plugin.addExtension(ext);
			this.plugin.registerExtension(ext);
			await this.plugin.saveSettings();
			this.plugin.syncRegisteredExts();
			new Notice(`".${ext}" registered with Code Files`);
		}

		this.close();

		try {
			await this.app.vault.rename(this.file, newPath);
		} catch (e) {
			new Notice('Failed to rename file');
			console.error(e);
			return;
		}

		// Reload the leaf so the correct view opens for the new extension
		const renamedFile = this.plugin.app.vault.getFileByPath(newPath);
		if (!renamedFile) return;
		
		// Find the leaf that has this file open (any view type)
		const leaves = this.plugin.app.workspace.getLeavesOfType('markdown')
			.concat(this.plugin.app.workspace.getLeavesOfType('empty'))
			.concat(getCodeEditorViews(this.app).map(v => v.leaf));
		const leaf = leaves.find(l => {
			const view = l.view;
			if ('file' in view && view.file) return view.file.path === newPath;
			return false;
		}) ?? this.plugin.app.workspace.getMostRecentLeaf();
		
		if (leaf) await leaf.openFile(renamedFile);
	}
}
