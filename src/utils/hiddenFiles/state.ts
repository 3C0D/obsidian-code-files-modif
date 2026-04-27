import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type CodeFilesPlugin from '../../main.ts';
import type { DataAdapterWithInternal } from '../../types/types.ts';

/**
 * Global flag used to temporarily bypass the deletion patch.
 * Set to true when the user explicitly chooses
 * to hide a previously revealed file.
 */

export let _bypassPatch = false;

/**
 * Sets the bypass patch flag.
 * @param value - The value to set.
 */
export function setBypassPatch(value: boolean): void {
	_bypassPatch = value;
}

/**
 * Retrieves the platform-specific data adapter
 * @param plugin - The plugin instance.
 * @returns The platform-specific data adapter.
 */
export function getAdapter(plugin: CodeFilesPlugin): DataAdapterWithInternal {
	return getDataAdapterEx(plugin.app) as unknown as DataAdapterWithInternal;
}
