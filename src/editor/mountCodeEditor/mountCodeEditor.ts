/**
 * Creates and manages an isolated iframe containing a Monaco Editor instance.
 * Handles bidirectional postMessage communication (init, change-value, change-theme, etc.),
 * local Monaco loading (fetch HTML, patch ./vs paths to app://, inline CSS),
 * and works around Obsidian's CSP constraints (blob URL, appendChild interception, @font-face patching).
 * Returns a CodeEditorHandle with send(), getValue(), setValue(), destroy().
 */
import type {
	CodeEditorHandle,
	MountCodeEditorOptions,
	Prettify
} from '../../types/index.ts';

import { buildMessageHandler, activeProcesses } from './messageHandler.ts';
import { resolveAssetUrls } from './assetUrls.ts';
import { buildInitParams } from './buildInitParams.ts';
import { buildBlobUrl } from './buildBlobUrl.ts';
import { loadProjectFiles } from './projectLoader.ts';

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
 * @param options.language - The programming language of the code.
 * @param options.initialValue - The initial value of the code.
 * @param options.codeContext - The context of the code (file path or modal ID).
 * @param options.containerEl - The container element to mount the iframe.
 * @param options.onChange - Optional callback for when the code changes.
 * @param options.onSave - Optional callback for when the code is saved.
 * @param options.onFormatDiff - Optional callback for when the code is formatted.
 * @param options.onFormatDiffReverted - Optional callback for when the formatted code is reverted.
 * @param options.onOpenEditorConfig - Optional callback for when the editor config is opened.
 * @param options.onOpenThemePicker - Optional callback for when the theme picker is opened.
 * @param options.onOpenRenameExtension - Optional callback for when the rename extension is opened.
 * @param options.autoFocus - Defaults to true. If true, the editor is focused on mount.
 * @returns A CodeEditorHandle with methods to control the editor (send, getValue, setValue, destroy)
 */
export const mountCodeEditor = async (
	options: Prettify<MountCodeEditorOptions>
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
	const extension = codeContext.match(/\.([^.]+)$/)?.[1] ?? '';

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

	const blobUrl = await buildBlobUrl(urls);
	iframe.src = blobUrl;

	/**
	 * Sends a typed postMessage to the Monaco iframe.
	 * '*' is intentional: the iframe is a blob: URL with no stable origin to target.
	 *
	 * @param type - Message type identifier (e.g. 'init', 'change-value', 'change-theme').
	 * @param payload - Data to send alongside the message. Spread into the message object,
	 *                  so the iframe receives { type, ...payload }.
	 */
	const send = (type: string, payload: Record<string, unknown>): void => {
		iframe.contentWindow?.postMessage({ type, ...payload }, '*');
	};

	const onMessage = buildMessageHandler({
		iframe,
		send,
		valueRef,
		codeContext,
		plugin,
		initParams,
		loadProjectFiles: (send) => loadProjectFiles(plugin, send),
		autoFocus,
		onChange,
		onSave,
		onFormatDiff,
		onFormatDiffReverted,
		onOpenEditorConfig,
		onOpenThemePicker,
		onOpenRenameExtension
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
		// Kill any active process for this editor context
		activeProcesses.get(codeContext)?.kill();
		activeProcesses.delete(codeContext);
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
		destroy
	};
};
