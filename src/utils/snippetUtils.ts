import type { App } from 'obsidian';

/** Checks if a snippet exists in the vault */
export function snippetExists(app: App, name: string): boolean {
	return app.customCss.snippets.includes(name);
}

/** Checks if a snippet is currently enabled */
export function isSnippetEnabled(app: App, name: string): boolean {
	return app.customCss.enabledSnippets.has(name);
}
