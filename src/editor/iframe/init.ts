// Monaco Editor Initialization and Message Handling
// Main initialization logic extracted from monacoEditor.html inline script
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Monaco global types don't match AMD-loaded runtime

import './types/types.ts'; // Global declarations
import type * as Monaco from 'monaco-editor';
import type { InitParams, EditorConfig } from './types/index.ts';
import {
	FORMAT_CHANGE_TIMEOUT,
	setPrettierPrintWidth,
	setPrettierTabWidth,
	setPrettierUseTabs
} from './config.ts';
import { setSharedState, setLastFormat, getLastFormat, openDiffModal } from './diff.ts';
import { registerFormatters, setFormatterContext } from './formatters.ts';
import {
	registerActions,
	setActionsState,
	setFormatOnSave,
	updateHotkeys
} from './actions.ts';

let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let context: string | null = null;
let formatOnSave = false;
let editorDefaults: Monaco.editor.IStandaloneEditorConstructionOptions = {};

let currentLang = 'plaintext';
let initialized = false;

/**
 * Displays a temporary message overlay in the editor area.
 * Used for status notifications like "Formatting..." or errors.
 * @param message - The message text to display
 */
function showInEditorMessage(message: string): void {
	const container = document.getElementById('container');
	if (!container) return;

	// Create message element
	const messageEl = document.createElement('div');
	messageEl.textContent = message;
	messageEl.style.cssText = `
		position: absolute;
		top: 10px;
		right: 10px;
		background: #333;
		color: #fff;
		padding: 8px 12px;
		border-radius: 4px;
		font-size: 12px;
		z-index: 1000;
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		max-width: 300px;
		word-wrap: break-word;
	`;

	container.appendChild(messageEl);

	// Remove after 5 seconds
	setTimeout(() => {
		if (messageEl.parentNode) {
			messageEl.parentNode.removeChild(messageEl);
		}
	}, 5000);
}

/**
 * Applies dynamic editor configuration settings from the parent window.
 * Updates tab size, spaces vs tabs, format-on-save, and Prettier options.
 * @param cfg - The editor configuration object
 */
export function applyEditorConfig(cfg: EditorConfig): void {
	if (!editor || !cfg) return;
	const modelOpts: Monaco.editor.ITextModelUpdateOptions = {};
	if (cfg.tabSize !== undefined) modelOpts.tabSize = cfg.tabSize;
	if (cfg.insertSpaces !== undefined) modelOpts.insertSpaces = cfg.insertSpaces;
	if (Object.keys(modelOpts).length) editor.getModel()?.updateOptions(modelOpts);
	formatOnSave = !!cfg.formatOnSave;
	setFormatOnSave(formatOnSave);
	// Update Prettier printWidth if specified
	if (cfg.printWidth !== undefined) {
		setPrettierPrintWidth(cfg.printWidth);
	}
	// Update Prettier tabWidth and useTabs from Monaco config
	if (cfg.tabSize !== undefined) {
		setPrettierTabWidth(cfg.tabSize);
	}
	if (cfg.insertSpaces !== undefined) {
		setPrettierUseTabs(!cfg.insertSpaces);
	}
	const {
		tabSize: _tabSize,
		insertSpaces: _insertSpaces,
		formatOnSave: _fs,
		printWidth: _printWidth,
		...editorOpts
	} = cfg;
	editor.updateOptions(Object.assign({}, editorDefaults, editorOpts));
}

/**
 * Runs Monaco's built-in formatDocument action and tracks if content changed for diff display.
 * Uses a fallback timeout because some formatters may not trigger the change event reliably.
 * FORMAT_CHANGE_TIMEOUT provides a safety net to prevent hanging promises.
 */
export function runFormatWithDiff(): Promise<void> {
	if (!editor) return Promise.resolve();
	const formatAction = editor.getAction('editor.action.formatDocument');
	if (!formatAction || !formatAction.isSupported()) return Promise.resolve();
	const original = editor.getValue();

	return new Promise((resolve) => {
		const disposable = editor!.onDidChangeModelContent(() => {
			disposable.dispose();
			clearTimeout(fallback);
			const formatted = editor!.getValue();
			if (formatted !== original) {
				setLastFormat(original, formatted);
				window.parent.postMessage(
					{ type: 'format-diff-available', context },
					'*'
				);
			}
			resolve();
		});

		const fallback = setTimeout(() => {
			disposable.dispose();
			resolve();
		}, FORMAT_CHANGE_TIMEOUT);

		formatAction.run();
	});
}

/**
 * Applies initialization parameters to configure the Monaco editor instance.
 * Sets up language, theme, editor options, and registers formatters/actions.
 * Called once during iframe initialization.
 * @param params - Initialization parameters from the parent window
 */
function applyParams(params: InitParams): void {
	if (initialized) return;
	initialized = true;
	context = params.context;
	currentLang = params.lang || 'plaintext';
	editorDefaults = {
		folding: params.folding !== false,
		lineNumbers: params.lineNumbers !== false ? 'on' : 'off',
		minimap: { enabled: params.minimap !== false }
	};

	if (params.themeData) {
		try {
			monaco.editor.defineTheme(params.theme!, JSON.parse(params.themeData));
		} catch (e) {
			console.warn('code-files: defineTheme failed', e);
		}
	}

	const opts: Monaco.editor.IStandaloneEditorConstructionOptions = {
		language: params.lang || 'plaintext',
		theme: params.theme || 'vs-dark',
		...editorDefaults,
		wordWrap: params.wordWrap || 'off',
		automaticLayout: true
	};

	// Transparent background set by parent — prevents color flash on init.
	document.body.style.background = 'transparent';
	document.documentElement.style.background = 'transparent';

	// Allow comments and trailing commas in all JSON models (needed for .jsonc config files)
	monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
		allowComments: true,
		trailingCommas: 'ignore'
	});

	monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: params.noSemanticValidation === true,
		noSyntaxValidation: params.noSyntaxValidation === true
	});
	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: params.noSemanticValidation === true,
		noSyntaxValidation: params.noSyntaxValidation === true
	});

	// Configure TypeScript compiler options for inter-file navigation
	if (params.projectRootFolder) {
		const compilerOptions = {
			baseUrl: 'file:///' + params.projectRootFolder,
			moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
			allowNonTsExtensions: true,
			target: monaco.languages.typescript.ScriptTarget.ESNext,
			module: monaco.languages.typescript.ModuleKind.ESNext,
			allowJs: true,
			checkJs: false,
			paths: {}
		};
		monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
			compilerOptions
		);
		monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
			compilerOptions
		);
	}

	// Create model with file:/// URI for proper TypeScript resolution
	const modelUri = monaco.Uri.parse('file:///' + context);
	const existingModel = monaco.editor.getModel(modelUri);
	const model =
		existingModel ||
		monaco.editor.createModel('', params.lang || 'plaintext', modelUri);
	opts.model = model;

	editor = monaco.editor.create(document.getElementById('container')!, opts);

	// Intercept cross-file navigation (Ctrl+Click on imports)
	monaco.editor.registerEditorOpener({
		openCodeEditor: (
			_source: unknown,
			resource: Monaco.Uri,
			selectionOrPosition: Monaco.IRange | Monaco.IPosition | undefined
		) => {
			if (!params.projectRootFolder) {
				showInEditorMessage(
					'To navigate cross-file, define the parent folder as project root folder.'
				);
				return true; // Don't attempt to open
			}
			// resource.path = '/my-project/utils.ts' (without 'file://')
			let position = null;
			if (selectionOrPosition && 'startLineNumber' in selectionOrPosition) {
				position = {
					lineNumber: selectionOrPosition.startLineNumber,
					column: selectionOrPosition.startColumn
				};
			} else if (selectionOrPosition && 'lineNumber' in selectionOrPosition) {
				position = {
					lineNumber: selectionOrPosition.lineNumber,
					column: selectionOrPosition.column
				};
			}
			window.parent.postMessage(
				{
					type: 'open-file',
					path: resource.path.replace(/^\//, ''), // vault-relative path
					position,
					context
				},
				'*'
			);
			return true; // "handled, don't open inline"
		}
	});

	// Suppress Monaco's "Canceled" unhandled rejection when intercepting navigation
	window.addEventListener('unhandledrejection', (e) => {
		if (
			e.reason &&
			(e.reason.name === 'Canceled' || e.reason.message === 'Canceled')
		) {
			e.preventDefault();
		}
	});

	// Set shared state for diff and formatters
	setSharedState(editor, context, currentLang);
	setFormatterContext(context);
	setActionsState(editor, context, runFormatWithDiff);
	updateHotkeys(
		params.commandPaletteHotkey || null,
		params.settingsHotkey || null,
		params.deleteFileHotkey || null
	);

	// Register all document formatters
	registerFormatters();

	if (params.editorConfig) {
		try {
			applyEditorConfig(JSON.parse(params.editorConfig));
		} catch (e) {
			console.warn('code-files: invalid editorConfig JSON', e);
		}
	}

	// Register all actions and keyboard handlers
	registerActions(params, openDiffModal);

	// Notify parent when content changes (updates dirty badge)
	editor.onDidChangeModelContent(() => {
		window.parent.postMessage(
			{ type: 'change', value: editor!.getValue(), context },
			'*'
		);
	});
}

/**
 * Initializes the Monaco editor application and sets up message handling.
 * Signals readiness to parent and processes initialization messages.
 */
export function initMonacoApp(): void {
	// Signal that Monaco is fully loaded and ready to receive 'init'
	window.parent.postMessage({ type: 'ready' }, '*');

	window.addEventListener('message', (e) => {
		const data = e.data;
		if (!data || !data.type) return;

		switch (data.type) {
			case 'init':
				applyParams(data);
				window._initialized = true;
				if (window._pendingProjectFiles) {
					const files = window._pendingProjectFiles;
					for (let i = 0; i < files.length; i++) {
						const file = files[i];
						const uri = monaco.Uri.parse('file:///' + file.path);
						monaco.languages.typescript.typescriptDefaults.addExtraLib(
							file.content,
							uri.toString()
						);
						monaco.languages.typescript.javascriptDefaults.addExtraLib(
							file.content,
							uri.toString()
						);
						if (!monaco.editor.getModel(uri)) {
							monaco.editor.createModel(file.content, undefined, uri);
						}
					}
					window._pendingProjectFiles = null;
				}
				break;
			case 'change-value':
				if (editor && editor.getValue() !== (data.value || '')) {
					editor.setValue(data.value || '');
				}
				break;
			case 'change-language':
				if (editor)
					monaco.editor.setModelLanguage(editor.getModel()!, data.language);
				break;
			case 'change-theme':
				if (editor) {
					if (data.themeData) {
						try {
							monaco.editor.defineTheme(
								data.theme,
								JSON.parse(data.themeData)
							);
						} catch (e) {
							console.warn('code-files: defineTheme failed', e);
						}
					}
					monaco.editor.setTheme(data.theme);
				}
				break;
			case 'change-editor-config':
				if (editor) {
					try {
						applyEditorConfig(JSON.parse(data.config));
					} catch (e) {
						console.warn('code-files: invalid editorConfig JSON', e);
					}
				}
				break;
			case 'change-options':
				if (editor && typeof data.noSemanticValidation === 'boolean') {
					monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
						noSemanticValidation: data.noSemanticValidation,
						noSyntaxValidation: data.noSyntaxValidation
					});
					monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
						noSemanticValidation: data.noSemanticValidation,
						noSyntaxValidation: data.noSyntaxValidation
					});
				}
				break;
			case 'change-word-wrap':
				if (editor) editor.updateOptions({ wordWrap: data.wordWrap });
				break;
			case 'change-background':
				document.body.style.background = data.background;
				document.documentElement.style.background = data.background;
				if (data.theme) monaco.editor.setTheme(data.theme);
				break;
			case 'focus':
				if (editor) editor.focus();
				break;
			case 'scroll-to-position':
				if (editor && data.position) {
					editor.setPosition(data.position);
					editor.revealPositionInCenter(data.position);
				}
				break;
			case 'trigger-show-diff': {
				const { original, formatted } = getLastFormat();
				if (original && formatted) {
					openDiffModal(original, formatted);
				}
				break;
			}
			case 'update-hotkeys':
				updateHotkeys(
					data.commandPaletteHotkey || null,
					data.settingsHotkey || null,
					data.deleteFileHotkey || null
				);
				break;
			case 'load-project-files':
				// Load TypeScript/JavaScript project files for IntelliSense and cross-file navigation.
				// If Monaco isn't initialized yet, queue the files for later.
				if (!window._initialized) {
					window._pendingProjectFiles = data.files;
				} else {
					// Empty array = clear all project files (user cleared the project root folder)
					if (data.files.length === 0) {
						// Dispose all models except the current editor's model and diff editor models
						const currentModel = editor ? editor.getModel() : null;
						const allModels = monaco.editor.getModels();
						for (let i = 0; i < allModels.length; i++) {
							if (allModels[i] !== currentModel) {
								allModels[i].dispose();
							}
						}
						// Clear extra libs to remove all project files from TypeScript language service
						monaco.languages.typescript.typescriptDefaults.setExtraLibs([]);
						monaco.languages.typescript.javascriptDefaults.setExtraLibs([]);
					} else {
						// Load new project files into Monaco's TypeScript language service
						for (let i = 0; i < data.files.length; i++) {
							const file = data.files[i];
							const uri = monaco.Uri.parse('file:///' + file.path);
							// addExtraLib registers the file content with TypeScript for IntelliSense
							monaco.languages.typescript.typescriptDefaults.addExtraLib(
								file.content,
								uri.toString()
							);
							monaco.languages.typescript.javascriptDefaults.addExtraLib(
								file.content,
								uri.toString()
							);
							// createModel allows Ctrl+Click navigation to open the file
							if (!monaco.editor.getModel(uri)) {
								monaco.editor.createModel(file.content, undefined, uri);
							}
						}
					}
				}
				break;
		}
	});
}
