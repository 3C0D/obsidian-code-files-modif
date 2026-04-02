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
		const current = this.plugin.settings.theme;
		const recent = this.plugin.settings.recentThemes.filter((t) => t !== current);
		const priority = [current, ...recent];
		const filtered = ALL_THEMES.filter((t) => t.toLowerCase().includes(q));
		return [
			...priority.filter((t) => filtered.includes(t)),
			...filtered.filter((t) => !priority.includes(t))
		];
	}

	renderSuggestion(theme: string, el: HTMLElement): void {
		el.setText(theme);
	}

	async onChooseSuggestion(theme: string | null): Promise<void> {
		if (!theme) return;
		const recent = [theme, ...this.plugin.settings.recentThemes.filter((t) => t !== theme)].slice(0, 5);
		this.plugin.settings.recentThemes = recent;
		this.plugin.settings.theme = theme;
		await this.plugin.saveSettings();
		await this.onChoose(theme);
	}
}
