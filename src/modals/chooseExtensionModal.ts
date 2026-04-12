/**
 * Modal for adding or removing file extensions from the plugin's registered list.
 * Typing an extension not in the list offers to add it.
 * Typing an extension already in the list offers to remove it.
 * Changes take effect immediately (register/unregister with Obsidian).
 */
import { SuggestModal, Notice } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import {
	getActiveExtensions,
	addExtension,
	removeExtension,
	registerExtension,
	unregisterExtension,
	syncRegisteredExts
} from '../utils/extensionUtils.ts';

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
		// Normalize query by removing leading dot, trimming whitespace, and converting to lowercase
		const q = query.toLowerCase().replace(/^\./, '').trim();
		const current = getActiveExtensions(this.plugin.settings);

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
		el.setText(item.kind === 'add' ? `Add ".${item.ext}"` : `Remove ".${item.ext}"`);
	}

	async onChooseSuggestion(item: ExtensionSuggestion): Promise<void> {
		if (item.kind === 'add') {
			addExtension(this.plugin.settings, item.ext);
			registerExtension(this.plugin, item.ext);
			new Notice(`Added ".${item.ext}"`);
			await this.plugin.saveSettings();
			syncRegisteredExts(this.plugin);
			this.onUpdate(item.ext);
		} else {
			removeExtension(this.plugin.settings, item.ext);
			unregisterExtension(this.plugin, item.ext);
			new Notice(`Removed ".${item.ext}"`);
			await this.plugin.saveSettings();
			syncRegisteredExts(this.plugin);
			this.onUpdate();
		}
	}
}
