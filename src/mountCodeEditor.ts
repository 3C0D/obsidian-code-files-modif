import type CodeFilesPlugin from './main.ts';
import type { CodeEditorInstance } from './types.ts';

/** Creates a Monaco Editor instance inside an iframe, communicating with it via postMessage. Returns a control object to get/set the editor value and manage its lifecycle. */
export const mountCodeEditor = (
	plugin: CodeFilesPlugin,
	language: string,
	initialValue: string,
	codeContext: string,
	onChange?: () => void
): CodeEditorInstance => {
	let value = initialValue;
	// Determine default theme: 'vs-dark' if Obsidian is in dark mode, 'vs' otherwise
	const defaultTheme = document.body.classList.contains('theme-dark')
		? 'vs-dark'
		: 'vs';
	const theme =
		plugin.settings.theme === 'default' ? defaultTheme : plugin.settings.theme;

	const queryParameters = new URLSearchParams();
	queryParameters.append('context', codeContext);
	queryParameters.append('lang', language);
	queryParameters.append('theme', theme);
	if (plugin.settings.overwriteBg) {
		queryParameters.append('background', 'transparent');
	}
	queryParameters.append('folding', plugin.settings.folding ? 'true' : 'false');
	queryParameters.append('lineNumbers', plugin.settings.lineNumbers ? 'on' : 'off');
	queryParameters.append('minimap', plugin.settings.minimap ? 'true' : 'false');
	queryParameters.append('javascriptDefaults', 'true');
	queryParameters.append('typescriptDefaults', 'true');
	// Validation checks use negation (_No): if validation is disabled, send 'true'
	queryParameters.append(
		'javascriptDefaultsNoSemanticValidation',
		!plugin.settings.semanticValidation ? 'true' : 'false'
	);
	queryParameters.append(
		'typescriptDefaultsNoSemanticValidation',
		!plugin.settings.semanticValidation ? 'true' : 'false'
	);
	queryParameters.append(
		'javascriptDefaultsNoSyntaxValidation',
		!plugin.settings.syntaxValidation ? 'true' : 'false'
	);
	queryParameters.append(
		'typescriptDefaultsNoSyntaxValidation',
		!plugin.settings.syntaxValidation ? 'true' : 'false'
	);

	const iframe: HTMLIFrameElement = document.createElement('iframe');
	iframe.src = `https://embeddable-monaco.lukasbach.com?${queryParameters.toString()}`;
	iframe.style.width = '100%';
	iframe.style.height = '100%';

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
				// When the iframe editor is ready, initialize its value and language
				send('change-value', { value });
				send('change-language', {
					language
				});
				if (plugin.settings.overwriteBg) {
					send('change-background', {
						background: 'transparent',
						theme
					});
				}
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
