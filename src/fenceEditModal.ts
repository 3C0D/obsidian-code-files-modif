import { Modal, Notice } from 'obsidian';
import { mountCodeEditor } from './mountCodeEditor.ts';
import type CodeFilesPlugin from './main.ts';
import { FenceEditContext } from './fenceEditContext.ts';

export class FenceEditModal extends Modal {
	private codeEditor: ReturnType<typeof mountCodeEditor>;

	private constructor(
		private plugin: CodeFilesPlugin,
		private code: string,
		private language: string,
		private onSave: (changedCode: string) => void
	) {
		super(plugin.app);
	}

	onOpen(): void {
		super.onOpen();

		this.codeEditor = mountCodeEditor(
			this.plugin,
			this.language,
			this.code,
			'modal-editor'
		);

		this.contentEl.append(this.codeEditor.iframe);

		this.modalEl.setCssProps({
			'--dialog-width': '90vw',
			'--dialog-height': '90vh'
		});
		this.modalEl.style.height = 'var(--dialog-height)';

		this.modalEl.querySelector<HTMLDivElement>(
			'.modal-close-button'
		)!.style.background = 'var(--modal-background)';
	}

	onClose(): void {
		super.onClose();

		this.onSave(this.codeEditor.getValue());
	}

	static openOnCurrentCode(plugin: CodeFilesPlugin): void {
		const context = FenceEditContext.create(plugin);

		if (!context.isInFence()) {
			new Notice('Your cursor is currently not in a valid code block.');
			return;
		}

		const fenceData = context.getFenceData();

		if (!fenceData) {
			return;
		}

		new FenceEditModal(plugin, fenceData.content, fenceData.language, (value) =>
			context.replaceFenceContent(value)
		).open();
	}
}
