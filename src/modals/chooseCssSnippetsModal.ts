/**
 * Modal for choosing or creating CSS snippet files.
 * Lists existing snippets in .obsidian/snippets/ with autocomplete.
 * Typing a new name offers to create a snippet file.
 * Opens the selected or created snippet in Monaco Editor.
 */
import { normalizePath, Notice, SuggestModal } from 'obsidian';
import type { CssSuggestion } from '../types/types.ts';
import { openInMonacoLeaf } from '../editor/codeEditorView/editorOpeners.ts';
import type CodeFilesPlugin from '../main.ts';

/** Modal for choosing an existing CSS file or creating a new one */
export class ChooseCssFileModal extends SuggestModal<CssSuggestion> {
	constructor(
		private plugin: CodeFilesPlugin,
		private cssFiles: string[]
	) {
		super(plugin.app);
		this.setPlaceholder('Choose a snippet or type a name to create one...');
		this.scope.register([], 'Enter', (evt) => {
			const item = this.getSuggestions(this.inputEl.value)[
				this.chooser.selectedItem
			];
			if (item) {
				evt.preventDefault();
				void this.onChooseSuggestion(item);
				this.close();
			}
			return false;
		});
	}

	/** Returns typed suggestions for the modal, each carrying the action to perform on selection */
	getSuggestions(query: string): CssSuggestion[] {
		// Filter matching filenames and tag each as 'existing' so onChooseSuggestion knows to open it
		const filtered = this.cssFiles
			.filter((name) => this.fuzzyMatch(query, name))
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
			new Notice(
				'Enable the snippet via the toggle in the editor title bar.',
				4000
			);
		}
		await openInMonacoLeaf(path, this.plugin, true);
	}

	renderSuggestion(item: CssSuggestion, el: HTMLElement): void {
		el.setText(
			item.kind === 'new' ? `Create new snippet "${item.name}.css"` : item.name
		);
	}

	/** Fuzzy matching: returns true if all query characters appear in text in order */
	private fuzzyMatch(query: string, text: string): boolean {
		if (!query) return true;
		const q = query.toLowerCase();
		const t = text.toLowerCase();
		let qi = 0;
		for (let i = 0; i < t.length && qi < q.length; i++) {
			if (t[i] === q[qi]) qi++;
		}
		return qi === q.length;
	}
}
