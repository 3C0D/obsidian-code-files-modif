/**
 * Reusable autocomplete suggester for registered file extensions.
 * Attaches to a text input and provides filtered suggestions as the user types.
 * Used in CreateCodeFileModal, RenameExtensionModal, and settings tab.
 */
import { AbstractInputSuggest } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { getActiveExtensions } from '../utils/extensionUtils.ts';

/** Reusable autocomplete suggester for registered extensions, attached to a text input. */
export class ExtensionSuggest extends AbstractInputSuggest<string> {
	/**
	 * @param plugin - The plugin instance
	 * @param inputEl - The text input element to attach the suggester to
	 * @param onChoose - Callback invoked when a suggestion is selected. Receives the chosen extension (without leading dot).
	 * @param getExtensions - Optional function to provide the list of extensions. Defaults to getActiveExtensions().
	 */
	constructor(
		plugin: CodeFilesPlugin,
		inputEl: HTMLInputElement,
		private onChoose: (ext: string) => void,
		private getExtensions: () => string[] = () => getActiveExtensions(plugin.settings)
	) {
		super(plugin.app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase().replace(/^\./, '');
		return this.getExtensions()
			.filter((ext) => ext.includes(q))
			// Sort extensions that start with the query first, then alphabetically
			.sort((a, b) => {
				const aStarts = a.startsWith(q);
				const bStarts = b.startsWith(q);
				if (aStarts !== bStarts) return aStarts ? -1 : 1;
				return a.localeCompare(b);
			});
	}

	renderSuggestion(ext: string, el: HTMLElement): void {
		el.setText(`.${ext}`);
	}

	selectSuggestion(ext: string): void {
		this.onChoose(ext);
		this.setValue(ext);
		this.close();
	}
}
