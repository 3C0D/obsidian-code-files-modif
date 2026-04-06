import type { App } from 'obsidian';
import type { MyPluginSettings } from '../types.ts';
import { viewType } from '../types.ts';
import { getAllMonacoExtensions } from './getLanguage.ts';
import type { CodeEditorView } from '../editor/codeEditorView.ts';
import type CodeFilesPlugin from '../main.ts';

/**
 * Returns the list of extensions currently handled
 * by the plugin, depending on the active mode:
 * - Manual: user-curated `extensions[]`
 * - Extended: all Monaco extensions minus excluded,
 *   plus any extras the user added.
 */
export function getActiveExtensions(settings: MyPluginSettings): string[] {
	if (settings.allExtensions) {
		return [
			...getAllMonacoExtensions(settings.excludedExtensions),
			...settings.extraExtensions
		];
	}
	return settings.extensions;
}

/**
 * Adds an extension to the correct list depending
 * on the active mode (manual vs extended).
 */
export function addExtension(settings: MyPluginSettings, ext: string): void {
	if (settings.allExtensions) {
		if (!settings.extraExtensions.includes(ext)) settings.extraExtensions.push(ext);
	} else {
		if (!settings.extensions.includes(ext)) settings.extensions.push(ext);
	}
}

/**
 * Removes an extension. In extended mode, removing
 * means either dropping it from extras or adding it
 * to the excluded list.
 */
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

/** Guards against registering an extension already claimed by another view type. */
export function registerExtension(plugin: CodeFilesPlugin, ext: string): void {
	if (!plugin.app.viewRegistry.getTypeByExtension(ext)) {
		try {
			plugin.registerExtensions([ext], viewType);
		} catch (e) {
			console.log(`code-files: could not register extension "${ext}":`, e);
		}
	}
}

/**
 * Unregisters the extension from Obsidian's view registry and closes any open Monaco
 * leaves for that extension. Keeping them open after unregistration would leave stale
 * editors with no valid save path.
 */
export function unregisterExtension(plugin: CodeFilesPlugin, ext: string): void {
	try {
		plugin.app.viewRegistry.unregisterExtensions([ext]);
		plugin.app.workspace.getLeavesOfType(viewType).forEach((leaf) => {
			const view = leaf.view as CodeEditorView;
			if (view.file?.extension === ext) leaf.detach();
		});
	} catch (e) {
		console.log(`code-files: could not unregister extension "${ext}":`, e);
	}
}

/**
 * Resyncs `_registeredExts` to match the current active extensions.
 * Must be called after any direct add/remove that bypasses `reregisterExtensions`,
 * otherwise the diff on the next reregister will be wrong.
 */
export function syncRegisteredExts(plugin: CodeFilesPlugin): void {
	plugin._registeredExts = new Set(getActiveExtensions(plugin.settings));
}

/**
 * Diffs the current active extensions against the last registered snapshot (`_registeredExts`)
 * to add/remove only what changed — avoids redundant registry calls on every settings save.
 */
export async function reregisterExtensions(plugin: CodeFilesPlugin): Promise<void> {
	const next = new Set(getActiveExtensions(plugin.settings));
	for (const ext of plugin._registeredExts) {
		if (!next.has(ext)) unregisterExtension(plugin, ext);
	}
	for (const ext of next) {
		if (!plugin._registeredExts.has(ext)) registerExtension(plugin, ext);
	}
	plugin._registeredExts = next;
	await plugin.saveSettings();
}

/**
 * Registers all active extensions with Obsidian on startup.
 * Uses per-extension registration to avoid all-or-nothing
 * failure when a single extension is already claimed by
 * another plugin.
 */
export function initExtensions(plugin: CodeFilesPlugin): void {
	const activeExts = getActiveExtensions(plugin.settings);
	for (const ext of activeExts) {
		registerExtension(plugin, ext);
	}
	plugin._registeredExts = new Set(activeExts);
}
