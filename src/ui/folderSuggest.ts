import type { TFolder } from 'obsidian';
import { AbstractInputSuggest } from 'obsidian';
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
		const folders = this.plugin.app.vault.getAllFolders(true);
		const q = query.toLowerCase();
		if (!q) return folders;

		return folders
			.filter((folder) => folder.path.toLowerCase().includes(q))
			// Sort folders that start with the query first, then alphabetically
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
