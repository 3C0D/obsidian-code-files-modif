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

	constructor(
		private plugin: CodeFilesPlugin,
		private onChoose: (theme: string) => void | Promise<void>,
		private applyTheme: (theme: string) => void
	) {
		super(plugin.app);
		this.originalTheme = plugin.settings.theme;
		this.setPlaceholder('Choose a theme');
		this.modalEl.style.width = '300px';

		const previewSelected = (): void => {
			const chooser = this.chooser as { values?: string[]; selectedItem?: number };
			const theme = chooser?.values?.[chooser?.selectedItem ?? -1];
			if (theme) this.applyTheme(theme);
		};
		this.scope.register([], 'ArrowDown', () => {
			setTimeout(previewSelected, 0);
			return true;
		});
		this.scope.register([], 'ArrowUp', () => {
			setTimeout(previewSelected, 0);
			return true;
		});
	}

	onOpen(): void {
		super.onOpen();
		setTimeout(() => {
			const bg = document.querySelector<HTMLElement>('.modal-bg');
			if (bg) bg.style.opacity = '0';
		}, 0);
		this.modalEl.style.position = 'fixed';
		this.modalEl.style.left = '50%';
		this.modalEl.style.top = '10%';

		this.resultContainerEl.addEventListener('mousemove', (e) => {
			const item = (e.target as HTMLElement).closest('.suggestion-item');
			if (!item) return;
			const items = this.resultContainerEl.querySelectorAll('.suggestion-item');
			const idx = Array.from(items).indexOf(item as HTMLElement);
			const chooser = this.chooser as {
				values?: string[];
				setSelectedItem?: (i: number, e: MouseEvent) => void;
			};
			if (idx === -1 || !chooser?.values?.[idx]) return;
			chooser.setSelectedItem?.(idx, e);
			this.applyTheme(chooser.values[idx]);
		});
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
		const recent = [
			theme,
			...this.plugin.settings.recentThemes.filter((t) => t !== theme)
		].slice(0, 5);
		this.plugin.settings.recentThemes = recent;
		this.plugin.settings.theme = theme;
		void this.plugin.saveSettings();
		void this.onChoose(theme);
	}

	onClose(): void {
		super.onClose();
		const bg = document.querySelector<HTMLElement>('.modal-bg');
		if (bg) bg.style.opacity = '';
		if (!this.confirmed) {
			this.applyTheme(this.originalTheme);
		}
	}
}
