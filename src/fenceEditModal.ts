import { Modal, Notice, setIcon, type Editor } from 'obsidian';
import { mountCodeEditor } from './mountCodeEditor.ts';
import type CodeFilesPlugin from './main.ts';
import { FenceEditContext } from './fenceEditContext.ts';
import type { CodeEditorInstance } from './types.ts';
import { EditorSettingsModal } from './editorSettingsModal.ts';

/** Modal that provides a full-featured code editor for editing the content of a code fence. It is opened via the "Edit code block content" action in the editor context menu when right-clicking inside a code fence. The modal initializes a Monaco Editor instance with the content of the code fence and saves changes back to the note when closed. */
export class FenceEditModal extends Modal {
	private codeEditor: CodeEditorInstance;

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

		const gearEl = createEl('div', { cls: 'code-files-fence-gear', attr: { 'aria-label': 'Editor Settings' } });
		setIcon(gearEl, 'settings');
		gearEl.addEventListener('click', () => {
			(document.activeElement as HTMLElement)?.blur();
			const modal = new EditorSettingsModal(
				this.plugin,
				this.language,
				() => this.plugin.broadcastOptions(),
				(config) => this.codeEditor?.send('change-formatter-config', { config })
			);
			const origOnClose = modal.onClose.bind(modal);
			modal.onClose = () => { origOnClose(); };
			modal.open();
		});
		this.titleEl.appendChild(gearEl);

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			this.language,
			this.code,
			'modal-editor'
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
		// getValue() is called here rather than in onOpen() because the user may have
		// edited the content after opening — we want the final state at close time
		if (this.codeEditor) this.onSave(this.codeEditor.getValue());
		this.codeEditor?.destroy();
	}

	/** Opens a Monaco Editor modal pre-filled with the content of the code fence under the cursor. Does nothing if the cursor is not inside a valid code block. */
	static openOnCurrentCode(plugin: CodeFilesPlugin, editor: Editor): void {
		const context = FenceEditContext.create(plugin, editor);

		if (!context) {
			new Notice('Your cursor is currently not in a valid code block.');
			return;
		}

		const fenceData = context.getFenceData();

		new FenceEditModal(plugin, fenceData.content, fenceData.language, fenceData.langKey, (value) =>
			context.replaceFenceContent(value)
		).open();
	}
}
