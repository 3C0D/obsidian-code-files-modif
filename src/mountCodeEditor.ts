import type { TFile } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import type { CodeEditorInstance } from './types.ts';
import { DEFAULT_FORMATTER_CONFIG } from './types.ts';
import manifest from '../manifest.json' with { type: 'json' };
import { registerAndPersistLanguages } from './getLanguage.ts';
import { ChooseThemeModal } from './chooseThemeModal.ts';
import { RenameExtensionModal } from './renameExtensionModal.ts';
import { EditorSettingsModal } from './editorSettingsModal.ts';

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
export const resolveThemeParams = async (
	plugin: CodeFilesPlugin,
	theme: string
): Promise<{ theme: string; themeData?: string }> => {
	const builtins = ['vs', 'vs-dark', 'hc-black', 'hc-light', 'default'];
	const pluginBase = `${plugin.app.vault.configDir}/plugins/${manifest.id}`;
	const resolvedTheme =
		theme === 'default'
			? document.body.classList.contains('theme-dark')
				? 'vs-dark'
				: 'vs'
			: theme;
	const safeThemeId = resolvedTheme.replace(/[^a-z0-9\-]/gi, '-');
	let themeData: string | undefined;
	if (!builtins.includes(theme)) {
		try {
			const url = plugin.app.vault.adapter
				.getResourcePath(`${pluginBase}/monaco-themes/${theme}.json`)
				.replace(/\?.*$/, '');
			themeData = JSON.stringify(await (await fetch(url)).json());
		} catch (e) {
			console.warn(`code-files: theme "${theme}" not found`, e);
		}
	}
	return { theme: safeThemeId, themeData };
};

export const mountCodeEditor = async (
	plugin: CodeFilesPlugin,
	language: string,
	initialValue: string,
	codeContext: string,
	onChange?: () => void,
	onSave?: () => void
): Promise<CodeEditorInstance> => {
	let value = initialValue;
	// Determine default theme: 'vs-dark' if Obsidian is in dark mode, 'vs' otherwise
	const defaultTheme = document.body.classList.contains('theme-dark')
		? 'vs-dark'
		: 'vs';
	const theme =
		plugin.settings.theme === 'default' ? defaultTheme : plugin.settings.theme;

	const pluginBase = `${plugin.app.vault.configDir}/plugins/${manifest.id}`;

	const initParams: Record<string, string | boolean> = {
		context: codeContext,
		lang: language,
		theme: theme.replace(/[^a-z0-9\-]/gi, '-'),
		folding: plugin.settings.folding,
		lineNumbers: plugin.settings.lineNumbers ? 'on' : 'off',
		minimap: plugin.settings.minimap,
		wordWrap: plugin.settings.wordWrap,
		javascriptDefaults: 'true',
		typescriptDefaults: 'true',
		// Validation checks use negation (_No): if validation is disabled, send 'true'
		javascriptDefaultsNoSemanticValidation: !plugin.settings.semanticValidation
			? 'true'
			: 'false',
		typescriptDefaultsNoSemanticValidation: !plugin.settings.semanticValidation
			? 'true'
			: 'false',
		javascriptDefaultsNoSyntaxValidation: !plugin.settings.syntaxValidation
			? 'true'
			: 'false',
		typescriptDefaultsNoSyntaxValidation: !plugin.settings.syntaxValidation
			? 'true'
			: 'false'
	};
	if (!['vs', 'vs-dark', 'hc-black', 'hc-light', 'default'].includes(theme)) {
		try {
			const url = plugin.app.vault.adapter
				.getResourcePath(`${pluginBase}/monaco-themes/${theme}.json`)
				.replace(/\?.*$/, '');
			initParams.themeData = JSON.stringify(await (await fetch(url)).json());
		} catch (e) {
			console.warn(`code-files: theme "${theme}" not found`, e);
		}
	}

	if (plugin.settings.theme === 'default') {
		initParams.background = 'transparent';
	}
	const extMatch = codeContext.match(/\.([^.]+)$/);
	const extension = extMatch ? extMatch[1] : '';
	initParams.formatterConfig = plugin.settings.formatterConfigs?.[extension] ?? DEFAULT_FORMATTER_CONFIG;

	const iframe: HTMLIFrameElement = document.createElement('iframe');
	iframe.style.width = '100%';
	iframe.style.height = '100%';

	// getResourcePath returns app://...?timestamp — the timestamp must be stripped
	// before using the URL as a base for relative paths inside the HTML
	const htmlUrl = plugin.app.vault.adapter.getResourcePath(
		`${pluginBase}/monacoEditor.html`
	);
	const vsBase = plugin.app.vault.adapter
		.getResourcePath(`${pluginBase}/vs`)
		.replace(/\?.*$/, '');

	let html = await (await fetch(htmlUrl)).text();
	// Patch relative ./vs paths to absolute app:// URLs so Monaco can load its workers and modules
	html = html
		.replace("'./vs'", `'${vsBase}'`)
		.replace('"./vs/loader.js"', `"${vsBase}/loader.js"`);

	const cssUrl = `${vsBase}/editor/editor.main.css`;
	let cssText = await (await fetch(cssUrl)).text();
	// Replace the base64-encoded font source in @font-face with an absolute app:// URL.
	// Obsidian's CSP blocks data: font sources in child frames, but app:// URLs are allowed.
	const codiconFontUrl = `${vsBase}/editor/codicon.ttf`;
	cssText = cssText.replace(
		/(@font-face\s*\{[^}]*src:[^;]*)(url\([^)]+\)\s*format\(["']truetype["']\))/g,
		`$1url('${codiconFontUrl}') format('truetype')`
	);
	// Inject CSS inline and intercept dynamic <link> insertions Monaco attempts at runtime.
	// Without this, Monaco tries to inject a <link rel="stylesheet"> which the parent CSP blocks.
	html = html.replace(
		'</head>',
		`<style>${cssText}</style>
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

	const onMessage = async ({ data }: MessageEvent): Promise<void> => {
		switch (data.type) {
			case 'ready': {
				// Monaco is loaded — send config, request language map, then set initial content.
				// Order matters: init must come before change-value so the editor exists when value arrives.
				send('init', initParams);
				send('get-languages', {});
				send('change-value', { value });
				break;
			}
			case 'languages': {
				// Received the full Monaco language→extension map.
				// registerAndPersistLanguages is a no-op after the first call (guards on dynamicMap.size).
				await registerAndPersistLanguages(data.langs, plugin);
				break;
			}
			case 'open-formatter-config': {
				if (data.context === codeContext) {
					(document.activeElement as HTMLElement)?.blur();
					const ext = codeContext.split('.').pop() ?? '';
					const modal = new EditorSettingsModal(plugin, ext, () => plugin.broadcastOptions(), (config) => {
						send('change-formatter-config', { config });
					});
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
					(document.activeElement as HTMLElement)?.blur();
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
					(document.activeElement as HTMLElement)?.blur();
					plugin.app.setting.open();
				}
				break;
			}
			case 'open-obsidian-palette': {
				if (data.context === codeContext) {
					(document.activeElement as HTMLElement)?.blur();
					plugin.app.commands.executeCommandById('command-palette:open');
				}
				break;
			}
			case 'open-rename-extension': {
				if (data.context === codeContext) {
					(document.activeElement as HTMLElement)?.blur();
					const file = plugin.app.vault.getAbstractFileByPath(codeContext);
					if (file && 'extension' in file) {
						const modal = new RenameExtensionModal(plugin, file as TFile);
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
