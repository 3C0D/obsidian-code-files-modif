import type { App } from 'obsidian';

/** Checks if a snippet exists in the vault */
export function snippetExists(app: App, name: string): boolean {
	return app.customCss.snippets.includes(name);
}

/** Checks if a snippet is currently enabled */
export function isSnippetEnabled(app: App, name: string): boolean {
	return app.customCss.enabledSnippets.has(name);
}

/** Registers a listener that syncs the toggle UI when the snippet state changes externally (e.g. from Obsidian settings).
 * 
 * @returns () => void - function to unregister the event listener
 */
export function registerSnippetChangeHandler(
	app: App,
	snippetName: string,
	onStateChange: (isOn: boolean) => void
): () => void {
	const handler = (): void => onStateChange(isSnippetEnabled(app, snippetName));
	app.workspace.on('css-change', handler);
	return () => app.workspace.off('css-change', handler);
}
