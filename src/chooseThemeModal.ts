import { SuggestModal } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { themes } from './themes.ts';

const ALL_THEMES = ['default', ...themes];

/** SuggestModal to pick a Monaco editor theme and apply it immediately. */
export class ChooseThemeModal extends SuggestModal<string> {
	constructor(
		private plugin: CodeFilesPlugin,
		private onChoose: (theme: string) => void | Promise<void>
	) {
		super(plugin.app);
		this.setPlaceholder('Choose a theme');
	}

	getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		return ALL_THEMES.filter((t) => t.toLowerCase().includes(q));
	}

	renderSuggestion(theme: string, el: HTMLElement): void {
		el.setText(theme);
	}

	async onChooseSuggestion(theme: string | null): Promise<void> {
		if (!theme) return;
		this.plugin.settings.theme = theme;
		await this.plugin.saveSettings();
		await this.onChoose(theme);
	}
}
