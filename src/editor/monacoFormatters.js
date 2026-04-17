// Monaco Formatters Registration
// All document formatting providers for Monaco Editor

// Global variables shared with monacoEditor.html
// (runFormatWithDiff, editor, context, currentLang, lastFormatOriginal, lastFormatFormatted
//  are defined in monacoEditor.html and accessible here)

function registerFormatters() {
	// Register Mermaid as a custom language if not already registered
	if (
		!monaco.languages.getLanguages().some(function (lang) {
			return lang.id === 'mermaid';
		})
	) {
		monaco.languages.register({ id: 'mermaid' });
	}

	monaco.languages.registerDocumentFormattingEditProvider('markdown', {
		provideDocumentFormattingEdits: async function (model) {
			try {
				var original = model.getValue();
				var formatted = await prettier.format(original, {
					parser: 'markdown',
					plugins: [prettierPlugins.markdown],
					proseWrap: PRETTIER_PROSE_WRAP,
					printWidth: PRETTIER_PRINT_WIDTH,
					tabWidth: PRETTIER_TAB_WIDTH,
					useTabs: PRETTIER_USE_TABS
				});
				// Format mermaid blocks inside the markdown
				if (
					window.mermaidFormatter &&
					window.mermaidFormatter.formatMarkdownMermaidBlocks
				) {
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
		provideDocumentFormattingEdits: function (model) {
			try {
				if (!window.mermaidFormatter || !window.mermaidFormatter.formatMermaid) {
					console.warn('code-files: mermaid-formatter not loaded');
					return [];
				}
				var original = model.getValue();
				var formatted = window.mermaidFormatter.formatMermaid(original);
				if (formatted !== original) {
					lastFormatOriginal = original;
					lastFormatFormatted = formatted;
					window.parent.postMessage(
						{ type: 'format-diff-available', context: context },
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
		provideDocumentFormattingEdits: async function (model) {
			try {
				var original = model.getValue();
				var formatted = await prettier.format(original, {
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
		provideDocumentFormattingEdits: async function (model) {
			try {
				var original = model.getValue();
				var formatted = await prettier.format(original, {
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
	['css', 'scss', 'less'].forEach(function (lang) {
		monaco.languages.registerDocumentFormattingEditProvider(lang, {
			provideDocumentFormattingEdits: async function (model) {
				try {
					var original = model.getValue();
					var formatted = await prettier.format(original, {
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
		provideDocumentFormattingEdits: async function (model) {
			try {
				var original = model.getValue();
				var formatted = await prettier.format(original, {
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
		provideDocumentFormattingEdits: async function (model) {
			try {
				var original = model.getValue();
				var formatted = await prettier.format(original, {
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
		provideDocumentFormattingEdits: async function (model) {
			// Skip formatting for .lock files (yarn.lock, package-lock.json, etc.)
			if (context && /\.lock$/i.test(context)) {
				return [];
			}
			try {
				var original = model.getValue();
				var formatted = await prettier.format(original, {
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
		provideDocumentFormattingEdits: async function (model) {
			try {
				var original = model.getValue();
				var formatted = await prettier.format(original, {
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
	['c', 'cpp'].forEach(function (lang) {
		monaco.languages.registerDocumentFormattingEditProvider(lang, {
			provideDocumentFormattingEdits: async function (model) {
				try {
					if (!window.clangFormatter) {
						console.warn('code-files: clang-formatter not loaded');
						return [];
					}
					try {
						await window.clangFormatter.init(window.__CLANG_WASM_URL__);
						console.log('code-files: clang-formatter initialized');
					} catch (e) {
						console.error('code-files: clang-formatter init failed', e);
						return [];
					}
					var original = model.getValue();
					var formatted = window.clangFormatter.format(original);
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
	(async function () {
		if (!window.ruffFormatter) {
			console.warn('code-files: ruff-formatter not loaded');
			return;
		}

		try {
			await window.ruffFormatter.init(window.__RUFF_WASM_URL__);
		} catch (e) {
			console.error('code-files: ruff-formatter init failed', e);
			return;
		}

		monaco.languages.registerDocumentFormattingEditProvider('python', {
			provideDocumentFormattingEdits: function (model) {
				try {
					var original = model.getValue();
					var formatted = window.ruffFormatter.format(original, null, {
						indent_style: PRETTIER_USE_TABS ? 'tab' : 'space',
						indent_width: PRETTIER_TAB_WIDTH,
						line_width: PRETTIER_PRINT_WIDTH,
						line_ending: 'lf',
						quote_style: 'double',
						magic_trailing_comma: 'respect'
					});

					if (formatted !== original) {
						lastFormatOriginal = original;
						lastFormatFormatted = formatted;
						window.parent.postMessage(
							{ type: 'format-diff-available', context: context },
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
	(async function () {
		if (!window.gofmtFormatter) {
			console.warn('code-files: gofmt-formatter not loaded');
			return;
		}

		try {
			await window.gofmtFormatter.init(window.__GOFMT_WASM_URL__);
		} catch (e) {
			console.error('code-files: gofmt-formatter init failed', e);
			return;
		}

		monaco.languages.registerDocumentFormattingEditProvider('go', {
			provideDocumentFormattingEdits: function (model) {
				try {
					var original = model.getValue();
					var formatted = window.gofmtFormatter.format(original);

					if (formatted !== original) {
						lastFormatOriginal = original;
						lastFormatFormatted = formatted;
						window.parent.postMessage(
							{ type: 'format-diff-available', context: context },
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
