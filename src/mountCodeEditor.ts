import type { TFile } from 'obsidian';
import type CodeFilesPlugin from './main.ts';
import type { CodeEditorInstance } from './types.ts';
import manifest from '../manifest.json' with { type: 'json' };
import { registerAndPersistLanguages } from './getLanguage.ts';

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
	onChange?: () => void
): Promise<CodeEditorInstance> => {
	let value = initialValue;
	// Determine default theme: 'vs-dark' if Obsidian is in dark mode, 'vs' otherwise
	const defaultTheme = document.body.classList.contains('theme-dark')
		? 'vs-dark'
		: 'vs';
	const theme =
		plugin.settings.theme === 'default' ? defaultTheme : plugin.settings.theme;

	const initParams: Record<string, string> = {
		context: codeContext,
		lang: language,
		theme,
		folding: plugin.settings.folding ? 'true' : 'false',
		lineNumbers: plugin.settings.lineNumbers ? 'on' : 'off',
		minimap: plugin.settings.minimap ? 'true' : 'false',
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
	if (plugin.settings.overwriteBg) {
		initParams.background = 'transparent';
	}
	if (plugin.settings.formatterConfigs?.[language]) {
		initParams.formatterConfig = plugin.settings.formatterConfigs[language];
	}

	const iframe: HTMLIFrameElement = document.createElement('iframe');
	iframe.style.width = '100%';
	iframe.style.height = '100%';

	const pluginBase = `${plugin.app.vault.configDir}/plugins/${manifest.id}`;
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
	// Remove @font-face rules — Obsidian's CSP blocks data: and blob: font sources in child frames.
	// Monaco degrades gracefully to system monospace fonts.
	cssText = cssText.replace(/@font-face\s*\{[^}]*\}/g, '');
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
					const { FormatterConfigModal } =
						await import('./formatterConfigModal.ts');
					const ext = codeContext.split('.').pop() ?? '';
					new FormatterConfigModal(plugin, ext).open();
				}
				break;
			}
			case 'open-rename-extension': {
				if (data.context === codeContext) {
					const file = plugin.app.vault.getAbstractFileByPath(codeContext);
					if (file && 'extension' in file) {
						const { RenameExtensionModal } =
							await import('./renameExtensionModal.ts');
						new RenameExtensionModal(plugin, file as TFile).open();
					}
				}
				break;
			}
			case 'change': {
				// Filter by codeContext to avoid processing changes from other open editors.
				// Each iframe sends its own context string so messages don't cross-contaminate.
				if (data.context === codeContext) {
					value = data.value;
					onChange?.();
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
