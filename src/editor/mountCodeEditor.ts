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

/** Creates a Monaco Editor instance inside an iframe, communicating with it via postMessage.
 *  Returns a control object to get/set the editor value and manage its lifecycle.
 *
 *  Why an iframe?
 *  Monaco requires a full browser environment and conflicts with Obsidian's DOM if loaded directly.
 *  An iframe provides isolation while postMessage handles bidirectional communication.
 *
 *  Why async + fetch + blob URL?
 *  - getResourcePath() returns an app:// URL with a cache-busting timestamp (?1234...).
 *    This timestamp breaks relative paths like ./vs/loader.js inside the HTML.
 *  - file:// URLs are blocked by Electron.
 *  - Solution: fetch the HTML, patch the ./vs paths to absolute app:// URLs (timestamp stripped),
 *    inline the Monaco CSS (Obsidian's CSP blocks external <link> stylesheets in child frames),
 *    then inject via a blob URL which is not subject to the parent CSP for its own inline content.
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

	/** Loads TypeScript/JavaScript files from the project root and sends them to Monaco.
	 *  Monaco needs the source code to provide IntelliSense and cross-file navigation.
	 *  Called once when the editor initializes (on 'ready' message). */
	async function loadProjectFiles(
		send: (type: string, payload: Record<string, unknown>) => void
	): Promise<void> {
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

	const res = (name: string): string =>
		plugin.app.vault.adapter.getResourcePath(
			normalizePath(`${pluginBase}/${name}`)
		);

	const htmlUrl = res('monacoEditor.html');
	const vsBase = res('vs').replace(/\?.*$/, '');
	const configJsUrl = res('monacoHtml.js');
	const configCssUrl = res('monacoHtml.css');
	const prettierBase = res('prettier-standalone.js');
	const prettierMarkdownUrl = res('prettier-markdown.js');
	const prettierEstreeUrl = res('prettier-estree.js');
	const prettierTypescriptUrl = res('prettier-typescript.js');
	const prettierBabelUrl = res('prettier-babel.js');
	const prettierPostcssUrl = res('prettier-postcss.js');
	const prettierHtmlUrl = res('prettier-html.js');
	const prettierYamlUrl = res('prettier-yaml.js');
	const prettierGraphqlUrl = res('prettier-graphql.js');
	const mermaidFormatterUrl = res('mermaid-formatter.js');

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
		noSemanticValidation: !plugin.settings.semanticValidation,
		noSyntaxValidation: !plugin.settings.syntaxValidation,
		projectRootFolder: plugin.settings.projectRootFolder
	};
	// Check if this is an unregistered extension
	const extMatch = codeContext.match(/\.([^.]+)$/);
	const extension = extMatch ? extMatch[1] : '';
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
	cssText = cssText.replace(
		/(@font-face\s*\{[^}]*src:[^;]*)(url\([^)]+\)\s*format\(["']truetype["']\))/g,
		`$1url('${codiconFontUrl}') format('truetype')`
	);
	// Fetch and inline the monacoHtml.css config
	const configCssText = await (await fetch(configCssUrl)).text();
	// Inject CSS inline and intercept dynamic <link> insertions Monaco attempts at runtime.
	// Without this, Monaco tries to inject a <link rel="stylesheet"> which the parent CSP blocks.
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
	const blob = new Blob([html], { type: 'text/html' });
	const blobUrl = URL.createObjectURL(blob);
	iframe.src = blobUrl;

	const send = (type: string, payload: Record<string, unknown>): void => {
		iframe.contentWindow?.postMessage({ type, ...payload }, '*');
	};

	const onMessage = async ({ data, source }: MessageEvent): Promise<void> => {
		// Reject messages not originating from this specific iframe — guards against
		// other Monaco instances or third-party postMessage calls hitting this handler.
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
					const modal = new ChooseThemeModal(plugin, applyTheme, applyTheme);
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
					const file = plugin.app.vault.getAbstractFileByPath(codeContext);
					if (file instanceof TFile) {
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
					const file = plugin.app.vault.getAbstractFileByPath(codeContext);
					if (file instanceof TFile) {
						const modal = new RenameExtensionModal(plugin, file);
						const origOnClose = modal.onClose.bind(modal);
						modal.onClose = () => {
							origOnClose();
							iframe.focus();
						};
						modal.open();
					}
				}
				break;
			}
			case 'return-to-default-view': {
				if (data.context === codeContext) {
					const file = plugin.app.vault.getAbstractFileByPath(codeContext);
					if (file instanceof TFile) {
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
				// Filter by codeContext to avoid processing changes from other open editors.
				// Each iframe sends its own context string so messages don't cross-contaminate.
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
				const file = plugin.app.vault.getAbstractFileByPath(vaultPath);
				if (!(file instanceof TFile)) break;

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
								if (leaf.view instanceof CodeEditorView && leaf.view.editor) {
									leaf.view.editor.send('scroll-to-position', { position });
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

	const clear = (): void => {
		send('change-value', { value: '' });
		value = '';
	};

	const setValue = (newValue: string): void => {
		value = newValue;
		send('change-value', { value: newValue });
	};

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
