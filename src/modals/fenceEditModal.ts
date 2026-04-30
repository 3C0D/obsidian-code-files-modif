/**
 * Modal for editing code fence content in a full Monaco Editor.
 * Opened via context menu when right-clicking inside a code block in a markdown note.
 * Mounts a Monaco instance, provides theme/settings controls in the title bar,
 * and writes changes back to the note when closed.
 */
import { Modal, Notice, setIcon, type Editor } from 'obsidian';
import { mountCodeEditor } from '../editor/mountCodeEditor.ts';
import { resolveThemeParams } from '../utils/themeUtils.ts';
import type CodeFilesPlugin from '../main.ts';
import { FenceEditContext } from '../utils/fenceEditContext.ts';
import type { CodeEditorInstance } from '../types/types.ts';
import { EditorSettingsModal } from './editorSettingsModal.ts';
import { ChooseThemeModal } from './chooseThemeModal.ts';
import { broadcastOptions } from '../utils/broadcast.ts';

/** Modal that provides a full-featured code editor for editing the content of a code fence. It is opened via the "Edit code block content" action in the editor context menu when right-clicking inside a code fence. The modal initializes a Monaco Editor instance with the content of the code fence and saves changes back to the note when closed. */
export class FenceEditModal extends Modal {
	private codeEditor!: CodeEditorInstance;

	/**
	 * @param plugin - The plugin instance
	 * @param code - The initial code fence content to edit
	 * @param language - Monaco language ID (e.g., 'javascript', 'python')
	 * @param langKey - Raw language key from the fence (e.g., 'js', 'py')
	 * @param onSave - Callback invoked on modal close with the edited content. Use this to write changes back to the note.
	 */
	private constructor(
		private plugin: CodeFilesPlugin,
		private code: string,
		private language: string,
		private langKey: string,
		private onSave: (changedCode: string) => void
	) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		super.onOpen();

		// ── Extension badge + gear in the title bar ────────────
		this.titleEl.addClass('code-files-fence-header');

		// the original style of the badge need a modification there to align on the right side
		const badgeContainer = createEl('div', {
			cls: 'code-files-fence-badge-container'
		});
		const badgeEl = createEl('span', {
			text: `.${this.langKey}`,
			cls: 'code-files-ext-badge code-files-fence-badge'
		});
		badgeContainer.appendChild(badgeEl);

		const indicatorEl = createEl('small', {
			text: '(save on close)',
			cls: 'code-files-save-indicator'
		});
		badgeContainer.appendChild(indicatorEl);

		this.titleEl.appendChild(badgeContainer);

		const gearEl = createEl('div', {
			cls: 'code-files-fence-gear',
			attr: { 'aria-label': 'Editor Settings' }
		});
		setIcon(gearEl, 'settings');
		gearEl.addEventListener('click', () => {
			new EditorSettingsModal(
				this.plugin,
				this.langKey,
				() => broadcastOptions(this.plugin),
				(config) => this.codeEditor?.send('change-editor-config', { config })
			).open();
		});
		this.titleEl.appendChild(gearEl);

		const paletteEl = createEl('div', {
			cls: 'code-files-fence-gear',
			attr: { 'aria-label': 'Change Theme' }
		});
		setIcon(paletteEl, 'palette');
		paletteEl.addEventListener('click', () => {
			const applyTheme = async (theme: string): Promise<void> => {
				const params = await resolveThemeParams(this.plugin, theme);
				this.codeEditor?.send('change-theme', params);
			};
			new ChooseThemeModal(this.plugin, applyTheme).open();
		});
		this.titleEl.appendChild(paletteEl);

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			this.language,
			this.code,
			`modal-editor.${this.langKey}`,
			this.contentEl,
			undefined,
			undefined,
			undefined,
			undefined,
			// onOpenEditorConfig
			(ext) => {
				new EditorSettingsModal(
					this.plugin,
					ext,
					() => broadcastOptions(this.plugin),
					(config) => this.codeEditor?.send('change-editor-config', { config }),
					() => this.codeEditor?.send('focus', {})
				).open();
			},
			// onOpenThemePicker
			() => {
				const applyTheme = async (theme: string): Promise<void> => {
					const params = await resolveThemeParams(this.plugin, theme);
					this.codeEditor?.send('change-theme', params);
				};
				new ChooseThemeModal(this.plugin, applyTheme, () =>
					this.codeEditor?.send('focus', {})
				).open();
			}
			// onOpenRenameExtension: undefined (fences don't have a file path)
		);

		this.contentEl.append(this.codeEditor.iframe);

		const buttonContainer = this.modalEl.createDiv({
			cls: 'modal-button-container code-files-fence-footer'
		});
		buttonContainer
			.createEl('button', { text: 'Close', cls: 'mod-cta' })
			.addEventListener('click', () => this.close());

		this.modalEl.style.width = '90vw';
		this.modalEl.style.height = '90vh';

		const closeBtn =
			this.modalEl.querySelector<HTMLDivElement>('.modal-close-button');
		if (closeBtn) closeBtn.style.background = 'var(--modal-background)';
	}

	onClose(): void {
		super.onClose();
		if (this.codeEditor) {
			const current = this.codeEditor.getValue();
			if (current !== this.code) this.onSave(current);
			this.codeEditor.destroy();
		}
	}

	/** Opens a Monaco Editor modal pre-filled with the content of the code fence under the cursor. Does nothing if the cursor is not inside a valid code block. */
	static openOnCurrentCode(
		plugin: CodeFilesPlugin,
		editor: Editor,
		context?: FenceEditContext
	): void {
		context = context ?? FenceEditContext.create(plugin, editor) ?? undefined;
		if (!context) {
			new Notice('Your cursor is currently not in a valid code block.');
			return;
		}

		const fenceData = context.getFenceData();

		new FenceEditModal(
			plugin,
			fenceData.content,
			fenceData.language,
			fenceData.langKey,
			(value) => context.replaceFenceContent(value)
		).open();
	}
}
