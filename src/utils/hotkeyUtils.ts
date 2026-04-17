/**
 * Utility functions for reading and managing Obsidian hotkeys.
 * Used to sync Obsidian's native shortcuts (command palette, settings, delete file)
 * with Monaco editor instances running in isolated iframes.
 */
import type { App } from 'obsidian';

export interface HotkeyConfig {
	modifiers: string[];
	key: string;
}

/**
 * Reads the configured hotkey for a given Obsidian command.
 * Checks custom user hotkeys first, then falls back to command defaults.
 *
 * @param app - The Obsidian app instance
 * @param commandId - The command ID (e.g. 'app:open-settings', 'command-palette:open')
 * @returns Hotkey config with modifiers and key, or null if not found
 */
export function getObsidianHotkey(
	app: App,
	commandId: string
): HotkeyConfig | null {
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
		modifiers: ['Ctrl'],
		key: 'Delete'
	};
	return JSON.stringify({ settingsHotkey, paletteHotkey, deleteFileHotkey });
}
