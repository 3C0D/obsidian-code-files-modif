import { SuggestModal } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { themes } from './themes.ts';

const ALL_THEMES = ['default', ...themes];

/** SuggestModal to pick a Monaco editor theme with live preview.
 *  Navigating the list applies the theme instantly to the editor.
 *  Confirming saves it; closing without confirming restores the original theme. */
export class ChooseThemeModal extends SuggestModal<string> {
	private originalTheme: string;
	private confirmed = false;

	private observer: MutationObserver;

	constructor(
		private plugin: CodeFilesPlugin,
		private onChoose: (theme: string) => void | Promise<void>,
		private applyTheme: (theme: string) => void
	) {
		super(plugin.app);
		this.originalTheme = plugin.settings.theme;
		this.setPlaceholder('Choose a theme');
		this.modalEl.style.width = '300px';

		this.observer = new MutationObserver(() => {
			const selected = this.resultContainerEl.querySelector('.is-selected');
			if (selected) this.applyTheme(selected.textContent ?? '');
		});
		this.observer.observe(this.resultContainerEl, { subtree: true, attributeFilter: ['class'] });
	}

	onOpen(): void {
		super.onOpen();
		const { modalEl } = this;
		modalEl.style.position = 'fixed';
		modalEl.style.left = '50%';
		modalEl.style.top = '10%';
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

	onChooseSuggestion(theme: string | null): void {
		if (!theme) return;
		this.confirmed = true;
		const recent = [theme, ...this.plugin.settings.recentThemes.filter((t) => t !== theme)].slice(0, 5);
		this.plugin.settings.recentThemes = recent;
		this.plugin.settings.theme = theme;
		void this.plugin.saveSettings();
		void this.onChoose(theme);
	}

	onClose(): void {
		super.onClose();
		this.observer.disconnect();
		if (!this.confirmed) {
			this.applyTheme(this.originalTheme);
		}
	}
}
