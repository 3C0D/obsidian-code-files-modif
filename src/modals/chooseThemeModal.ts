import { SuggestModal } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { themes } from '../utils/themes.ts';

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

		const adjustBrightness = (delta: number): void => {
			const next =
				Math.round(
					Math.min(2, Math.max(0.2, plugin.settings.editorBrightness + delta)) *
						10
				) / 10;
			plugin.settings.editorBrightness = next;
			void plugin.saveSettings();
			plugin.broadcastBrightness();
		};
		this.scope.register([], 'ArrowRight', () => {
			adjustBrightness(0.1);
			return true;
		});
		this.scope.register([], 'ArrowLeft', () => {
			adjustBrightness(-0.1);
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
		this.modalEl.style.background = 'var(--background-primary)';
		setTimeout(() => {
			const { innerWidth } = window;
			const { offsetWidth } = this.modalEl;
			const desiredLeft = innerWidth * 0.75;
			if (desiredLeft + offsetWidth / 2 > innerWidth - 10) {
				this.modalEl.style.left = '50%';
				this.modalEl.style.transform = 'translateX(-50%)';
			} else {
				this.modalEl.style.left = '75%';
				this.modalEl.style.transform = 'translateX(-50%)';
			}
			this.modalEl.style.top = '10%';
		}, 0);

		const footer = this.modalEl.createEl('div', { cls: 'code-files-theme-footer' });
		footer.style.cssText =
			'padding: 6px 12px; font-size: 0.78em; color: var(--text-muted); border-top: 1px solid var(--background-modifier-border); text-align: center;';
		footer.setText('hover to preview · ← → adjust brightness');

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
