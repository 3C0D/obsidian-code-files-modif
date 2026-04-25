import type { App } from 'obsidian';

/** Checks if a snippet exists in the vault 
 *
 * @param app - The Obsidian app instance.
 * @param name - The name of the snippet to check.
 * @returns `true` if the snippet exists, `false` otherwise.
 */
export function snippetExists(app: App, name: string): boolean {
	return app.customCss.snippets.includes(name);
}

/** Checks if a snippet is currently enabled 
 *
 * @param app - The Obsidian app instance.
 * @param name - The name of the snippet to check.
 * @returns `true` if the snippet is enabled, `false` otherwise.
 */
export function isSnippetEnabled(app: App, name: string): boolean {
	return app.customCss.enabledSnippets.has(name);
}

/**
 * Registers a listener that syncs the toggle UI when the snippet state 
 * changes externally (e.g. from Obsidian settings).
 *
 * @param app - The Obsidian app instance.
 * @param snippetName - the name of the CSS snippet to watch
 * @param onStateChange - callback fired with the new enabled state whenever the snippet changes
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
