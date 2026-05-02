// Monaco Editor Actions and Keyboard Handlers
// All custom actions registered in Monaco's context menu and command palette
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Monaco global types don't match AMD-loaded runtime

import type * as Monaco from 'monaco-editor';
import type { InitParams, HotkeyConfig, Prettify } from './types/index.ts';
import { getLastFormat } from './diff.ts';

let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let context: string | null = null;
let formatOnSave = false;
let currentCommandPaletteHotkey: HotkeyConfig | null = null;
let currentSettingsHotkey: HotkeyConfig | null = null;
let currentDeleteFileHotkey: HotkeyConfig | null = null;
let runFormatWithDiff: () => Promise<void>;

/**
 * Sets the shared state for actions module.
 * @param editorInstance - The Monaco editor instance
 * @param ctx - The context identifier for this editor
 * @param formatFn - Function to run formatting with diff tracking
 */
export function setActionsState(
	editorInstance: Monaco.editor.IStandaloneCodeEditor,
	ctx: string,
	formatFn: () => Promise<void>
): void {
	editor = editorInstance;
	context = ctx;
	runFormatWithDiff = formatFn;
}

export function setFormatOnSave(value: boolean): void {
	formatOnSave = value;
}

/**
 * Updates the current hotkey configurations from Obsidian.
 * @param commandPalette - Hotkey config for command palette (Ctrl+P)
 * @param settings - Hotkey config for settings (Ctrl+,)
 * @param deleteFile - Hotkey config for delete file action
 */
export function updateHotkeys(
	commandPalette: HotkeyConfig | null,
	settings: HotkeyConfig | null,
	deleteFile: HotkeyConfig | null
): void {
	currentCommandPaletteHotkey = commandPalette;
	currentSettingsHotkey = settings;
	currentDeleteFileHotkey = deleteFile;
}

/**
 * Registers all Monaco actions and keyboard handlers.
 * @param params - Initialization parameters
 * @param openDiffModal - Function to open the diff modal with original and formatted content
 */
export function registerActions(
	params: Prettify<InitParams>,
	openDiffModal: (orig: string, fmt: string) => void
): void {
	if (!editor) return;

	// Add "Return to Default View" action if this is an unregistered extension
	if (params.isUnregisteredExtension) {
		editor.addAction({
			id: 'code-files-return-to-default-view',
			label: '↩️ Return to Default View',
			contextMenuGroupId: 'code-files',
			contextMenuOrder: 0,
			run: () => {
				window.parent.postMessage(
					{ type: 'return-to-default-view', context },
					'*'
				);
			}
		});
	}

	// Alt+Z toggles word wrap and persists the setting
	editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
		const current = editor!.getRawOptions().wordWrap;
		const next = current === 'on' ? 'off' : 'on';
		editor!.updateOptions({ wordWrap: next });
		window.parent.postMessage(
			{ type: 'word-wrap-toggled', wordWrap: next, context },
			'*'
		);
	});

	editor.addAction({
		id: 'code-files-save',
		label: 'Save',
		keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
		run: () => {
			if (formatOnSave) {
				const formatAction = editor!.getAction('editor.action.formatDocument');
				if (formatAction && formatAction.isSupported()) {
					runFormatWithDiff().then(() => {
						window.parent.postMessage(
							{ type: 'save-document', context },
							'*'
						);
					});
					return;
				}
			}
			window.parent.postMessage({ type: 'save-document', context }, '*');
		}
	});

	// Add "Format Document" action for all file types
	editor.addAction({
		id: 'code-files-format-document',
		label: '📝 Format Document',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 0.5,
		keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
		run: () => {
			runFormatWithDiff();
		}
	});

	// Add "Show Format Diff" action for all file types
	editor.addAction({
		id: 'code-files-show-format-diff-global',
		label: '⟷ Show Format Diff',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 0.6,
		run: () => {
			const { original, formatted } = getLastFormat();
			if (original && formatted) {
				openDiffModal(original, formatted);
			}
		}
	});

	// Add a context menu action in Monaco to open the formatter config for this file
	editor.addAction({
		id: 'code-files-rename-extension',
		label: '🍋🟩 Rename Extension',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 1,
		run: () => {
			window.parent.postMessage({ type: 'open-rename-extension', context }, '*');
		}
	});

	editor.addAction({
		id: 'code-files-change-theme',
		label: '🍒 Change Theme',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 2,
		run: () => {
			window.parent.postMessage({ type: 'open-theme-picker', context }, '*');
		}
	});

	editor.addAction({
		id: 'code-files-formatter-config',
		label: '📐 Formatter Config',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 3,
		run: () => {
			window.parent.postMessage({ type: 'open-formatter-config', context }, '*');
		}
	});

	editor.addAction({
		id: 'code-files-obsidian-settings',
		label: '🔧 Obsidian Settings (Ctrl+,)',
		run: () => {
			window.parent.postMessage({ type: 'open-settings', context }, '*');
		}
	});

	editor.addAction({
		id: 'code-files-obsidian-palette',
		label: '🎹 Obsidian Command Palette (Ctrl+P)',
		run: () => {
			window.parent.postMessage({ type: 'open-obsidian-palette', context }, '*');
		}
	});

	editor.addAction({
		id: 'code-files-delete-file',
		label: '🗑️ Delete File',
		contextMenuGroupId: 'code-files',
		contextMenuOrder: 4,
		run: () => {
			window.parent.postMessage({ type: 'delete-file', context }, '*');
		}
	});

	// Dynamic shortcuts from Obsidian hotkey config.
	// Uses browserEvent.key (actual character produced) instead of scancode KeyCode,
	// so it works regardless of keyboard layout and follows user-configured hotkeys.
	editor.onKeyDown((e: Monaco.IKeyboardEvent) => {
		const key = e.browserEvent.key;

		// Check command palette hotkey (requires Mod)
		if (currentCommandPaletteHotkey && (e.ctrlKey || e.metaKey)) {
			const hk = currentCommandPaletteHotkey;
			// Extract required modifier states from hotkey config
			const needsShift = hk.modifiers.includes('Shift');
			const needsAlt = hk.modifiers.includes('Alt');
			const keyMatch = key.toLowerCase() === hk.key.toLowerCase();
			// Match only if all modifiers are exactly as required (no extra modifiers)
			if (keyMatch && e.shiftKey === needsShift && e.altKey === needsAlt) {
				e.preventDefault();
				e.stopPropagation();
				window.parent.postMessage(
					{ type: 'open-obsidian-palette', context },
					'*'
				);
				return;
			}
		}

		// Check settings hotkey (requires Mod)
		if (currentSettingsHotkey && (e.ctrlKey || e.metaKey)) {
			const hk = currentSettingsHotkey;
			// Extract required modifier states from hotkey config
			const needsShift = hk.modifiers.includes('Shift');
			const needsAlt = hk.modifiers.includes('Alt');
			const keyMatch = key.toLowerCase() === hk.key.toLowerCase();
			// Match only if all modifiers are exactly as required (no extra modifiers)
			if (keyMatch && e.shiftKey === needsShift && e.altKey === needsAlt) {
				e.preventDefault();
				e.stopPropagation();
				window.parent.postMessage({ type: 'open-settings', context }, '*');
				return;
			}
		}

		// Check delete file hotkey (may or may not require Mod)
		if (currentDeleteFileHotkey) {
			const hk = currentDeleteFileHotkey;
			// Determine if Mod key is required (Mod, Ctrl, or Meta in config)
			const needsMod =
				hk.modifiers.includes('Mod') ||
				hk.modifiers.includes('Ctrl') ||
				hk.modifiers.includes('Meta');
			const needsShift = hk.modifiers.includes('Shift');
			const needsAlt = hk.modifiers.includes('Alt');
			const hasMod = e.ctrlKey || e.metaKey;
			const keyMatch = key.toLowerCase() === hk.key.toLowerCase();
			// Match only if Mod state matches requirement and other modifiers are exact
			if (
				keyMatch &&
				hasMod === needsMod &&
				e.shiftKey === needsShift &&
				e.altKey === needsAlt
			) {
				e.preventDefault();
				e.stopPropagation();
				window.parent.postMessage({ type: 'delete-file', context }, '*');
			}
		}
	});
}
