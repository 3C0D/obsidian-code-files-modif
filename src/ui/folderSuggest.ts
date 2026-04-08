import { AbstractInputSuggest, TFolder } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';

/** Autocomplete suggester for vault folders, attached to a text input. */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		private plugin: CodeFilesPlugin,
		inputEl: HTMLInputElement,
		private onChoose: (folder: TFolder) => void
	) {
		super(plugin.app, inputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const folders: TFolder[] = [];
		const allFiles = this.plugin.app.vault.getAllLoadedFiles();
		
		for (const file of allFiles) {
			if (file instanceof TFolder) {
				folders.push(file);
			}
		}

		const q = query.toLowerCase();
		if (!q) return folders;

		return folders
			.filter((folder) => folder.path.toLowerCase().includes(q))
			.sort((a, b) => {
				const aStarts = a.path.toLowerCase().startsWith(q);
				const bStarts = b.path.toLowerCase().startsWith(q);
				if (aStarts !== bStarts) return aStarts ? -1 : 1;
				return a.path.localeCompare(b.path);
			});
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.onChoose(folder);
		this.setValue(folder.path);
		this.close();
	}
}
