/**
 * Creates and manages a Monaco Editor instance inside an isolated iframe.
 * Handles bidirectional postMessage communication (init, change-value, change-theme, etc.),
 * local Monaco loading (fetch HTML, patch ./vs paths to app://, inline CSS),
 * and works around Obsidian's CSP constraints (blob URL, appendChild interception, @font-face patching).
 * Returns a CodeEditorInstance with send(), getValue(), setValue(), destroy().
 */
import { normalizePath, TFile } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { type CodeEditorInstance } from '../types/types.ts';
import manifest from '../../manifest.json' with { type: 'json' };

import { buildMergedConfig } from '../utils/settingsUtils.ts';
import { getActiveExtensions } from '../utils/extensionUtils.ts';
import { broadcastOptions } from '../utils/broadcast.ts';
import { ChooseThemeModal } from '../modals/chooseThemeModal.ts';
import { RenameExtensionModal } from '../modals/renameExtensionModal.ts';
import { EditorSettingsModal } from '../modals/editorSettingsModal.ts';
import { CodeEditorView } from './codeEditorView.ts';

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
 * @returns A CodeEditorInstance with methods to control the editor (send, getValue, setValue, destroy)
 */
export const mountCodeEditor = async (
	plugin: CodeFilesPlugin,
	language: string,
	initialValue: string,
	codeContext: string,
	onChange?: () => void,
	onSave?: () => void,
	onFormatDiff?: () => void
): Promise<CodeEditorInstance> => {
	let value = initialValue;
	// Determine default theme: 'vs-dark' if Obsidian is in dark mode, 'vs' otherwise
	const defaultTheme = document.body.classList.contains('theme-dark')
		? 'vs-dark'
		: 'vs';
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
	 *               Called once with type 'load-project-files' and payload { files },
	 *               where files is an array of { path, content } objects.
	 */
	async function loadProjectFiles(
		send: (type: string, payload: Record<string, unknown>) => void
	): Promise<void> {
		// relative path
		const root = plugin.settings.projectRootFolder;
		if (!root) return;

		const files: { path: string; content: string }[] = [];
		for (const file of plugin.app.vault.getFiles()) {
			if (!file.path.startsWith(root + '/')) continue;
			if (!['ts', 'tsx', 'js', 'jsx'].includes(file.extension)) continue;
			try {
				files.push({
					path: file.path,
					content: await plugin.app.vault.cachedRead(file)
				});
			} catch {
				/* skip unreadable files */
			}
		}
		send('load-project-files', { files });
	}

	// Resolves a plugin-relative path to an app:// URL.
	// getResourcePath() appends a cache-busting timestamp (?123...) to all URLs.
	// This timestamp is harmless for direct fetch() or <script src> usage,
	// but MUST be stripped when the URL is used as a base path for relative imports
	// (e.g., '${vsBase}/loader.js') because the timestamp breaks path concatenation.
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

	// Disable minimap and line numbers for config editors (modal + settings tab)
	// - editor-settings-config: config editor in the gear icon modal
	// - settings-editor-config: config editor in the plugin settings tab
	// - modal-editor.*: code fence editor modals (keep line numbers, disable minimap only)
	const initParams: Record<string, string | boolean> = {
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
		// Monaco uses negative flags (noSemanticValidation), but settings use positive flags (semanticValidation)
		noSemanticValidation: !plugin.settings.semanticValidation,
		noSyntaxValidation: !plugin.settings.syntaxValidation,
		projectRootFolder: plugin.settings.projectRootFolder
	};
	// find extension for this editor based on codeContext (file path or modal ID as 'settings-editor-config.jsonc')
	const extMatch = codeContext.match(/\.([^.]+)$/);
	const extension = extMatch ? extMatch[1] : '';
	// If the editor is for a file with an extension that doesn't have a registered formatter, set a flag so the Monaco iframe can show a warning and hide formatting options.
	if (extension && !getActiveExtensions(plugin.settings).includes(extension)) {
		initParams.isUnregisteredExtension = true;
	}
	// 'default' excluded here because it's resolved to 'vs' or 'vs-dark' above
	if (!BUILTIN_THEMES.includes(theme) || theme === 'default') {
		const resolved = await resolveThemeParams(plugin, theme);
		if (resolved.themeData) initParams.themeData = resolved.themeData;
	}

	if (plugin.settings.theme === 'default') {
		initParams.background = 'transparent';
	}
	initParams.editorConfig = buildMergedConfig(plugin, extension);

	const iframe: HTMLIFrameElement = document.createElement('iframe');
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
<script src="${configJsUrl}"></script>
<style>${cssText}</style>
<style>${configCssText}</style>
<script>
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
				send('focus', {});
				void loadProjectFiles(send);
				break;
			}
			case 'open-formatter-config': {
				if (data.context === codeContext) {
					// ext from file path or e.g 'settings-editor-config.jsonc
					const ext = codeContext.match(/\.([^./\\]+)$/)?.[1] ?? '';
					const modal = new EditorSettingsModal(
						plugin,
						ext,
						() => broadcastOptions(plugin),
						(config) => {
							send('change-editor-config', { config });
						}
					);
					const origOnClose = modal.onClose.bind(modal);
					modal.onClose = () => {
						origOnClose();
						iframe.focus();
					};
					modal.open();
				}
				break;
			}
			case 'open-theme-picker': {
				if (data.context === codeContext) {
					const applyTheme = async (t: string): Promise<void> => {
						const params = await resolveThemeParams(plugin, t);
						send('change-theme', params);
					};
					const modal = new ChooseThemeModal(plugin, applyTheme);
					const origOnClose = modal.onClose.bind(modal);
					modal.onClose = () => {
						origOnClose();
						iframe.focus();
					};
					modal.open();
				}
				break;
			}
			case 'open-settings': {
				if (data.context === codeContext) {
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
					plugin.app.commands.executeCommandById('command-palette:open');
				}
				break;
			}
			case 'open-rename-extension': {
				if (data.context === codeContext) {
					const file = plugin.app.vault.getFileByPath(codeContext);
					if (!file) break;
					const modal = new RenameExtensionModal(plugin, file);
					const origOnClose = modal.onClose.bind(modal);
					modal.onClose = () => {
						origOnClose();
						iframe.focus();
					};
					modal.open();
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
						// Wait for Monaco to mount in new tabs (150ms empirical delay)
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

	window.addEventListener('message', onMessage);

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
		window.removeEventListener('message', onMessage);
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
