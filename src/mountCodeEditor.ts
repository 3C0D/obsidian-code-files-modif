import type CodeFilesPlugin from './main.ts';
import type { CodeEditorInstance } from './types.ts';

export const mountCodeEditor = (
	plugin: CodeFilesPlugin,
	language: string,
	initialValue: string,
	codeContext: string,
	onChange?: () => void
): CodeEditorInstance => {
	let value = initialValue;
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
		iframe?.contentWindow?.postMessage(
			{
				type,
				...payload
			},
			'*'
		);
	};

	window.addEventListener('message', ({ data }: MessageEvent): void => {
		switch (data.type) {
			case 'ready': {
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
				if (data.context === codeContext) {
					// console.log("!change event", data.value, data.context);
					value = data.value;
					onChange?.();
				} else {
					// console.log("!change event", data.value, data.context, "ignored!!!!!!!!!!!!");
				}
				// this.requestSave();
				break;
			}
			default:
				break;
		}
	});

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
