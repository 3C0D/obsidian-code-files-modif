import { SuggestModal, TFile } from 'obsidian';
import { CodeEditorView } from './codeEditorView.ts';
import type CodeFilesPlugin from './main.ts';

// Typed suggestion to avoid encoding intent in a display string
type CssSuggestion = { kind: 'existing'; name: string } | { kind: 'new'; name: string };

export class ChooseCssFileModal extends SuggestModal<CssSuggestion> {
	constructor(
		private plugin: CodeFilesPlugin,
		private cssFiles: string[]
	) {
		super(plugin.app);
	}

	getSuggestions(query: string): CssSuggestion[] {
		const filtered = this.cssFiles
			.filter((name) => name.toLowerCase().includes(query.toLowerCase()))
			.map((name): CssSuggestion => ({ kind: 'existing', name }));

		if (query) {
			return [...filtered, { kind: 'new', name: query }];
		}
		return filtered;
	}

	async onChooseSuggestion(item: CssSuggestion): Promise<void> {
		// Snippets live in .obsidian/snippets/, outside vault index,
		// so we must build the path manually and use vault.adapter directly.
		const snippetsDir = `${this.app.vault.configDir}/snippets`;

		if (item.kind === 'new') {
			const path = `${snippetsDir}/${item.name}.css`;
			// vault.create() only works for vault-indexed files,
			// so adapter.write is intentional here.
			await this.app.vault.adapter.write(path, '');
			// TFile constructor is a workaround: no public API returns a TFile
			// for files outside the vault root.
			CodeEditorView.openFile(
				// @ts-expect-error
				new TFile(this.app.vault, path),
				this.plugin
			);
			new Notification('Make sure to enable new snippet in options.');
			return;
		}

		const path = `${snippetsDir}/${item.name}.css`;
		CodeEditorView.openFile(
			// @ts-expect-error
			new TFile(this.app.vault, path),
			this.plugin
		);
		return;
	}

	renderSuggestion(item: CssSuggestion, el: HTMLElement): void {
		el.setText(
			item.kind === 'new' ? `Create new snippet "${item.name}.css"` : item.name
		);
	}
}
