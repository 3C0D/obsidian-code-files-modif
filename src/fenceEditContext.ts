import type { Editor } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import { getLanguage } from './getLanguage.ts';

/** Helper class to manage the context of a code fence in the editor, including extracting the content and language of the fence and replacing its content when the user saves changes from the FenceEditModal. It is designed to be created based on the current cursor position in the editor, and it provides methods to interact with the code fence without needing to manually parse the editor content each time. */
export class FenceEditContext {
	private start = 0;
	private end = 0;
	private editor: Editor;

	private constructor(editor: Editor, start: number, end: number) {
		this.editor = editor;
		this.start = start;
		this.end = end;
	}

	/** Static helper method to create a new instance of the context based on the current cursor position in the editor. It checks if the cursor is inside a code fence and initializes the context with the appropriate bounds. */
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

	/** Extracts the content of the code fence by concatenating the lines between the start and end bounds, and determines the language of the fence from the info string on the opening line. It returns an object containing both the content and the language, which is used to initialize the Monaco Editor in the modal. */
	getFenceData(): { content: string; language: string; langKey: string } {
		let editorContent = '';
		for (let i = this.start + 1; i < this.end; i++) {
			editorContent += `${this.editor.getLine(i)}\n`;
		}

		const content = editorContent.slice(0, editorContent.length - 1);
		const langKey = this.editor.getLine(this.start).slice(3).trim().split(' ')[0];
		const language = getLanguage(langKey);

		return { content, language, langKey };
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
