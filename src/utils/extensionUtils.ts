/**
 * Extension management utilities.
 * Handles two modes: manual (user-curated list) and extended (all Monaco extensions minus exclusions).
 * Provides functions to add/remove extensions, register/unregister with Obsidian,
 * and diff-based reregistration to avoid redundant registry calls.
 */
import type { App } from 'obsidian';
import type { MyPluginSettings } from '../types/types.ts';
import { viewType } from '../types/types.ts';
import { getAllMonacoExtensions } from './getLanguage.ts';
import type { CodeEditorView } from '../editor/codeEditorView.ts';
import type CodeFilesPlugin from '../main.ts';

/**
 * Returns the list of extensions currently handled
 * by the plugin, depending on the active mode:
 * - Manual: user-curated `extensions[]`
 * - Extended: all Monaco extensions minus excluded,
 *   plus any extras the user added.
 * Uses Set to guarantee uniqueness.
 */
export function getActiveExtensions(settings: MyPluginSettings): string[] {
	if (settings.allExtensions) {
		return [
			...new Set([
				...getAllMonacoExtensions(settings.excludedExtensions),
				...settings.extraExtensions
			])
		];
	}
	return [...new Set(settings.extensions)];
}

/**
 * Adds an extension to all relevant lists to maintain consistency
 * across manual and extended modes.
 * Uses Set to prevent duplicates.
 */
export function addExtension(settings: MyPluginSettings, ext: string): void {
	// Add to both main lists
	settings.extensions = [...new Set([...settings.extensions, ext])];
	settings.extraExtensions = [...new Set([...settings.extraExtensions, ext])];

	// Remove from excluded if present
	const excluded = new Set(settings.excludedExtensions);
	excluded.delete(ext);
	settings.excludedExtensions = [...excluded];
}

/**
 * Removes an extension from all relevant lists to maintain consistency
 * across manual and extended modes.
 * Uses Set to prevent duplicates.
 */
export function removeExtension(settings: MyPluginSettings, ext: string): void {
	// Remove from both main lists
	const exts = new Set(settings.extensions);
	exts.delete(ext);
	settings.extensions = [...exts];

	const extras = new Set(settings.extraExtensions);
	extras.delete(ext);
	settings.extraExtensions = [...extras];

	// Add to excluded list (for extended mode)
	settings.excludedExtensions = [...new Set([...settings.excludedExtensions, ext])];
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
