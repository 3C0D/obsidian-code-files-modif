/**
 * Extension management utilities.
 * Handles two modes: manual (user-curated list) and extended (all Monaco extensions minus exclusions).
 * Provides functions to add/remove extensions, register/unregister with Obsidian,
 * and diff-based reregistration to avoid redundant registry calls.
 */
import type { App } from 'obsidian';
import type { MyPluginSettings } from '../types/index.ts';
import { viewType, OBSIDIAN_NATIVE_EXTENSIONS } from '../types/index.ts';
import { staticMap } from './getLanguage.ts';
import type { CodeEditorView } from '../editor/codeEditorView/index.ts';
import type CodeFilesPlugin from '../main.ts';
import { getExtension } from './fileUtils.ts';

/**
 * Returns all known code extensions from staticMap.
 *
 * @returns An array of all known code extensions.
 * */
export function getAllMonacoExtensions(): string[] {
	return Object.keys(staticMap);
}

/**
 * Unified logic: (extensions + extraExtensions) - excludedExtensions
 * Works the same way in both manual and extended modes.
 * Uses Set to guarantee uniqueness.
 *
 * @param settings - The plugin settings object
 * @returns An array of active extensions.
 */
export function getActiveExtensions(settings: MyPluginSettings): string[] {
	const base = new Set([...settings.extensions, ...settings.extraExtensions]);
	const excluded = new Set(settings.excludedExtensions);
	return [...base].filter((ext) => !excluded.has(ext));
}

/**
 * Adds an extension to the active list.
 * Unified logic for both manual and extended modes:
 * - Remove from excludedExtensions if present
 * - Add to extraExtensions only if not already in base extensions
 *
 * @param settings - The plugin settings object
 * @param ext - The extension to add (e.g. "js", "ts")
 * @returns true if the extension was added, false if blocked (empty, native or already registered)
 */
export function addExtension(settings: MyPluginSettings, ext: string): boolean {
	// Block empty string
	if (!ext) {
		console.warn('code-files: cannot add empty extension');
		return false;
	}
	// Block native extensions
	if (OBSIDIAN_NATIVE_EXTENSIONS.includes(ext)) {
		// console.warn(`code-files: cannot add "${ext}" - native Obsidian extension`);
		return false;
	}

	// Block already registered extensions
	if (getActiveExtensions(settings).includes(ext)) {
		// console.warn(`code-files: cannot add "${ext}" - already registered`);
		return false;
	}

	// Remove from excludedExtensions if present
	settings.excludedExtensions = settings.excludedExtensions.filter((e) => e !== ext);

	// Add to extraExtensions only if not already in base extensions
	if (!settings.extensions.includes(ext)) {
		settings.extraExtensions = [...settings.extraExtensions, ext];
	}

	return true;
}

/**
 * Removes an extension from the active list.
 * Unified logic for both manual and extended modes:
 * - If in extraExtensions, just remove it — no need to exclude
 * - If in base extensions, must add to excludedExtensions to override
 *
 * @param settings - The plugin settings object
 * @param ext - The extension to remove (e.g. "js", "ts")
 */
export function removeExtension(settings: MyPluginSettings, ext: string): void {
	// If in extraExtensions, just remove it — no need to exclude
	if (settings.extraExtensions.includes(ext)) {
		settings.extraExtensions = settings.extraExtensions.filter((e) => e !== ext);
		return;
	}
	// If in base extensions, must add to excludedExtensions to override
	settings.excludedExtensions = [...settings.excludedExtensions, ext];
}

// Not used
/**
 * Checks if an extension is handled by CodeFilesPlugin.
 *
 * @param app - The Obsidian app instance
 * @param ext - The extension to check (e.g. "js", "ts")
 * @returns true if the extension is handled by CodeFilesPlugin, false otherwise
 * */
export function isCodeFilesExtension(app: App, ext: string): boolean {
	return app.viewRegistry.typeByExtension[ext] === viewType;
}

/**
 * Gets all currently open CodeEditorView instances.
 *
 * @param app - The Obsidian app instance
 * @returns An array of open CodeEditorView instances
 */
export function getCodeEditorViews(app: App): CodeEditorView[] {
	return app.workspace.getLeavesOfType(viewType).map((l) => l.view as CodeEditorView);
}

/**
 * Guards against registering an extension already claimed by another view type.
 *
 * @param plugin - The CodeFilesPlugin instance
 * @param ext - The extension to register (e.g. "js", "ts")
 */
export function registerExtension(plugin: CodeFilesPlugin, ext: string): void {
	if (!plugin.app.viewRegistry.getTypeByExtension(ext)) {
		try {
			plugin.registerExtensions([ext], viewType);
		} catch (e) {
			console.warn(`code-files: could not register extension "${ext}":`, e);
		}
	}
}

/**
 * Unregisters the extension from Obsidian's view registry and closes any open Monaco
 * leaves for that extension. Keeping them open after unregistration would leave stale
 * editors with no valid save path.
 *
 * @param plugin - The CodeFilesPlugin instance
 * @param ext - The extension to unregister (e.g. "js", "ts")
 */
export function unregisterExtension(plugin: CodeFilesPlugin, ext: string): void {
	try {
		plugin.app.viewRegistry.unregisterExtensions([ext]);
		plugin.app.workspace.getLeavesOfType(viewType).forEach((leaf) => {
			const view = leaf.view as CodeEditorView;
			if (view.file && getExtension(view.file.name) === ext) leaf.detach();
		});
	} catch (e) {
		console.warn(`code-files: could not unregister extension "${ext}":`, e);
	}
}

/**
 * Resyncs `_registeredExts` to match the current active extensions.
 * Must be called after any direct add/remove that bypasses `reregisterExtensions`,
 * otherwise the diff on the next reregister will be wrong.
 *
 * @param plugin - The CodeFilesPlugin instance
 */
export function syncRegisteredExts(plugin: CodeFilesPlugin): void {
	plugin._registeredExts = new Set(getActiveExtensions(plugin.settings));
}

/**
 * Diffs the current active extensions against the last registered snapshot (`_registeredExts`)
 * to add/remove only what changed — avoids redundant registry calls on every settings save.
 *
 * @param plugin - The CodeFilesPlugin instance
 * @returns A Promise that resolves when the extensions have been re-registered
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
 *
 * @param plugin - The CodeFilesPlugin instance
 */
export function initExtensions(plugin: CodeFilesPlugin): void {
	const activeExts = getActiveExtensions(plugin.settings);
	for (const ext of activeExts) {
		registerExtension(plugin, ext);
	}
	plugin._registeredExts = new Set(activeExts);
}
