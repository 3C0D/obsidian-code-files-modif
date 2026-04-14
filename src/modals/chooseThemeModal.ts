/**
 * Theme picker modal with live preview and brightness adjustment.
 * Hovering over themes applies them instantly to the editor for preview.
 * Arrow keys adjust editor brightness. Confirming saves the theme; canceling restores the original.
 * Themes are loaded from themelist.json and cached for the session.
 */
import { SuggestModal } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { themes, loadThemes } from '../utils/themeUtils.ts';
import { broadcastBrightness } from '../utils/broadcast.ts';

/** Cached list of all available themes, populated on first modal open. */
let ALL_THEMES: string[] = [];

/** SuggestModal to pick a Monaco editor theme with live preview.
 *  Navigating the list applies the theme instantly to the editor.
 *  Confirming saves it; closing without confirming restores the original theme. */
export class ChooseThemeModal extends SuggestModal<string> {
	private originalTheme: string;
	private confirmed = false;
	/** Tracks whether themes have been loaded from themelist.json to avoid redundant fetches. */
	private themesLoaded = false;

	/**
	 * @param plugin - The plugin instance
	 * @param applyTheme - Callback invoked for both live preview and final theme selection. Sends the theme to Monaco via postMessage.
	 */
	constructor(
		private plugin: CodeFilesPlugin,
		private applyTheme: (theme: string) => void
	) {
		super(plugin.app);
		this.originalTheme = plugin.settings.theme;
		this.setPlaceholder('Choose a theme');
		this.modalEl.style.width = '300px';

		/** Adjusts editor brightness by delta, clamped between 0.2 and 2.0, rounded to 1 decimal. */
		const adjustBrightness = (delta: number): void => {
			const next =
				Math.round(
					Math.min(2, Math.max(0.2, plugin.settings.editorBrightness + delta)) *
						10
				) / 10;
			plugin.settings.editorBrightness = next;
			void plugin.saveSettings();
			broadcastBrightness(plugin);
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

	/** Loads themes from themelist.json before opening the modal to ensure suggestions are available.
	 *  Themes are loaded only once per session and cached in ALL_THEMES. */
	async onOpen(): Promise<void> {
		if (!this.themesLoaded) {
			await loadThemes(this.plugin);
			// Prepend 'default' which follows Obsidian's theme (light/dark)
			ALL_THEMES = ['default', ...themes];
			this.themesLoaded = true;
		}
		super.onOpen();
		setTimeout(() => {
			// Remove all semi-transparent overlays so the editor remains fully visible while previewing themes
			const backgrounds = document.querySelectorAll<HTMLElement>('.modal-bg');
			backgrounds.forEach((bg) => (bg.style.opacity = '0'));
		}, 0);
		this.modalEl.style.position = 'fixed';
		this.modalEl.style.background = 'var(--background-primary)';
		// Position modal at 75% of screen width (or centered if too close to edge)
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

		// Apply theme on hover without selecting, for instant preview
		this.resultContainerEl.addEventListener('mousemove', (e) => {
			const item = (e.target as HTMLElement).closest('.suggestion-item');
			if (!item) return;
			const items = this.resultContainerEl.querySelectorAll('.suggestion-item');
			const idx = Array.from(items).indexOf(item as HTMLElement);
			// Access internal chooser API to get the theme name at the hovered index
			const chooser = this.chooser as {
				values?: string[];
				setSelectedItem?: (i: number, e: MouseEvent) => void;
			};
			if (idx === -1 || !chooser?.values?.[idx]) return;
			chooser.setSelectedItem?.(idx, e);
			this.applyTheme(chooser.values[idx]);
		});
	}

	/** Returns filtered themes, prioritizing current and recently used themes at the top. */
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

	/** Confirms the theme selection, saves it to settings, and updates recent themes list (max 5). */
	onChooseSuggestion(theme: string | null): void {
		if (!theme) return;
		this.confirmed = true;
		// Keep the 5 most recent themes, with the new selection at the top
		const recent = [
			theme,
			...this.plugin.settings.recentThemes.filter((t) => t !== theme)
		].slice(0, 5);
		this.plugin.settings.recentThemes = recent;
		this.plugin.settings.theme = theme;
		void this.plugin.saveSettings();
		this.applyTheme(theme);
	}

	onClose(): void {
		super.onClose();
		const backgrounds = document.querySelectorAll<HTMLElement>('.modal-bg');
		backgrounds.forEach((bg) => (bg.style.opacity = ''));
		// Restore original theme if user cancelled (ESC or clicked outside)
		if (!this.confirmed) {
			this.applyTheme(this.originalTheme);
		}
	}
}
