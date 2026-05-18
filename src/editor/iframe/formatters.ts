/**
 * Monaco Formatters Registration
 * All document formatting providers for supported languages.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Monaco global types don't match AMD-loaded runtime
import type * as Monaco from 'monaco-editor';
import {
  DEFAULT_PROSE_WRAP,
  DEFAULT_PRINT_WIDTH,
  DEFAULT_TAB_WIDTH,
  DEFAULT_USE_TABS
} from './types/index.ts';
import { setLastFormat } from './diff.ts';
import { getParentOrigin } from './utils.ts';

let context: string | null = null;

/**
 * Sets the context identifier for the formatter module.
 * Used for file-specific formatting logic (e.g., excluding .lock files).
 * @param ctx - The file context/path identifier
 */
export function setFormatterContext(ctx: string): void {
  context = ctx;
}

/**
 * Helper to register a Prettier-based formatting provider for a language.
 *
 * @param lang - The language identifier (e.g., 'typescript', 'css')
 * @param parser - The Prettier parser name
 * @param plugins - The Prettier plugins required by the parser
 * @param extraOptions - Additional Prettier options (e.g., proseWrap)
 */
function registerPrettierProvider(
  lang: string,
  parser: string,
  plugins: unknown[],
  extraOptions: object = {}
): void {
  monaco.languages.registerDocumentFormattingEditProvider(lang, {
    provideDocumentFormattingEdits: async (
      model: Monaco.editor.ITextModel
    ): Promise<Monaco.languages.TextEdit[]> => {
      try {
        const original = model.getValue(); // full raw text of the document
        const formatted = await prettier.format(original, {
          parser, // which Prettier parser to use
          plugins, // AMD global containing the parser
          printWidth: DEFAULT_PRINT_WIDTH,
          tabWidth: DEFAULT_TAB_WIDTH,
          useTabs: DEFAULT_USE_TABS,
          ...extraOptions
        });
        // Single TextEdit replacing the entire document; empty array = no edits applied
        return [{ range: model.getFullModelRange(), text: formatted }];
      } catch (e) {
        console.warn(`code-files: prettier ${lang} format failed`, e);
        return [];
      }
    }
  });
}

/**
 * Notifies the parent window about a formatting change.
 * Used for formatters that handle diff tracking directly.
 */
function notifyFormatDiff(original: string, formatted: string): void {
  setLastFormat(original, formatted);
  window.parent.postMessage(
    { type: 'format-diff-available', context },
    getParentOrigin()
  );
}

/**
 * Helper to register a WASM-based formatting provider.
 * Handles async initialization of the WASM module and diff notification.
 *
 * @param lang - The language identifier (e.g., 'python', 'go')
 * @param formatter - The formatter object containing init and format methods
 * @param wasmUrl - The URL to the WASM binary
 * @param format - A callback function that performs the actual formatting
 */
async function registerWasmProvider(
  lang: string,
  formatter:
    | { init: (url: string) => Promise<void>; format: (...args: unknown[]) => string }
    | undefined,
  wasmUrl: string,
  format: (original: string) => string
): Promise<void> {
  if (!formatter) {
    console.warn(`code-files: ${lang}-formatter not loaded`);
    return;
  }
  try {
    // Initialize the WASM module once at registration
    await formatter.init(wasmUrl);
  } catch (e) {
    console.error(`code-files: ${lang}-formatter init failed`, e);
    return;
  }
  // Register the document formatting provider with Monaco
  monaco.languages.registerDocumentFormattingEditProvider(lang, {
    provideDocumentFormattingEdits: (
      model: Monaco.editor.ITextModel
    ): Monaco.languages.TextEdit[] => {
      try {
        const original = model.getValue();
        const formatted = format(original);
        // If content changed, notify parent for diff tracking
        if (formatted !== original) {
          notifyFormatDiff(original, formatted);
        }
        // Replace the entire document content with the formatted text
        return [{ range: model.getFullModelRange(), text: formatted }];
      } catch (e) {
        console.warn(`code-files: ${lang} format failed`, e);
        return [];
      }
    }
  });
}

/**
 * Registers all Monaco document formatting edit providers for supported languages.
 * Most formatters delegate diff tracking to runFormatWithDiff() in init.ts,
 * but mermaid, python, and go handle setLastFormat() directly because they have
 * custom logic for determining when formatting actually changed content.
 */
export function registerFormatters(): void {
  // Register Mermaid as a custom language if not already registered
  if (
    !monaco.languages
      .getLanguages()
      .some((lang: Monaco.languages.ILanguageExtensionPoint) => lang.id === 'mermaid')
  ) {
    monaco.languages.register({ id: 'mermaid' });
  }

  // NOTE: Prettier formatters do NOT call notifyFormatDiff() directly.
  // Diff tracking is delegated to runFormatWithDiff() in init.ts.

  // Formats the full document with Prettier, then runs a second pass
  // to format any embedded ```mermaid``` blocks if the formatter is available.
  monaco.languages.registerDocumentFormattingEditProvider('markdown', {
    provideDocumentFormattingEdits: async (
      model: Monaco.editor.ITextModel
    ): Promise<Monaco.languages.TextEdit[]> => {
      try {
        const original = model.getValue();
        let formatted = await prettier.format(original, {
          parser: 'markdown',
          plugins: [prettierPlugins.markdown],
          proseWrap: DEFAULT_PROSE_WRAP,
          printWidth: DEFAULT_PRINT_WIDTH,
          tabWidth: DEFAULT_TAB_WIDTH,
          useTabs: DEFAULT_USE_TABS
        });
        // Format mermaid blocks inside the markdown
        if (window.mermaidFormatter?.formatMarkdownMermaidBlocks) {
          formatted = window.mermaidFormatter.formatMarkdownMermaidBlocks(formatted);
        }
        return [{ range: model.getFullModelRange(), text: formatted }];
      } catch (e) {
        console.warn('code-files: prettier format failed', e);
        return [];
      }
    }
  });

  // Formats mermaid diagrams; handles diff tracking directly
  // since mermaid is a custom language outside Monaco's native formatter pipeline.
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
          notifyFormatDiff(original, formatted);
        }
        return [{ range: model.getFullModelRange(), text: formatted }];
      } catch (e) {
        console.warn('code-files: mermaid format failed', e);
        return [];
      }
    }
  });

  registerPrettierProvider('typescript', 'typescript', [
    prettierPlugins.estree,
    prettierPlugins.typescript
  ]);
  registerPrettierProvider('javascript', 'babel', [
    prettierPlugins.babel,
    prettierPlugins.estree
  ]);
  registerPrettierProvider('html', 'html', [prettierPlugins.html]);
  registerPrettierProvider('json', 'json', [
    prettierPlugins.babel,
    prettierPlugins.estree
  ]);
  registerPrettierProvider('graphql', 'graphql', [prettierPlugins.graphql]);

  ['css', 'scss', 'less'].forEach((lang) =>
    registerPrettierProvider(lang, lang, [prettierPlugins.postcss])
  );

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
          printWidth: DEFAULT_PRINT_WIDTH,
          tabWidth: DEFAULT_TAB_WIDTH,
          useTabs: DEFAULT_USE_TABS
        });
        return [{ range: model.getFullModelRange(), text: formatted }];
      } catch (e) {
        console.warn('code-files: prettier yaml format failed', e);
        return [];
      }
    }
  });

  // ── C/C++: clang-format ───────────────────────────────────────────────────
  ['c', 'cpp'].forEach((lang) => {
    registerWasmProvider(
      lang,
      window.clangFormatter,
      window.__CLANG_WASM_URL__!,
      (original) => window.clangFormatter!.format(original)
    );
  });

  // ── Python: Ruff Formatter ────────────────────────────────────────────────
  registerWasmProvider(
    'python',
    window.ruffFormatter,
    window.__RUFF_WASM_URL__!,
    (original) =>
      window.ruffFormatter!.format(original, null, {
        indent_style: DEFAULT_USE_TABS ? 'tab' : 'space',
        indent_width: DEFAULT_TAB_WIDTH,
        line_width: DEFAULT_PRINT_WIDTH,
        line_ending: 'lf',
        quote_style: 'double',
        magic_trailing_comma: 'respect'
      })
  );

  // ── Go: gofmt Formatter ───────────────────────────────────────────────────
  registerWasmProvider(
    'go',
    window.gofmtFormatter,
    window.__GOFMT_WASM_URL__!,
    (original) => window.gofmtFormatter!.format(original)
  );
}
