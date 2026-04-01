import type { Editor } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { getLanguage } from './getLanguage.ts';

export class FenceEditContext {
	private start = 0;

	private end = 0;

	private editor?: Editor;

	private isInValidFence = false;

	private constructor(private plugin: CodeFilesPlugin) {
		this.initializeStartAndEnd();
		this.validateFence();
	}

	static create(plugin: CodeFilesPlugin): FenceEditContext {
		return new FenceEditContext(plugin);
	}

	private initializeStartAndEnd(): void {
		this.editor = this.plugin.app.workspace.activeEditor?.editor;
		const cursor = this.editor?.getCursor();

		if (!this.editor || !cursor) return;

		this.start = cursor.line;
		this.end = cursor.line;
		do {
			this.start--;
		} while (this.start >= 0 && !this.editor.getLine(this.start).startsWith('```'));
		do {
			this.end++;
		} while (
			this.end < this.editor.lineCount() &&
			!this.editor.getLine(this.end).startsWith('```')
		);
	}

	private validateFence(): void {
		if (!this.editor) {
			return;
		}

		if (this.start < 0 || this.end >= this.editor.lineCount()) {
			return;
		}

		let fenceLines = 0;

		for (let i = 0; i < this.start; i++) {
			if (this.editor.getLine(i).startsWith('```')) {
				fenceLines++;
			}
		}

		if (fenceLines % 2 === 1) {
			return;
		}

		this.isInValidFence = true;
	}

	isInFence(): boolean {
		return this.isInValidFence;
	}

	getFenceData(): { content: string; language: string } | null {
		if (!this.editor || !this.isInValidFence) return null;

		let editorContent = '';
		for (let i = this.start + 1; i < this.end; i++) {
			editorContent += `${this.editor.getLine(i)}\n`;
		}

		const content = editorContent.slice(0, editorContent.length - 1);
		const langKey = this.editor.getLine(this.start).slice(3).trim().split(' ')[0];
		const language = getLanguage(langKey);

		return { content, language };
	}

	getEditor(): Editor | undefined {
		return this.editor;
	}

	getBounds(): number[] {
		return [this.start, this.end];
	}

	replaceFenceContent(value: string): void {
		this.editor?.replaceRange(
			`${value}\n`,
			{ line: this.start + 1, ch: 0 },
			{ line: this.end, ch: 0 }
		);
	}
}
