import type { App } from 'obsidian';
import type { MyPluginSettings } from './types.ts';
import { viewType } from './types.ts';
import { getAllMonacoExtensions } from './getLanguage.ts';
import type { CodeEditorView } from './codeEditorView.ts';

export function getActiveExtensions(settings: MyPluginSettings): string[] {
	if (settings.allExtensions) {
		return [
			...getAllMonacoExtensions(settings.excludedExtensions),
			...settings.extraExtensions
		];
	}
	return settings.extensions;
}

export function addExtension(settings: MyPluginSettings, ext: string): void {
	if (settings.allExtensions) {
		if (!settings.extraExtensions.includes(ext)) settings.extraExtensions.push(ext);
	} else {
		if (!settings.extensions.includes(ext)) settings.extensions.push(ext);
	}
}

export function removeExtension(settings: MyPluginSettings, ext: string): void {
	if (settings.allExtensions) {
		const idx = settings.extraExtensions.indexOf(ext);
		if (idx !== -1) {
			settings.extraExtensions.splice(idx, 1);
		} else if (!settings.excludedExtensions.includes(ext)) {
			settings.excludedExtensions.push(ext);
		}
	} else {
		const idx = settings.extensions.indexOf(ext);
		if (idx !== -1) settings.extensions.splice(idx, 1);
	}
}

export function isCodeFilesExtension(app: App, ext: string): boolean {
	return app.viewRegistry.typeByExtension[ext] === viewType;
}

export function getCodeEditorViews(app: App): CodeEditorView[] {
	return app.workspace.getLeavesOfType(viewType).map((l) => l.view as CodeEditorView);
}
