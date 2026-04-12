/**
 * Modal for editing code fence content in a full Monaco Editor.
 * Opened via context menu when right-clicking inside a code block in a markdown note.
 * Mounts a Monaco instance, provides theme/settings controls in the title bar,
 * and writes changes back to the note when closed.
 */
import { Modal, Notice, setIcon, type Editor } from 'obsidian';
import { mountCodeEditor, resolveThemeParams } from '../editor/mountCodeEditor.ts';
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

		// ── Badge extension + gear dans la barre de titre ────────────
		this.titleEl.style.display = 'flex';
		this.titleEl.style.alignItems = 'center';
		this.titleEl.style.gap = '8px';

		const badgeEl = createEl('span', {
			text: `.${this.langKey}`,
			cls: 'code-files-ext-badge',
			attr: { style: 'margin-left: auto; margin-right: 0;' }
		});
		this.titleEl.appendChild(badgeEl);

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
			`modal-editor.${this.langKey}`
		);

		this.contentEl.append(this.codeEditor.iframe);

		this.modalEl.style.width = '90vw';
		this.modalEl.style.height = '90vh';

		this.modalEl.querySelector<HTMLDivElement>(
			'.modal-close-button'
		)!.style.background = 'var(--modal-background)';
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
	static openOnCurrentCode(plugin: CodeFilesPlugin, editor: Editor): void {
		const context = FenceEditContext.create(plugin, editor);

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
