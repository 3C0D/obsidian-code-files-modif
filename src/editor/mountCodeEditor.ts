/**
 * Creates and manages a Monaco Editor instance inside an isolated iframe.
 * Handles bidirectional postMessage communication (init, change-value, change-theme, etc.),
 * local Monaco loading (fetch HTML, patch ./vs paths to app://, inline CSS),
 * and works around Obsidian's CSP constraints (blob URL, appendChild interception, @font-face patching).
 * Returns a CodeEditorInstance with send(), getValue(), setValue(), destroy().
 */
import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { type CodeEditorInstance } from '../types/types.ts';
import manifest from '../../manifest.json' with { type: 'json' };

import { buildMergedConfig } from '../utils/settingsUtils.ts';
import { getActiveExtensions } from '../utils/extensionUtils.ts';
import { getObsidianHotkey, parseHotkeyOverride } from '../utils/hotkeyUtils.ts';
import { CodeEditorView } from './codeEditorView.ts';
import { broadcastHotkeys } from '../utils/broadcast.ts';
import { readProjectFiles } from '../utils/projectUtils.ts';
import { around } from 'monkey-around';

const BUILTIN_THEMES = ['vs', 'vs-dark', 'hc-black', 'hc-light', 'default'];

/** Resolves theme parameters for Monaco. For built-in themes, returns the theme name.
 *  For custom themes, fetches the theme JSON and returns it as themeData. */
export const resolveThemeParams = async (
	plugin: CodeFilesPlugin,
	theme: string
): Promise<{ theme: string; themeData?: string }> => {
	const pluginBase = normalizePath(
		`${plugin.app.vault.configDir}/plugins/${manifest.id}`
	);
	const resolvedTheme =
		theme === 'default'
			? document.body.classList.contains('theme-dark')
				? 'vs-dark'
				: 'vs'
			: theme;
	// Sanitized theme name. Only alphanumeric and dashes allowed
	const safeThemeId = resolvedTheme.replace(/[^a-z0-9\-]/gi, '-');
	let themeData: string | undefined;
	if (!BUILTIN_THEMES.includes(theme)) {
		try {
			const themePath = normalizePath(`${pluginBase}/monaco-themes/${theme}.json`);
			const url = plugin.app.vault.adapter.getResourcePath(themePath);
			// Timestamp is appended to the URL by getResourcePath, but it doesn't affect the fetch since it's just a cache buster. The theme JSON is fetched and passed as a string to the iframe, which will parse it and register the theme with Monaco.
			themeData = JSON.stringify(await (await fetch(url)).json());
		} catch (e) {
			console.warn(`code-files: theme "${theme}" not found`, e);
		}
	}
	return { theme: safeThemeId, themeData };
};

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
 * @param onOpenRenameExtension - Optional callback invoked when the user requests rename (name.ext)
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
	let value = initialValue;
	// Determine default theme: 'vs-dark' if Obsidian is in dark mode, 'vs' otherwise
	// Use doc.body to support popout windows (each window has its own document/body)
	const defaultTheme = doc.body.classList.contains('theme-dark') ? 'vs-dark' : 'vs';
	const theme =
		plugin.settings.theme === 'default' ? defaultTheme : plugin.settings.theme;

	const pluginBase = normalizePath(
		`${plugin.app.vault.configDir}/plugins/${manifest.id}`
	);

	/**
	 * Reads all TS/JS files under the project root and sends them to Monaco for IntelliSense.
	 * Called once on editor init (on 'ready' message).
	 *
	 * @param send - Callback to post a message to the Monaco iframe.
	 */
	async function loadProjectFiles(
		send: (type: string, payload: Record<string, unknown>) => void
	): Promise<void> {
		const files = await readProjectFiles(plugin);
		send('load-project-files', { files });
	}

	// Resolves a plugin-relative path to an app:// URL
	const res = (name: string): string =>
		plugin.app.vault.adapter.getResourcePath(normalizePath(`${pluginBase}/${name}`));

	// Resolve all plugin asset URLs up front.
	// vsBase strips the timestamp because it's used as a path prefix inside the iframe HTML.
	// All other URLs keep the timestamp — they're used directly with fetch() or <script src>.
	// Prettier plugins and mermaid are loaded as UMD(Universal Module Definition) bundles served via app:// to satisfy CSP.
	const htmlUrl = res('monacoEditor.html');
	const vsBase = res('vs').replace(/\?.*$/, ''); // Strip timestamp for use as base path
	const configJsUrl = res('monacoHtml.js');
	const configCssUrl = res('monacoHtml.css');
	const diffJsUrl = res('monacoDiff.js');
	const formattersJsUrl = res('monacoFormatters.js');
	const actionsJsUrl = res('monacoActions.js');
	const prettierBase = res('formatters/prettier-standalone.js');
	const prettierMarkdownUrl = res('formatters/prettier-markdown.js');
	const prettierEstreeUrl = res('formatters/prettier-estree.js');
	const prettierTypescriptUrl = res('formatters/prettier-typescript.js');
	const prettierBabelUrl = res('formatters/prettier-babel.js');
	const prettierPostcssUrl = res('formatters/prettier-postcss.js');
	const prettierHtmlUrl = res('formatters/prettier-html.js');
	const prettierYamlUrl = res('formatters/prettier-yaml.js');
	const prettierGraphqlUrl = res('formatters/prettier-graphql.js');
	const mermaidFormatterUrl = res('formatters/mermaid-formatter.js');
	const clangFormatterUrl = res('formatters/clang-formatter.js');
	const clangWasmUrl = res('formatters/clang-format.wasm');
	const ruffFormatterUrl = res('formatters/ruff-formatter.js');
	const ruffWasmUrl = res('formatters/ruff_fmt_bg.wasm');
	const gofmtFormatterUrl = res('formatters/gofmt-formatter.js');
	const gofmtWasmUrl = res('formatters/gofmt.wasm');

	// Reads Obsidian's configured hotkey for a command, falling back to the command's default hotkeys.
	const commandPaletteHotkey = getObsidianHotkey(plugin.app, 'command-palette:open');
	const settingsHotkey = getObsidianHotkey(plugin.app, 'app:open-settings');
	const deleteFileHotkey = getObsidianHotkey(plugin.app, 'app:delete-file') ?? {
		modifiers: ['Ctrl'],
		key: 'Delete'
	};

	// Apply overrides if they exist (overrides are stored as 'Mod' internally for cross-platform consistency)
	const finalCommandPaletteHotkey = parseHotkeyOverride(
		plugin.settings.commandPaletteHotkeyOverride
	) ??
		commandPaletteHotkey ?? { modifiers: ['Mod'], key: 'p' };
	const finalSettingsHotkey = parseHotkeyOverride(
		plugin.settings.settingsHotkeyOverride
	) ??
		settingsHotkey ?? { modifiers: ['Mod'], key: ',' };
	const finalDeleteFileHotkey =
		parseHotkeyOverride(plugin.settings.deleteFileHotkeyOverride) ?? deleteFileHotkey;

	// Disable minimap and line numbers for config editors (modal + settings tab)
	// - editor-settings-config: config editor in the gear icon modal
	// - settings-editor-config: config editor in the plugin settings tab
	// - modal-editor.*: code fence editor modals (keep line numbers, disable minimap only)
	const initParams: Record<string, unknown> = {
		context: codeContext,
		lang: language,
		theme: theme.replace(/[^a-z0-9\-]/gi, '-'),
		wordWrap: plugin.settings.wordWrap,
		folding: plugin.settings.folding,
		lineNumbers:
			codeContext.includes('editor-settings-config') ||
			codeContext.includes('settings-editor-config')
				? false
				: plugin.settings.lineNumbers,
		minimap:
			codeContext.includes('editor-settings-config') ||
			codeContext.includes('settings-editor-config') ||
			codeContext.startsWith('modal-editor.')
				? false
				: plugin.settings.minimap,
		// Monaco uses negative flags (noSemanticValidation, noSyntaxValidation), but settings use positive flags
		noSemanticValidation: !plugin.settings.semanticValidation,
		noSyntaxValidation: !plugin.settings.syntaxValidation,
		projectRootFolder: plugin.settings.projectRootFolder,
		commandPaletteHotkey: finalCommandPaletteHotkey,
		settingsHotkey: finalSettingsHotkey,
		deleteFileHotkey: finalDeleteFileHotkey
	};
	// find extension for this editor based on codeContext (file path or modal ID as 'settings-editor-config.jsonc')
	const extMatch = codeContext.match(/\.([^.]+)$/);
	const extension = extMatch ? extMatch[1] : '';
	// If the editor is for a file with an extension that doesn't have a registered formatter, set a flag so the Monaco iframe can show a warning and hide formatting options.
	if (extension && !getActiveExtensions(plugin.settings).includes(extension)) {
		initParams.isUnregisteredExtension = true;
	}

	// Custom themes need their JSON fetched and passed as themeData; built-in themes are handled by Monaco directly.
	if (!BUILTIN_THEMES.includes(theme)) {
		const resolved = await resolveThemeParams(plugin, theme);
		if (resolved.themeData) initParams.themeData = resolved.themeData;
	}

	// Transparent background prevents a color flash in the iframe while Monaco loads.
	initParams.background = 'transparent';

	initParams.editorConfig = buildMergedConfig(plugin, extension);

	// Create the iframe in the correct document (supports popout windows)
	const iframe = doc.createElement('iframe') as HTMLIFrameElement;
	iframe.style.width = '100%';
	iframe.style.height = '100%';
	iframe.style.filter = `brightness(${plugin.settings.editorBrightness})`;

	// Fetch and patch HTML
	let html = await (await fetch(htmlUrl)).text();
	// Patch relative ./vs paths to absolute app:// URLs so Monaco can load its workers and modules
	html = html
		.replace("'./vs'", `'${vsBase}'`)
		.replace('"./vs/loader.js"', `"${vsBase}/loader.js"`)
		.replace('"./monacoHtml.js"', `"${configJsUrl}"`)
		.replace('"./monacoDiff.js"', `"${diffJsUrl}"`)
		.replace('"./monacoFormatters.js"', `"${formattersJsUrl}"`)
		.replace('"./monacoActions.js"', `"${actionsJsUrl}"`)
		.replace('<link rel="stylesheet" href="./monacoHtml.css" />', '');
	const cssUrl = `${vsBase}/editor/editor.main.css`;
	let cssText = await (await fetch(cssUrl)).text();
	// Replace the base64-encoded font source in @font-face with an absolute app:// URL.
	// Obsidian's CSP blocks data: font sources in child frames, but app:// URLs are allowed.
	const codiconFontUrl = `${vsBase}/editor/codicon.ttf`;

	// In Monaco's CSS, the codicon @font-face src ends with url(<base64-data>) format('truetype').
	// Obsidian's CSP blocks data: font sources in child frames — replace with the local app:// URL.
	// Group 1 captures everything up to the url() to preserve the rest of the rule intact.
	cssText = cssText.replace(
		/(@font-face\s*\{[^}]*src:[^;]*)url\([^)]+\)\s*format\(["']truetype["']\)/g,
		`$1url('${codiconFontUrl}') format('truetype')`
	);
	// Fetch and inline the monacoHtml.css config
	const configCssText = await (await fetch(configCssUrl)).text();
	// Inject CSS inline and intercept dynamic <link rel="stylesheet"> insertions Monaco attempts at runtime.
	// Without this, Monaco tries to inject its CSS via <link> which Obsidian's CSP blocks in child frames.
	// appendChild is monkey-patched: <link> nodes are silently dropped (returned without inserting)
	// so Monaco doesn't throw, while all other nodes are inserted normally via the original appendChild.
	// Inject parseEditorConfig as inline JavaScript because the iframe is isolated
	// and cannot import from settingsUtils.ts. This is a duplicate of the TypeScript
	// version in settingsUtils.ts — keep them in sync (same regex patterns, same logic).
	html = html.replace(
		'</head>',
		`<script>
function parseEditorConfig(str) {
    return JSON.parse(
        str
            .replace(/\\/\\/[^\\n]*/g, '')
            .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')
            .replace(/,(\\s*[}\\]])/g, '$1')
    );
}
</script>
<script src="${prettierBase}"></script>
<script src="${prettierMarkdownUrl}"></script>
<script src="${prettierEstreeUrl}"></script>
<script src="${prettierTypescriptUrl}"></script>
<script src="${prettierBabelUrl}"></script>
<script src="${prettierPostcssUrl}"></script>
<script src="${prettierHtmlUrl}"></script>
<script src="${prettierYamlUrl}"></script>
<script src="${prettierGraphqlUrl}"></script>
<script src="${mermaidFormatterUrl}"></script>
<script src="${clangFormatterUrl}"></script>
<script>window.__CLANG_WASM_URL__ = '${clangWasmUrl}';</script>
<script src="${ruffFormatterUrl}"></script>
<script>window.__RUFF_WASM_URL__ = '${ruffWasmUrl}';</script>
<script src="${gofmtFormatterUrl}"></script>
<script>window.__GOFMT_WASM_URL__ = '${gofmtWasmUrl}';</script>
<script src="${configJsUrl}"></script>
<script src="${diffJsUrl}"></script>
<script src="${formattersJsUrl}"></script>
<script src="${actionsJsUrl}"></script>
<style>${cssText}</style>
<style>${configCssText}</style>
<script>
// Monkey-patch appendChild to intercept dynamic <link> insertions from Monaco.
// This is necessary because Monaco attempts to inject its CSS via <link rel="stylesheet">
// which is blocked by Obsidian's CSP in child frames (iframes).
// By dropping the <link> nodes and keeping only the inline <style> below,
// we satisfy both Monaco's loading logic and Obsidian's security policy.
const _orig = Element.prototype.appendChild;
Element.prototype.appendChild = function(node) {
    if (node.tagName === 'LINK' && node.rel === 'stylesheet') return node;
    return _orig.call(this, node);
};
</script>
</head>`
	);
	/**
	 * Wrap the patched HTML in a Blob and serve it via a blob: URL.
	 * This is required because naive approaches to load the local HTML file are all blocked:
	 *  - iframe.src = file:///...monacoEditor.html : blocked by Electron's CSP.
	 *  - srcdoc and data: URLs cannot run scripts under Obsidian's CSP.
	 * A blob: URL bypasses these restrictions — it is treated as same-origin by the iframe
	 * and allows app:// script sources, while containing the patched HTML inline.
	 * blobUrl must be revoked in destroy() to avoid a memory leak.
	 */
	const blob = new Blob([html], { type: 'text/html' });
	const blobUrl = URL.createObjectURL(blob);
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

	/**
	 * Handles incoming postMessages from the Monaco iframe.
	 * Registered on window and filtered by source to only process messages
	 * from this specific iframe — guards against other Monaco instances
	 * or third-party postMessage calls hitting this handler.
	 *
	 * @param data - The message payload sent by the iframe, containing at minimum
	 *               a `type` string and optionally a `context` string to identify
	 *               which editor instance sent the message.
	 * @param source - The window that sent the message. Compared against
	 *                 iframe.contentWindow to reject foreign messages.
	 */
	const onMessage = async ({ data, source }: MessageEvent): Promise<void> => {
		// guard against messages from other iframes or sources
		if (source !== iframe.contentWindow) return;
		switch (data.type) {
			case 'ready': {
				// Monaco is loaded — send config, then set initial content.
				// Order matters: init must come before change-value so the editor exists when value arrives.
				send('init', initParams);
				send('change-value', { value });
				if (autoFocus) send('focus', {});
				void loadProjectFiles(send);
				break;
			}
			case 'open-formatter-config': {
				if (data.context === codeContext) {
					// ext from file path or e.g 'settings-editor-config.jsonc
					const ext = codeContext.match(/\.([^./\\]+)$/)?.[1] ?? '';
					onOpenEditorConfig?.(ext);
				}
				break;
			}
			case 'open-theme-picker': {
				if (data.context === codeContext) {
					onOpenThemePicker?.();
				}
				break;
			}
			case 'open-settings': {
				if (data.context === codeContext) {
					// Patch settings modal onClose to detect hotkey changes safely via monkey-around.
					// This ensures we always restore the original method and don't overwrite other patches.
					// Wait 200ms after close to ensure Obsidian has saved the new hotkeys.
					const uninstall = around(plugin.app.setting, {
						onClose(old) {
							return function () {
								const result = old.apply(this);
								uninstall();
								setTimeout(() => {
									void broadcastHotkeys(plugin);
								}, 200);
								send('focus', {});
								return result;
							};
						}
					});
					plugin.app.setting.open();
				}
				break;
			}
			case 'delete-file': {
				if (data.context === codeContext) {
					const file = plugin.app.vault.getFileByPath(codeContext);
					if (!file) break;
					const leaf = plugin.app.workspace
						.getLeavesOfType('code-editor')
						.find(
							(l) =>
								l.view instanceof CodeEditorView &&
								l.view.file?.path === codeContext
						);
					leaf?.detach();
					await plugin.app.vault.trash(file, true);
				}
				break;
			}
			case 'open-obsidian-palette': {
				if (data.context === codeContext) {
					// Patch onClose to refocus Monaco when command palette closes safely via monkey-around.
					const cmdPalette =
						plugin.app.internalPlugins.getPluginById('command-palette');
					if (!cmdPalette) break;
					const modal = cmdPalette.instance.modal;
					const uninstall = around(modal, {
						onClose(old) {
							return function () {
								const result = old.apply(this);
								uninstall();
								send('focus', {});
								return result;
							};
						}
					});
					modal.open();
				}
				break;
			}
			case 'open-rename-extension': {
				if (data.context === codeContext) {
					onOpenRenameExtension?.();
				}
				break;
			}
			case 'return-to-default-view': {
				if (data.context === codeContext) {
					const file = plugin.app.vault.getFileByPath(codeContext);
					if (!file) break;
					const leaf = plugin.app.workspace
						.getLeavesOfType('code-editor')
						.find(
							(l) =>
								l.view instanceof CodeEditorView &&
								l.view.file?.path === codeContext
						);
					if (leaf) {
						await leaf.openFile(file);
					}
				}
				break;
			}
			case 'format-diff-available': {
				if (data.context === codeContext) {
					onFormatDiff?.();
				}
				break;
			}
			case 'format-diff-reverted': {
				if (data.context === codeContext) {
					onFormatDiffReverted?.();
				}
				break;
			}
			case 'change': {
				if (data.context === codeContext) {
					if (value !== data.value) {
						value = data.value as string;
						onChange?.();
					}
				}
				break;
			}
			case 'save-document': {
				if (data.context === codeContext) {
					onSave?.();
				}
				break;
			}
			case 'word-wrap-toggled': {
				if (data.context === codeContext) {
					plugin.settings.wordWrap = data.wordWrap as 'on' | 'off';
					await plugin.saveSettings();
				}
				break;
			}
			case 'open-file': {
				if (data.context === codeContext) {
					const vaultPath = data.path as string;
					const position = data.position as {
						lineNumber: number;
						column: number;
					} | null;
					const file = plugin.app.vault.getFileByPath(vaultPath);
					if (!file) break;

					// Look for an existing leaf in the main editor area (no sidebars, no popout windows)
					const existingLeaf = plugin.app.workspace
						.getLeavesOfType('code-editor')
						.find((l) => {
							// Must be in the main window
							if (l.view.containerEl.win !== window) return false;
							// Must be in the root split (editor area), not left/right sidebar
							const root = plugin.app.workspace.rootSplit;
							let el: Element | null = l.containerEl;
							while (el && el !== root.containerEl) el = el.parentElement;
							if (!el) return false;
							// File must match
							return (
								l.view instanceof CodeEditorView &&
								l.view.file?.path === vaultPath
							);
						});

					const leaf = existingLeaf ?? plugin.app.workspace.getLeaf('tab');
					if (!existingLeaf) await leaf.openFile(file);
					plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

					if (position) {
						// Wait for Monaco to mount in new tabs.
						// Code smell: 150ms is an empirical delay to ensure Monaco is ready
						// to receive the 'scroll-to-position' command after it is opened in a new tab.
						setTimeout(
							() => {
								if (
									leaf.view instanceof CodeEditorView &&
									leaf.view.editor
								) {
									leaf.view.editor.send('scroll-to-position', {
										position
									});
								}
							},
							existingLeaf ? 0 : 150
						);
					}
				}
				break;
			}
			default:
				break;
		}
	};

	// Register the message listener on the correct window (supports popout windows)
	win.addEventListener('message', onMessage);

	// Clears the editor content and resets the internal value cache.
	const clear = (): void => {
		send('change-value', { value: '' });
		value = '';
	};

	// Updates the editor content and keeps the internal cache in sync.
	const setValue = (newValue: string): void => {
		value = newValue;
		send('change-value', { value: newValue });
	};

	// Returns the last known editor content (synced on every 'change' message).
	const getValue = (): string => value;

	const destroy = (): void => {
		win.removeEventListener('message', onMessage);
		// Revoke the blob URL to free memory — the iframe HTML is no longer needed after close
		URL.revokeObjectURL(blobUrl);
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
