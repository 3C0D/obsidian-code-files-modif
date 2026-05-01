/**
 * Creates and manages an isolated iframe containing a Monaco Editor instance.
 * Handles bidirectional postMessage communication (init, change-value, change-theme, etc.),
 * local Monaco loading (fetch HTML, patch ./vs paths to app://, inline CSS),
 * and works around Obsidian's CSP constraints (blob URL, appendChild interception, @font-face patching).
 * Returns a CodeEditorInstance with send(), getValue(), setValue(), destroy().
 */
import type CodeFilesPlugin from '../../main.ts';
import { type CodeEditorInstance } from '../../types/types.ts';

import { buildMessageHandler } from './messageHandler.ts';
import { resolveAssetUrls } from './assetUrls.ts';
import { buildInitParams } from './buildInitParams.ts';
import { buildBlobUrl } from './buildBlobUrl.ts';
import { loadProjectFiles } from './projectLoader.ts';

/**
 * Creates a Monaco Editor instance isolated in an iframe and returns a control handle.
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
 * @param plugin - The plugin instance
 * @param language - Monaco language ID (e.g. 'typescript', 'javascript', 'markdown')
 * @param initialValue - Initial content to display in the editor
 * @param codeContext - Unique identifier for this editor instance (file path or modal ID), used to filter postMessage events. Avoids cross-talk between multiple open editors.
 * @param onChange - Optional callback invoked when the editor content changes
 * @param onSave - Optional callback invoked when the user presses Ctrl+S
 * @param onFormatDiff - Optional callback invoked when a format diff is available (after formatting)
 * @param onOpenEditorConfig - Optional callback invoked when the user requests editor settings
 * @param onOpenThemePicker - Optional callback invoked when the user requests theme picker
 * @param onOpenRenameExtension - Optional callback invoked when the user requests Rename (Name/ext)
 * @param autoFocus - Optional flag to disable automatic focus on editor ready (default: true)
 * @returns A CodeEditorInstance with methods to control the editor (send, getValue, setValue, destroy)
 */
export const mountCodeEditor = async (
	plugin: CodeFilesPlugin,
	language: string,
	initialValue: string,
	codeContext: string,
	containerEl: HTMLElement,
	onChange?: () => void,
	onSave?: () => void,
	onFormatDiff?: () => void,
	onFormatDiffReverted?: () => void,
	onOpenEditorConfig?: (ext: string) => void,
	onOpenThemePicker?: () => void,
	onOpenRenameExtension?: () => void,
	autoFocus = true
): Promise<CodeEditorInstance> => {
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
