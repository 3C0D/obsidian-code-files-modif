import type { App } from 'obsidian';

/** Checks if a snippet exists in the vault */
export function snippetExists(app: App, name: string): boolean {
	return (app.customCss.snippets as string[]).includes(name);
}

/** Checks if a snippet is currently enabled */
export function isSnippetEnabled(app: App, name: string): boolean {
	return (app.customCss.enabledSnippets as Set<string>).has(name);
}
