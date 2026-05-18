/**
 * Monaco Editor Initialization and Message Handling
 * Main initialization logic extracted from monacoEditor.html inline script
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Monaco global types don't match AMD-loaded runtime

import type * as Monaco from 'monaco-editor';
import type { InitParams, EditorConfig } from './types/index.ts';
import {
  FORMAT_CHANGE_TIMEOUT,
  setFormatPrintWidth,
  setFormatTabWidth,
  setFormatUseTabs
} from './types/index.ts';
import { setSharedState, setLastFormat, getLastFormat, openDiffModal } from './diff.ts';
import { registerFormatters, setFormatterContext } from './formatters.ts';
import {
  registerActions,
  setActionsState,
  setFormatOnSave,
  updateHotkeys,
  registerHotkeyActions
} from './actions.ts';
import { setParentOrigin, getParentOrigin } from './utils.ts';
import { initConsolePane, handleConsoleMessage, updateConsoleHotkey } from './console.ts';

let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let context: string | null = null;
let editorDefaults: Monaco.editor.IStandaloneEditorConstructionOptions = {};
let projectRootFolder: string | null = null;

let currentLang = 'plaintext';
let initialized = false;

/**
 * Displays a temporary notice overlay in the editor area, mirroring Obsidian's Notice style.
 * Used for status notifications like "Formatting..." or errors.
 * @param message - The message text to display
 */
function editorNotice(message: string): void {
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
 * Applies dynamic editor configuration settings (tab size, spaces vs tabs, format-on-save, Prettier options).
 * Called at init from params, and on each config update message from the parent window.
 * @param cfg - The editor configuration object
 */
export function applyEditorConfig(cfg: EditorConfig): void {
  if (!editor || !cfg) return;
  const modelOpts: Monaco.editor.ITextModelUpdateOptions = {};
  if (cfg.tabSize !== undefined) modelOpts.tabSize = cfg.tabSize;
  if (cfg.insertSpaces !== undefined) modelOpts.insertSpaces = cfg.insertSpaces;
  if (Object.keys(modelOpts).length) editor.getModel()?.updateOptions(modelOpts);
  setFormatOnSave(!!cfg.formatOnSave);
  // Update formatting options if specified
  if (cfg.printWidth !== undefined) {
    setFormatPrintWidth(cfg.printWidth);
  }
  // Update formatting tabWidth and useTabs from Monaco config
  if (cfg.tabSize !== undefined) {
    setFormatTabWidth(cfg.tabSize);
  }
  if (cfg.insertSpaces !== undefined) {
    setFormatUseTabs(!cfg.insertSpaces);
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
 *
 * @returns A promise that resolves when the formatting process is complete.
 */
export function runFormatWithDiff(): Promise<void> {
  if (!editor) return Promise.resolve();
  // Retrieve the native Monaco formatting action
  const formatAction = editor.getAction('editor.action.formatDocument');
  if (!formatAction || !formatAction.isSupported()) return Promise.resolve();

  // Store the current content to compare it after formatting
  const original = editor.getValue();

  return new Promise((resolve) => {
    // Listen for the next content change (the result of the formatting below)
    const disposable = editor!.onDidChangeModelContent(() => {
      disposable.dispose(); // Stop listening after the first change
      clearTimeout(fallback); // Cancel the safety timeout

      const formatted = editor!.getValue();
      // If formatting changed the text, notify the parent to show the diff UI
      if (formatted !== original) {
        setLastFormat(original, formatted);
        window.parent.postMessage(
          { type: 'format-diff-available', context },
          getParentOrigin()
        );
      }
      resolve();
    });

    // Safety timeout: resolve the promise even if the formatter does nothing (no change)
    const fallback = setTimeout(() => {
      disposable.dispose();
      resolve();
    }, FORMAT_CHANGE_TIMEOUT);

    // Trigger the formatting action
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
  projectRootFolder = params.projectRootFolder ?? null;
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
    applyDefaultCompilerOptions();
  }

  // Create (or reuse) the model for this file. A model is the text buffer Monaco
  // tracks internally — it holds content, language, identified
  // by its URI. Reusing an existing model avoids duplicates if the file is already open.
  const modelUri = monaco.Uri.file(context);
  const existingModel = monaco.editor.getModel(modelUri);
  const model =
    existingModel || monaco.editor.createModel('', params.lang || 'plaintext', modelUri);
  opts.model = model;

  // Create editor instance
  editor = monaco.editor.create(document.getElementById('container')!, opts);

  // Intercept cross-file navigation (Ctrl+Click, go-to-definition): instead of Monaco
  // trying to open the file itself, delegate to Obsidian via postMessage so it can open
  // the target file in its own leaf system.
  monaco.editor.registerEditorOpener({
    openCodeEditor: (
      _source: unknown,
      resource: Monaco.Uri,
      selectionOrPosition: Monaco.IRange | Monaco.IPosition | undefined
    ) => {
      if (!params.projectRootFolder) {
        editorNotice(
          'To navigate cross-file, define the parent folder as project root folder.'
        );
        return true; // Don't attempt to open
      }
      // Monaco passes either an IRange (selection) or IPosition (cursor) — normalize both
      // into a single {lineNumber, column} to send to the parent via postMessage.
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
          // resource.path is '/vault/file.ts' — strip the leading slash to get the vault-relative path
          path: resource.path.replace(/^\//, ''),
          position,
          context
        },
        getParentOrigin()
      );
      return true; // "handled, don't open inline"
    }
  });

  // When registerEditorOpener returns true, Monaco internally cancels its own file-open
  // operation via a CancellationToken, which surfaces as an unhandled "Canceled" rejection.
  // Suppress it to avoid console noise on every Ctrl+Click navigation.
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason && (e.reason.name === 'Canceled' || e.reason.message === 'Canceled')) {
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
    params.deleteFileHotkey || null,
    params.consoleHotkey || null
  );

  // Register all document formatters
  registerFormatters();

  // Apply initial editor config from the plugin's saved settings
  if (params.editorConfig) {
    try {
      applyEditorConfig(JSON.parse(params.editorConfig));
    } catch (e) {
      console.warn('code-files: invalid editorConfig JSON', e);
    }
  }

  // Register all actions and keyboard handlers
  registerActions(params, openDiffModal, {
    commandPalette: params.commandPaletteHotkey || null,
    settings: params.settingsHotkey || null,
    deleteFile: params.deleteFileHotkey || null,
    console: params.consoleHotkey || null
  });

  // Initialize console pane with persistent height and hotkey
  initConsolePane(
    context,
    editor,
    params.consoleHeight,
    params.consoleHotkey || null,
    params.commandPaletteHotkey || null,
    params.settingsHotkey || null
  );

  // Notify parent when content changes (updates dirty badge)
  editor.onDidChangeModelContent(() => {
    window.parent.postMessage(
      { type: 'change', value: editor!.getValue(), context },
      getParentOrigin()
    );
  });
}

/** Applies the hardcoded fallback TS compiler options when no tsconfig.json is used. */
function applyDefaultCompilerOptions(): void {
  if (!projectRootFolder) return;
  const compilerOptions = {
    // baseUrl must be a file:// URI string. Uri.file() normalizes the path
    baseUrl: monaco.Uri.file(projectRootFolder).toString(),
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    allowJs: true,
    checkJs: false,
    paths: {}
  };
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
}

/**
 * Maps raw tsconfig compilerOptions strings to Monaco TypeScript enum values,
 * then applies them to both TS and JS language service defaults.
 * Falls back to the hardcoded defaults for missing or unrecognized fields.
 * @param opts - Raw compilerOptions from tsconfig.json
 */
function applyTsConfigCompilerOptions(opts: Record<string, unknown>): void {
  if (!projectRootFolder) return;
  const ts = monaco.languages.typescript;

  const moduleResolutionMap: Record<string, number> = {
    node: ts.ModuleResolutionKind.NodeJs,
    node16: ts.ModuleResolutionKind.NodeJs,
    nodenext: ts.ModuleResolutionKind.NodeJs,
    bundler: ts.ModuleResolutionKind.NodeJs,
    classic: ts.ModuleResolutionKind.Classic
  };
  const targetMap: Record<string, number> = {
    es3: ts.ScriptTarget.ES3,
    es5: ts.ScriptTarget.ES5,
    es6: ts.ScriptTarget.ES2015,
    es2015: ts.ScriptTarget.ES2015,
    es2016: ts.ScriptTarget.ES2016,
    es2017: ts.ScriptTarget.ES2017,
    es2018: ts.ScriptTarget.ES2018,
    es2019: ts.ScriptTarget.ES2019,
    es2020: ts.ScriptTarget.ES2020,
    es2021: ts.ScriptTarget.ES2021,
    es2022: ts.ScriptTarget.ES2022,
    esnext: ts.ScriptTarget.ESNext
  };
  const moduleMap: Record<string, number> = {
    none: ts.ModuleKind.None,
    commonjs: ts.ModuleKind.CommonJS,
    amd: ts.ModuleKind.AMD,
    umd: ts.ModuleKind.UMD,
    system: ts.ModuleKind.System,
    es6: ts.ModuleKind.ES2015,
    es2015: ts.ModuleKind.ES2015,
    es2020: ts.ModuleKind.ES2020,
    esnext: ts.ModuleKind.ESNext,
    node16: ts.ModuleKind.ESNext,
    nodenext: ts.ModuleKind.ESNext
  };

  const mr = (opts.moduleResolution as string)?.toLowerCase();
  const tgt = (opts.target as string)?.toLowerCase();
  const mod = (opts.module as string)?.toLowerCase();

  const compilerOptions = {
    baseUrl: monaco.Uri.file(projectRootFolder).toString(),
    allowNonTsExtensions: true,
    moduleResolution: moduleResolutionMap[mr] ?? ts.ModuleResolutionKind.NodeJs,
    target: targetMap[tgt] ?? ts.ScriptTarget.ESNext,
    module: moduleMap[mod] ?? ts.ModuleKind.ESNext,
    allowJs: (opts.allowJs as boolean) ?? true,
    checkJs: (opts.checkJs as boolean) ?? false,
    paths: (opts.paths as object) ?? {}
  };

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
}

/**
 * Initializes the Monaco editor application and sets up message handling.
 * Signals readiness to parent and processes initialization messages.
 */
export function initMonacoApp(): void {
  // Signal that Monaco is fully loaded and ready to receive 'init'.
  // parentOrigin is '*' at this point — not yet captured from the init message.
  window.parent.postMessage({ type: 'ready' }, getParentOrigin());

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || !data.type) return;

    switch (data.type) {
      // Received from parent after sending 'ready' signal
      case 'init':
        // Capture the parent window origin for postMessage communication
        setParentOrigin(e.origin);
        applyParams(data);
        window._initialized = true;
        // Load pending project files
        if (window._pendingProjectFiles) {
          const files = window._pendingProjectFiles;
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const uri = monaco.Uri.file(file.path);
            // Register file with Monaco's TS/JS language service for cross-file IntelliSense,
            // import resolution, and semantic validation
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
        if (editor) monaco.editor.setModelLanguage(editor.getModel()!, data.language);
        break;
      case 'change-theme':
        if (editor) {
          if (data.themeData) {
            try {
              monaco.editor.defineTheme(data.theme, JSON.parse(data.themeData));
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
          data.deleteFileHotkey || null,
          data.consoleHotkey || null
        );
        registerHotkeyActions({
          commandPalette: data.commandPaletteHotkey,
          settings: data.settingsHotkey,
          deleteFile: data.deleteFileHotkey,
          console: data.consoleHotkey
        });
        updateConsoleHotkey(
          data.consoleHotkey || null,
          data.commandPaletteHotkey || null,
          data.settingsHotkey || null
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
            // Dispose all models except the currently open file's model
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
              const uri = monaco.Uri.file(file.path);
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
            // Override compiler options with tsconfig.json if provided
            if (data.tsConfigOptions) {
              applyTsConfigCompilerOptions(data.tsConfigOptions);
            } else {
              applyDefaultCompilerOptions();
            }
          }
        }
        break;
      default:
        handleConsoleMessage(data, editor, context);
        break;
    }
  });
}
