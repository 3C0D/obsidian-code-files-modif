import type CodeFilesPlugin from './main.ts';
import type { CodeEditorInstance } from './types.ts';
import manifest from '../manifest.json' with { type: 'json' };

/** Creates a Monaco Editor instance inside an iframe, communicating with it via postMessage. Returns a control object to get/set the editor value and manage its lifecycle. */
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

	const iframe: HTMLIFrameElement = document.createElement('iframe');
	iframe.style.width = '100%';
	iframe.style.height = '100%';

	const pluginBase = `${plugin.app.vault.configDir}/plugins/${manifest.id}`;
	const htmlUrl = plugin.app.vault.adapter.getResourcePath(`${pluginBase}/monacoEditor.html`);
	const vsBase = plugin.app.vault.adapter.getResourcePath(`${pluginBase}/vs`).replace(/\?.*$/, '');

	let html = await (await fetch(htmlUrl)).text();
	html = html
		.replace("'./vs'", `'${vsBase}'`)
		.replace('"./vs/loader.js"', `"${vsBase}/loader.js"`);

	const cssUrl = `${vsBase}/editor/editor.main.css`;
	let cssText = await (await fetch(cssUrl)).text();
	// Remove @font-face rules entirely — Obsidian's CSP blocks all font loading (data:, blob:)
	// Monaco falls back to system fonts gracefully
	cssText = cssText.replace(/@font-face\s*\{[^}]*\}/g, '');
	html = html.replace('</head>', `<style>${cssText}</style>
<script>
const _orig = Element.prototype.appendChild;
Element.prototype.appendChild = function(node) {
    if (node.tagName === 'LINK' && node.rel === 'stylesheet') return node;
    return _orig.call(this, node);
};
</script>
</head>`);
	const blob = new Blob([html], { type: 'text/html' });
	const blobUrl = URL.createObjectURL(blob);
	iframe.src = blobUrl;

	const send = (type: string, payload: Record<string, unknown>): void => {
		// Send a message to the iframe via postMessage (secure cross-origin communication)
		iframe.contentWindow?.postMessage(
			{
				type,
				...payload
			},
			'*'
		);
	};

	const onMessage = ({ data }: MessageEvent): void => {
		// Listen for messages from the iframe and synchronize state
		switch (data.type) {
			case 'ready': {
				// Send init params, then the initial value
				send('init', initParams);
				send('change-value', { value });
				break;
			}
			case 'change': {
				// Synchronize changes from the iframe user input
				// The 'codeContext' check prevents interference from other iframe editors
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

	// The onMessage function is stored so it can be removed during cleanup
	const destroy = (): void => {
		window.removeEventListener('message', onMessage);
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
