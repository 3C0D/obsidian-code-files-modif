import type { Editor } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { getLanguage } from './getLanguage.ts';

export class FenceEditContext {
	private start = 0;
	private end = 0;
	private editor: Editor;

	private constructor(
		editor: Editor,
		start: number,
		end: number
	) {
		this.editor = editor;
		this.start = start;
		this.end = end;
	}

	static create(plugin: CodeFilesPlugin, editor: Editor): FenceEditContext | null {
		const file = plugin.app.workspace.getActiveFile();
		const cursor = editor.getCursor();

		if (!file || !cursor) return null;

		const metadata = plugin.app.metadataCache.getFileCache(file);
		if (!metadata?.sections) return null;

		const codeSection = metadata.sections.find(
			(s) =>
				s.type === 'code' &&
				s.position.start.line <= cursor.line &&
				s.position.end.line >= cursor.line
		);

		if (!codeSection) return null;

		return new FenceEditContext(
			editor,
			codeSection.position.start.line,
			codeSection.position.end.line
		);
	}

	getFenceData(): { content: string; language: string } {
		let editorContent = '';
		for (let i = this.start + 1; i < this.end; i++) {
			editorContent += `${this.editor.getLine(i)}\n`;
		}

		const content = editorContent.slice(0, editorContent.length - 1);
		const langKey = this.editor.getLine(this.start).slice(3).trim().split(' ')[0];
		const language = getLanguage(langKey);

		return { content, language };
	}

	getEditor(): Editor {
		return this.editor;
	}

	getBounds(): number[] {
		return [this.start, this.end];
	}

	replaceFenceContent(value: string): void {
		this.editor.replaceRange(
			`${value}\n`,
			{ line: this.start + 1, ch: 0 },
			{ line: this.end, ch: 0 }
		);
	}
}
