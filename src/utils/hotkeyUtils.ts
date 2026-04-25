/**
 * Utility functions for handling Obsidian hotkeys in the context of the Monaco editor.
 *
 * Data Flow Direction:
 * 1. Obsidian -> Logic: getObsidianHotkey() reads shortcuts from Obsidian and returns a HotkeyConfig.
 * 2. UI -> Logic: parseHotkeyOverride() converts user-typed strings (Settings Tab) into a HotkeyConfig.
 * 3. Logic -> UI: formatHotkey() converts a HotkeyConfig back to readable strings for display.
 * 4. Logic -> Comparison: serializeMonacoHotkeys() groups essential shortcuts (Palette, Settings, Delete) into a JSON string to detect configuration changes and trigger editor reloads.
 * 5. Parent -> Monaco: Hotkeys are sent to the Monaco iframe via postMessage (init/update).
 * 6. Monaco -> Parent: When a hotkey is pressed, Monaco sends a message back to trigger the Obsidian action.
 */
import { Platform, type App } from 'obsidian';
import type { HotkeyConfig } from '../types/types.ts';

/**
 * Reads the configured hotkey for a given Obsidian command.
 * Checks custom user hotkeys first, then falls back to command defaults.
 *
 * @param app - The Obsidian app instance
 * @param commandId - The command ID (e.g. 'app:open-settings', 'command-palette:open')
 * @returns Hotkey config with modifiers and key, or null if not found
 */
export function getObsidianHotkey(app: App, commandId: string): HotkeyConfig | null {
	// Check custom hotkeys first (user-defined in settings)
	const custom = app.hotkeyManager.getHotkeys(commandId);
	if (custom && custom.length > 0 && custom[0].modifiers && custom[0].key) {
		const mods = custom[0].modifiers;
		return {
			modifiers: Array.isArray(mods) ? mods : [mods],
			key: custom[0].key
		};
	}
	// Fall back to default command hotkeys
	const cmd = app.commands?.commands?.[commandId];
	if (
		cmd?.hotkeys &&
		cmd.hotkeys.length > 0 &&
		cmd.hotkeys[0].modifiers &&
		cmd.hotkeys[0].key
	) {
		const mods = cmd.hotkeys[0].modifiers;
		return {
			modifiers: Array.isArray(mods) ? mods : [mods],
			key: cmd.hotkeys[0].key
		};
	}
	return null;
}

/**
 * Parses a hotkey override string and returns a HotkeyConfig.
 * Accepts formats: "Ctrl+P", "Ctrl + P", "ctrl+shift+p", "Cmd+P", etc.
 * Normalizes platform-specific modifiers to 'Mod' for cross-platform consistency:
 * - "Ctrl" → "Mod" (Windows/Linux primary modifier)
 * - "Cmd"/"Command"/"Meta" → "Mod" (Mac primary modifier)
 * This matches Obsidian's internal hotkey representation where 'Mod' is used
 * as a cross-platform alias (Ctrl on Windows/Linux, Cmd on Mac).
 * Returns null if invalid.
 * 
 * @param override - The hotkey override string
 * @returns HotkeyConfig if valid, or null if invalid
 */
export function parseHotkeyOverride(override: string): HotkeyConfig | null {
	if (!override || !override.trim()) return null;

	const parts = override
		.trim()
		.split(/[+\s]+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	if (parts.length === 0) return null;

	const modifiers: string[] = [];
	let key = '';

	for (const part of parts) {
		const lower = part.toLowerCase();
		if (
			lower === 'ctrl' ||
			lower === 'cmd' ||
			lower === 'command' ||
			lower === 'meta' ||
			lower === 'mod'
		) {
			modifiers.push('Mod');
		} else if (lower === 'shift') {
			modifiers.push('Shift');
		} else if (lower === 'alt') {
			modifiers.push('Alt');
		} else {
			// Last non-modifier part is assumed to be the key
			key = part;
		}
	}

	if (!key) return null;

	return { modifiers, key };
}

/**
 * Formats a HotkeyConfig as a display string (e.g., "Mod+P").
 *
 * @param config - The hotkey configuration
 * @param resolveMod - If true, replaces 'Mod' with 'Ctrl' or 'Cmd' based on platform
 * @returns Formatted hotkey string
 */
export function formatHotkey(config: HotkeyConfig, resolveMod: boolean = false): string {
	let mods = config.modifiers;
	if (resolveMod) {
		mods = mods.map((m) => (m === 'Mod' ? (Platform.isWin ? 'Ctrl' : 'Cmd') : m));
	}
	return [...mods, config.key].join('+');
}

/**
 * Retrieves all Monaco-relevant hotkeys (settings, palette, delete file)
 * and returns them as a serialized JSON string for change detection.
 *
 * @param app - The Obsidian app instance
 * @returns JSON string of all hotkey configs
 */
export function serializeMonacoHotkeys(app: App): string {
	const settingsHotkey = getObsidianHotkey(app, 'app:open-settings') ?? {
		modifiers: ['Mod'],
		key: ','
	};
	const paletteHotkey = getObsidianHotkey(app, 'command-palette:open') ?? {
		modifiers: ['Mod'],
		key: 'p'
	};
	const deleteFileHotkey = getObsidianHotkey(app, 'app:delete-file') ?? {
		modifiers: ['Mod'],
		key: 'Delete'
	};
	return JSON.stringify({ settingsHotkey, paletteHotkey, deleteFileHotkey });
}
