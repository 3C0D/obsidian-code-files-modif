import type { Editor } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { getLanguage } from './getLanguage.ts';

/**
 * Encapsulates the position and content of a code
 * fence in the Obsidian editor (````lang ... ````).
 * Created from the cursor position; provides
 * read/write access to the fence body.
 */
export class FenceEditContext {
	private start = 0;
	private end = 0;
	private editor: Editor;

	private constructor(editor: Editor, start: number, end: number) {
		this.editor = editor;
		this.start = start;
		this.end = end;
	}

	/**
	 * Returns null if the cursor is not inside a
	 * code fence (uses Obsidian's section cache).
	 */
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

	/** Extracts body text and language from the fence.
	 *  `langKey` is the raw string after the backticks
	 *  (e.g. "js" in ````js), while `language` is
	 *  the Monaco language id resolved from it. */
	getFenceData(): { content: string; language: string; langKey: string } {
		let editorContent = '';
		for (let i = this.start + 1; i < this.end; i++) {
			editorContent += `${this.editor.getLine(i)}\n`;
		}

		// Remove trailing newline
		const content = editorContent.slice(0, editorContent.length - 1);
		// Extract language name: remove ```, trim, take first word before space (ignores metadata like ```js title="file")
		const langKey = this.editor.getLine(this.start).slice(3).trim().split(' ')[0];
		// Convert to Monaco language ID
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
