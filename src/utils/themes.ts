import type CodeFilesPlugin from '../main.ts';

export let themes: string[] = [];

export async function loadThemes(plugin: CodeFilesPlugin): Promise<void> {
	if (themes.length > 0) return;
	try {
		const pluginBase = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
		const themelistUrl = plugin.app.vault.adapter
			.getResourcePath(`${pluginBase}/monaco-themes/themelist.json`)
			.replace(/\?.*$/, '');
		const themelist = await (await fetch(themelistUrl)).json();
		themes = Object.values(themelist);
	} catch (e) {
		console.warn('code-files: failed to load themelist', e);
		themes = [];
	}
}
