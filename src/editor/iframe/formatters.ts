// Monaco Formatters Registration
// All document formatting providers for Monaco Editor
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Monaco global types don't match AMD-loaded runtime

import './types/types.js'; // Global declarations
import type * as Monaco from 'monaco-editor';
import {
	PRETTIER_PROSE_WRAP,
	PRETTIER_PRINT_WIDTH,
	PRETTIER_TAB_WIDTH,
	PRETTIER_USE_TABS
} from './config.js';
import { setLastFormat } from './diff.js';

let context: string | null = null;
let _lastFormatOriginal: string | null = null;
let _lastFormatFormatted: string | null = null;

export function setFormatterContext(ctx: string): void {
	context = ctx;
}

export function registerFormatters(): void {
	// Register Mermaid as a custom language if not already registered
	if (
		!monaco.languages
			.getLanguages()
			.some(
				(lang: Monaco.languages.ILanguageExtensionPoint) => lang.id === 'mermaid'
			)
	) {
		monaco.languages.register({ id: 'mermaid' });
	}

	/**
	 * NOTE: Prettier formatters (Markdown, TS/JS, CSS, etc.) do NOT update lastFormatOriginal
	 * or send 'format-diff-available' messages directly. This task is delegated to
	 * runFormatWithDiff() in init.ts, which handles the diff tracking logic
	 * for all formatters that use Monaco's native provideDocumentFormattingEdits API.
	 */

	monaco.languages.registerDocumentFormattingEditProvider('markdown', {
		provideDocumentFormattingEdits: async (
			model: Monaco.editor.ITextModel
		): Promise<Monaco.languages.TextEdit[]> => {
			try {
				const original = model.getValue();
				let formatted = await prettier.format(original, {
					parser: 'markdown',
					plugins: [prettierPlugins.markdown],
					proseWrap: PRETTIER_PROSE_WRAP,
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				// Format mermaid blocks inside the markdown
				if (window.mermaidFormatter?.formatMarkdownMermaidBlocks) {
					formatted =
						window.mermaidFormatter.formatMarkdownMermaidBlocks(formatted);
				}
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: prettier format failed', e);
				return [];
			}
		}
	});

	monaco.languages.registerDocumentFormattingEditProvider('mermaid', {
		provideDocumentFormattingEdits: (
			model: Monaco.editor.ITextModel
		): Monaco.languages.TextEdit[] => {
			try {
				if (!window.mermaidFormatter?.formatMermaid) {
					console.warn('code-files: mermaid-formatter not loaded');
					return [];
				}
				const original = model.getValue();
				const formatted = window.mermaidFormatter.formatMermaid(original);
				if (formatted !== original) {
					_lastFormatOriginal = original;
					_lastFormatFormatted = formatted;
					setLastFormat(original, formatted);
					window.parent.postMessage(
						{ type: 'format-diff-available', context },
						'*'
					);
				}
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: mermaid format failed', e);
				return [];
			}
		}
	});

	monaco.languages.registerDocumentFormattingEditProvider('typescript', {
		provideDocumentFormattingEdits: async (
			model: Monaco.editor.ITextModel
		): Promise<Monaco.languages.TextEdit[]> => {
			try {
				const original = model.getValue();
				const formatted = await prettier.format(original, {
					parser: 'typescript',
					plugins: [prettierPlugins.estree, prettierPlugins.typescript],
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: prettier typescript format failed', e);
				return [];
			}
		}
	});

	monaco.languages.registerDocumentFormattingEditProvider('javascript', {
		provideDocumentFormattingEdits: async (
			model: Monaco.editor.ITextModel
		): Promise<Monaco.languages.TextEdit[]> => {
			try {
				const original = model.getValue();
				const formatted = await prettier.format(original, {
					parser: 'babel',
					plugins: [prettierPlugins.babel, prettierPlugins.estree],
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: prettier javascript format failed', e);
				return [];
			}
		}
	});

	// ── Prettier: CSS / SCSS / Less ───────────────────────────────────────────
	['css', 'scss', 'less'].forEach((lang) => {
		monaco.languages.registerDocumentFormattingEditProvider(lang, {
			provideDocumentFormattingEdits: async (
				model: Monaco.editor.ITextModel
			): Promise<Monaco.languages.TextEdit[]> => {
				try {
					const original = model.getValue();
					const formatted = await prettier.format(original, {
						parser: lang,
						plugins: [prettierPlugins.postcss],
						printWidth: PRETTIER_PRINT_WIDTH,
						tabWidth: PRETTIER_TAB_WIDTH,
						useTabs: PRETTIER_USE_TABS
					});
					return [{ range: model.getFullModelRange(), text: formatted }];
				} catch (e) {
					console.warn('code-files: prettier ' + lang + ' format failed', e);
					return [];
				}
			}
		});
	});

	// ── Prettier: HTML ────────────────────────────────────────────────────────
	monaco.languages.registerDocumentFormattingEditProvider('html', {
		provideDocumentFormattingEdits: async (
			model: Monaco.editor.ITextModel
		): Promise<Monaco.languages.TextEdit[]> => {
			try {
				const original = model.getValue();
				const formatted = await prettier.format(original, {
					parser: 'html',
					plugins: [prettierPlugins.html],
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: prettier html format failed', e);
				return [];
			}
		}
	});

	// ── Prettier: JSON ────────────────────────────────────────────────────────
	// Overrides Monaco's native JSON formatter for consistency with other languages
	monaco.languages.registerDocumentFormattingEditProvider('json', {
		provideDocumentFormattingEdits: async (
			model: Monaco.editor.ITextModel
		): Promise<Monaco.languages.TextEdit[]> => {
			try {
				const original = model.getValue();
				const formatted = await prettier.format(original, {
					parser: 'json',
					plugins: [prettierPlugins.babel, prettierPlugins.estree],
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: prettier json format failed', e);
				return [];
			}
		}
	});

	// ── Prettier: YAML ────────────────────────────────────────────────────────
	monaco.languages.registerDocumentFormattingEditProvider('yaml', {
		provideDocumentFormattingEdits: async (
			model: Monaco.editor.ITextModel
		): Promise<Monaco.languages.TextEdit[]> => {
			// Skip formatting for .lock files (yarn.lock, package-lock.json, etc.)
			if (context && /\.lock$/i.test(context)) {
				return [];
			}
			try {
				const original = model.getValue();
				const formatted = await prettier.format(original, {
					parser: 'yaml',
					plugins: [prettierPlugins.yaml],
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: prettier yaml format failed', e);
				return [];
			}
		}
	});

	// ── Prettier: GraphQL ─────────────────────────────────────────────────────
	monaco.languages.registerDocumentFormattingEditProvider('graphql', {
		provideDocumentFormattingEdits: async (
			model: Monaco.editor.ITextModel
		): Promise<Monaco.languages.TextEdit[]> => {
			try {
				const original = model.getValue();
				const formatted = await prettier.format(original, {
					parser: 'graphql',
					plugins: [prettierPlugins.graphql],
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				return [{ range: model.getFullModelRange(), text: formatted }];
			} catch (e) {
				console.warn('code-files: prettier graphql format failed', e);
				return [];
			}
		}
	});

	// ── C/C++: clang-format ───────────────────────────────────────────────────
	['c', 'cpp'].forEach((lang) => {
		monaco.languages.registerDocumentFormattingEditProvider(lang, {
			provideDocumentFormattingEdits: async (
				model: Monaco.editor.ITextModel
			): Promise<Monaco.languages.TextEdit[]> => {
				try {
					if (!window.clangFormatter) {
						console.warn('code-files: clang-formatter not loaded');
						return [];
					}
					try {
						await window.clangFormatter.init(window.__CLANG_WASM_URL__!);
					} catch (e) {
						console.error('code-files: clang-formatter init failed', e);
						return [];
					}
					const original = model.getValue();
					const formatted = window.clangFormatter.format(original);
					return [{ range: model.getFullModelRange(), text: formatted }];
				} catch (e) {
					console.warn(
						'code-files: clang-format ' + lang + ' format failed',
						e
					);
					return [];
				}
			}
		});
	});

	// ── Python: Ruff Formatter ────────────────────────────────────────────────
	(async () => {
		if (!window.ruffFormatter) {
			console.warn('code-files: ruff-formatter not loaded');
			return;
		}

		try {
			await window.ruffFormatter.init(window.__RUFF_WASM_URL__!);
		} catch (e) {
			console.error('code-files: ruff-formatter init failed', e);
			return;
		}

		monaco.languages.registerDocumentFormattingEditProvider('python', {
			provideDocumentFormattingEdits: (
				model: Monaco.editor.ITextModel
			): Monaco.languages.TextEdit[] => {
				try {
					const original = model.getValue();
					const formatted = window.ruffFormatter!.format(original, null, {
						indent_style: PRETTIER_USE_TABS ? 'tab' : 'space',
						indent_width: PRETTIER_TAB_WIDTH,
						line_width: PRETTIER_PRINT_WIDTH,
						line_ending: 'lf',
						quote_style: 'double',
						magic_trailing_comma: 'respect'
					});

					if (formatted !== original) {
						_lastFormatOriginal = original;
						_lastFormatFormatted = formatted;
						setLastFormat(original, formatted);
						window.parent.postMessage(
							{ type: 'format-diff-available', context },
							'*'
						);
					}

					return [{ range: model.getFullModelRange(), text: formatted }];
				} catch (e) {
					console.warn('code-files: ruff format failed', e);
					return [];
				}
			}
		});
	})();

	// ── Go: gofmt Formatter ───────────────────────────────────────────────────
	(async () => {
		if (!window.gofmtFormatter) {
			console.warn('code-files: gofmt-formatter not loaded');
			return;
		}

		try {
			await window.gofmtFormatter.init(window.__GOFMT_WASM_URL__!);
		} catch (e) {
			console.error('code-files: gofmt-formatter init failed', e);
			return;
		}

		monaco.languages.registerDocumentFormattingEditProvider('go', {
			provideDocumentFormattingEdits: (
				model: Monaco.editor.ITextModel
			): Monaco.languages.TextEdit[] => {
				try {
					const original = model.getValue();
					const formatted = window.gofmtFormatter!.format(original);

					if (formatted !== original) {
						_lastFormatOriginal = original;
						_lastFormatFormatted = formatted;
						setLastFormat(original, formatted);
						window.parent.postMessage(
							{ type: 'format-diff-available', context },
							'*'
						);
					}

					return [{ range: model.getFullModelRange(), text: formatted }];
				} catch (e) {
					console.warn('code-files: gofmt format failed', e);
					return [];
				}
			}
		});
	})();
}
