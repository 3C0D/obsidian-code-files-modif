import { SuggestModal, Notice } from 'obsidian';
import type CodeFilesPlugin from './main.ts';

type ExtensionSuggestion = { kind: 'add' | 'remove'; ext: string };

/** Modal to add or remove file extensions from the plugin's registered list.
 *  Typing an extension not in the list offers to add it.
 *  Typing an extension already in the list offers to remove it.
 *  The optional onUpdate callback receives the newly added extension (or undefined on remove),
 *  allowing callers like CreateCodeFileModal to refresh their UI immediately. */
export class ChooseExtensionModal extends SuggestModal<ExtensionSuggestion> {
	private onUpdate: (newExt?: string) => void;

	constructor(
		private plugin: CodeFilesPlugin,
		onUpdate: (newExt?: string) => void = () => {}
	) {
		super(plugin.app);
		this.onUpdate = onUpdate;
		this.setPlaceholder('Type an extension to add or remove (e.g. rs, go, lua)');
	}

	getSuggestions(query: string): ExtensionSuggestion[] {
		const q = query.toLowerCase().replace(/^\./, '').trim();
		const current = this.plugin.settings.extensions;

		// Filter existing extensions matching the query
		const matches = current
			.filter((ext) => ext.includes(q))
			.map((ext): ExtensionSuggestion => ({ kind: 'remove', ext }));

		// If the query is non-empty and not already in the list, offer to add it
		if (q && !current.includes(q)) {
			return [{ kind: 'add', ext: q }, ...matches];
		}

		return matches;
	}

	renderSuggestion(item: ExtensionSuggestion, el: HTMLElement): void {
		el.setText(
			item.kind === 'add'
				? `Add ".${item.ext}"`
				: `Remove ".${item.ext}"`
		);
	}

	async onChooseSuggestion(item: ExtensionSuggestion): Promise<void> {
		const extensions = this.plugin.settings.extensions;

		if (item.kind === 'add') {
			if (!extensions.includes(item.ext)) {
				extensions.push(item.ext);
				new Notice(`Added ".${item.ext}" — restart Obsidian to apply`);
			}
			await this.plugin.saveSettings();
			this.onUpdate(item.ext);
		} else {
			const idx = extensions.indexOf(item.ext);
			if (idx !== -1) {
				extensions.splice(idx, 1);
				new Notice(`Removed ".${item.ext}" — restart Obsidian to apply`);
			}
			await this.plugin.saveSettings();
			this.onUpdate();
		}
	}
}
