import path from 'path';
import { copyFile } from 'fs/promises';
import { cp } from 'fs/promises';

export async function copyMonacoAssets(
	pluginDir: string,
	buildPath: string
): Promise<void> {
	// Monaco core
	await cp(
		path.join(pluginDir, 'node_modules/monaco-editor/min/vs'),
		path.join(buildPath, 'vs'),
		{ recursive: true }
	);
	// Codicons font (CSP blocks data: sources in child iframes)
	await copyFile(
		path.join(
			pluginDir,
			'node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.ttf'
		),
		path.join(buildPath, 'vs/editor/codicon.ttf')
	);
	// Monaco themes
	await cp(
		path.join(pluginDir, 'node_modules/monaco-themes/themes'),
		path.join(buildPath, 'monaco-themes'),
		{ recursive: true }
	);
}

export async function copyEditorFiles(
	pluginDir: string,
	buildPath: string
): Promise<void> {
	const files: [string, string][] = [
		['src/editor/monacoEditor.html', 'monacoEditor.html'],
		['src/editor/monacoHtml.js', 'monacoHtml.js'],
		['src/editor/monacoFormatters.js', 'monacoFormatters.js'],
		['src/editor/monacoDiff.js', 'monacoDiff.js'],
		['src/editor/monacoActions.js', 'monacoActions.js'],
		['src/editor/monacoHtml.css', 'monacoHtml.css']
	];
	for (const [src, dest] of files) {
		await copyFile(path.join(pluginDir, src), path.join(buildPath, dest));
	}
}
