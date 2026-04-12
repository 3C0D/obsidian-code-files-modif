/**
 * Modal for choosing or creating CSS snippet files.
 * Lists existing snippets in .obsidian/snippets/ with autocomplete.
 * Typing a new name offers to create a snippet file.
 * Opens the selected or created snippet in Monaco Editor.
 */
import { normalizePath, Notice, SuggestModal, TFile } from 'obsidian';
import { CodeEditorView } from '../editor/codeEditorView.ts';
import type CodeFilesPlugin from '../main.ts';
import type { CssSuggestion } from '../types/types.ts';

/** Modal for choosing an existing CSS file or creating a new one */
export class ChooseCssFileModal extends SuggestModal<CssSuggestion> {
	constructor(
		private plugin: CodeFilesPlugin,
		private cssFiles: string[]
	) {
		super(plugin.app);
	}

	/** Returns typed suggestions for the modal, each carrying the action to perform on selection */
	getSuggestions(query: string): CssSuggestion[] {
		// Filter matching filenames and tag each as 'existing' so onChooseSuggestion knows to open it
		const filtered = this.cssFiles
			.filter((name) => name.toLowerCase().includes(query.toLowerCase()))
			.map((name): CssSuggestion => ({ kind: 'existing', name }));

		// If the user typed something, append a 'new' suggestion to create a snippet with that name
		if (query && !this.cssFiles.includes(query)) {
			return [...filtered, { kind: 'new', name: query }];
		}
		return filtered;
	}

	/** Handles the user's selection by either opening the existing CSS file in the editor or creating a new one and then opening it */
	async onChooseSuggestion(item: CssSuggestion): Promise<void> {
		const snippetsDir = normalizePath(`${this.plugin.app.vault.configDir}/snippets`);
		const path = normalizePath(`${snippetsDir}/${item.name}.css`);

		if (item.kind === 'new') {
			// vault.create() only works for vault-indexed files,
			// so adapter.write is intentional here
			await this.plugin.app.vault.adapter.write(path, '');
			new Notice('Make sure to enable the new snippet in Obsidian options.');
		}

		// Snippets are outside the vault — use external mount.
		// TFile is constructed manually because the adapter
		// path is not indexed in the vault.
		// @ts-expect-error: TFile constructor is internal API
		const pseudoFile = new TFile(this.plugin.app.vault, path);
		await CodeEditorView.openExternalFile(pseudoFile, this.plugin);
	}

	renderSuggestion(item: CssSuggestion, el: HTMLElement): void {
		el.setText(
			item.kind === 'new' ? `Create new snippet "${item.name}.css"` : item.name
		);
	}
}
