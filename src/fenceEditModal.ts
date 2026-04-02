import { Modal, Notice, type Editor } from 'obsidian';
import { mountCodeEditor } from './mountCodeEditor.ts';
import type CodeFilesPlugin from './main.ts';
import { FenceEditContext } from './fenceEditContext.ts';
import type { CodeEditorInstance } from './types.ts';

/** Modal that provides a full-featured code editor for editing the content of a code fence. It is opened via the "Edit code block content" action in the editor context menu when right-clicking inside a code fence. The modal initializes a Monaco Editor instance with the content of the code fence and saves changes back to the note when closed. */
export class FenceEditModal extends Modal {
	private codeEditor: CodeEditorInstance;

	private constructor(
		private plugin: CodeFilesPlugin,
		private code: string,
		private language: string,
		private onSave: (changedCode: string) => void
	) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		super.onOpen();

		this.codeEditor = await mountCodeEditor(
			this.plugin,
			this.language,
			this.code,
			'modal-editor'
		);

		// Ensure the editor fills the modal when it opens
		this.contentEl.append(this.codeEditor.iframe);

		// Apply custom styles to make the modal more spacious and better suited for code editing
		this.modalEl.style.width = '90vw';
		this.modalEl.style.height = '90vh';

		// Match close button background to the modal to avoid visual bleed
		this.modalEl.querySelector<HTMLDivElement>(
			'.modal-close-button'
		)!.style.background = 'var(--modal-background)';
	}

	onClose(): void {
		super.onClose();

		this.onSave(this.codeEditor.getValue());
	}

	/** Opens a Monaco Editor modal pre-filled with the content of the code fence under the cursor. Does nothing if the cursor is not inside a valid code block. */
	static openOnCurrentCode(plugin: CodeFilesPlugin, editor: Editor): void {
		const context = FenceEditContext.create(plugin, editor);

		if (!context) {
			new Notice('Your cursor is currently not in a valid code block.');
			return;
		}

		const fenceData = context.getFenceData();

		new FenceEditModal(plugin, fenceData.content, fenceData.language, (value) =>
			context.replaceFenceContent(value)
		).open();
	}
}
