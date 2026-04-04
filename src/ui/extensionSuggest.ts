import { AbstractInputSuggest } from 'obsidian';
import type CodeFilesPlugin from './main.ts';

/** Reusable autocomplete suggester for registered extensions, attached to a text input. */
export class ExtensionSuggest extends AbstractInputSuggest<string> {
	constructor(
		private plugin: CodeFilesPlugin,
		inputEl: HTMLInputElement,
		private onChoose: (ext: string) => void,
		private getExtensions: () => string[] = () => plugin.getActiveExtensions()
	) {
		super(plugin.app, inputEl);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase().replace(/^\./, '');
		return this.getExtensions().filter((ext) => ext.includes(q));
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
