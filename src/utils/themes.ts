import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';

export let themes: string[] = [];

export async function loadThemes(plugin: CodeFilesPlugin): Promise<void> {
	if (themes.length > 0) return;
	try {
		const pluginBase = normalizePath(
			`${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`
		);
		const themelistPath = normalizePath(`${pluginBase}/monaco-themes/themelist.json`);
		const themelistUrl = plugin.app.vault.adapter.getResourcePath(themelistPath);
		const themelist = await (await fetch(themelistUrl)).json();
		themes = Object.values(themelist);
	} catch (e) {
		console.warn('code-files: failed to load themelist', e);
		themes = [];
	}
}
