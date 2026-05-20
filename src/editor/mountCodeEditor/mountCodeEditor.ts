/**
 * Creates and manages an isolated iframe containing a Monaco Editor instance.
 * Handles bidirectional postMessage communication (init, change-value, change-theme, etc.),
 * local Monaco loading (fetch HTML, patch ./vs paths to app://, inline CSS),
 * and works around Obsidian's CSP constraints (blob URL, appendChild interception, @font-face patching).
 * Returns a CodeEditorHandle with send(), getValue(), setValue(), destroy(), clear(), ready, iframe.
 */
import type {
  CodeEditorHandle,
  MountCodeEditorOptions,
  SendFunction
} from '../../types/index.ts';

import { buildMessageHandler } from './messageHandler.ts';
import { resolveAssetUrls } from './assetUrls.ts';
import { buildInitParams } from './buildInitParams.ts';
import { buildBlobUrl } from './buildBlobUrl.ts';
import { loadProjectFiles } from './projectLoader.ts';
import { getExtension } from '../../utils/fileUtils.ts';
import { Notice } from 'obsidian';

/**
 * Orchestrates the mounting of a Monaco Editor by creating an isolated iframe
 * and returning a control handle (CodeEditorHandle).
 *
 * Why an iframe?
 * Monaco requires a full browser environment and conflicts with Obsidian's DOM if loaded directly.
 * The iframe provides isolation; postMessage handles all bidirectional communication.
 *
 * Why async + fetch + blob URL?
 * - getResourcePath() appends a cache-busting timestamp (?1234...) that breaks relative paths
 *   like ./vs/loader.js inside the HTML.
 * - file:// URLs are blocked by Electron's CSP.
 * - Solution: fetch the HTML, rewrite ./vs paths to absolute app:// URLs (timestamp stripped),
 *   inline the Monaco CSS (Obsidian's CSP blocks external <link> in child frames),
 *   then serve via a blob URL which bypasses the parent CSP for its own inline content.
 *
 * @param options - Configuration object containing all required parameters and optional callbacks
 * @param options.plugin - The plugin instance.
 * @param options.language - Monaco language identifier for syntax highlighting (e.g. `'typescript'`, `'python'`).
 * @param options.initialValue - Initial text content to load into the editor.
 * @param options.codeContext - Unique identifier for this editor instance: vault file path or a modal-specific ID (e.g. `'settings-editor-config.jsonc'`).
 * @param options.containerEl - DOM element in which the iframe will be mounted.
 * @param options.onChange - Called when the editor content changes.
 * @param options.onSave - Called when the user triggers a save (Ctrl+S).
 * @param options.onFormatDiff - Called when the formatter detects a formatting diff.
 * @param options.onFormatDiffReverted - Called when the user reverts the formatting diff.
 * @param options.onOpenEditorConfig - Called when the user opens the formatter config for the current extension.
 * @param options.onOpenThemePicker - Called when the user opens the theme picker.
 * @param options.onOpenRenameExtension - Called when the user triggers the rename extension action.
 * @param options.onConsoleVisibilityChanged - Called when the console panel is shown or hidden.
 * @param options.initialConsoleOpen - If true, the console panel is shown immediately on mount.
 * @param options.autoFocus - Defaults to true. If true, the editor receives focus on mount.
 * @returns A CodeEditorHandle exposing: send, getValue, setValue, destroy, clear, ready, iframe.
 */
export const mountCodeEditor = async (
  options: MountCodeEditorOptions
): Promise<CodeEditorHandle> => {
  const {
    plugin,
    language,
    initialValue,
    codeContext,
    containerEl,
    onChange,
    onSave,
    onFormatDiff,
    onFormatDiffReverted,
    onOpenEditorConfig,
    onOpenThemePicker,
    onOpenRenameExtension,
    onConsoleVisibilityChanged,
    initialConsoleOpen,
    autoFocus = true
  } = options;
  // Use the document/window of the container element to support Obsidian popout windows
  const doc = containerEl.ownerDocument;
  const win = doc.win;
  const valueRef = { current: initialValue };
  // Determine default theme: 'vs-dark' if Obsidian is in dark mode, 'vs' otherwise
  // Use doc.body to support popout windows (each window has its own document/body)
  const defaultTheme = doc.body.classList.contains('theme-dark') ? 'vs-dark' : 'vs';
  const theme =
    plugin.settings.theme === 'default' ? defaultTheme : plugin.settings.theme;

  const urls = resolveAssetUrls(plugin);

  // find extension for this editor based on codeContext (file path or modal ID as 'settings-editor-config.jsonc')
  const extension = getExtension(codeContext);

  const initParams = await buildInitParams(
    plugin,
    codeContext,
    language,
    theme,
    extension
  );

  // Create the iframe in the correct document (supports popout windows)
  const iframe = doc.createElement('iframe') as HTMLIFrameElement;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.filter = `brightness(${plugin.settings.editorBrightness})`;

  const blobUrl = await buildBlobUrl(urls).catch((err) => {
    new Notice(
      'Failed to load Monaco Editor assets.\n\n' +
        '1. Try reloading Obsidian (Ctrl+R)\n' +
        '2. If it persists, reinstall the plugin\n' +
        '3. If still broken, report on GitHub',
      15000
    );
    console.error('[Code Files] Critical asset loading failure:', err);
    throw err; // Re-throw to propagate the error to the caller
  });
  iframe.src = blobUrl;

  // Promise that resolves when Monaco is fully ready
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  /**
   * Sends a typed postMessage to the Monaco iframe.
   * '*' is intentional: the iframe is a blob: URL with no stable origin to target.
   *
   * @param type - Message type identifier (e.g. 'init', 'change-value', 'change-theme').
   * @param payload - Data to send alongside the message. Spread into the message object,
   *                  so the iframe receives { type, ...payload }.
   */
  const send: SendFunction = (type, payload): void => {
    iframe.contentWindow?.postMessage({ type, ...payload }, '*');
  };

  const { handler: onMessage, cleanup } = buildMessageHandler({
    iframe,
    send,
    valueRef,
    codeContext,
    plugin,
    initParams,
    loadProjectFiles: (send) => loadProjectFiles(plugin, send),
    autoFocus,
    resolveReady,
    onChange,
    onSave,
    onFormatDiff,
    onFormatDiffReverted,
    onOpenEditorConfig,
    onOpenThemePicker,
    onOpenRenameExtension,
    onConsoleVisibilityChanged,
    initialConsoleOpen
  });

  // Register the message listener on the correct window (supports popout windows)
  win.addEventListener('message', onMessage);

  // Clears the editor content and resets the internal value cache.
  const clear = (): void => {
    send('change-value', { value: '' });
    valueRef.current = '';
  };

  // Updates the editor content and keeps the internal cache in sync.
  const setValue = (newValue: string): void => {
    valueRef.current = newValue;
    send('change-value', { value: newValue });
  };

  // Returns the last known editor content (synced on every 'change' message).
  const getValue = (): string => valueRef.current;

  const destroy = (): void => {
    cleanup(); // Kill any active process for this editor context
    win.removeEventListener('message', onMessage);
    // Note: blob URL is now cached globally, revoked only on plugin unload
    iframe.remove();
  };

  return {
    iframe,
    send,
    clear,
    getValue,
    setValue,
    destroy,
    ready
  };
};
