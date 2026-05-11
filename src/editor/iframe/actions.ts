/**
 * Monaco Editor Actions and Keyboard Handlers
 * All custom actions registered in Monaco's context menu and command palette
 */
import type * as Monaco from 'monaco-editor';
import type { InitParams, HotkeyConfig, Prettify } from './types/index.ts';
import { getLastFormat } from './diff.ts';
import { getParentOrigin } from './utils.ts';
import { hotkeyToMonacoKeybinding } from './keybindingUtils.ts';

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

/**
 * Enables or disables format-on-save behavior.
 * @param value - true to format before saving, false to save as-is
 */
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
 * Checks whether a keyboard event matches a hotkey configuration.
 * Handles all modifier combinations including Mod-less shortcuts.
 * @param e - The Monaco keyboard event
 * @param hk - The hotkey configuration to match against
 */
function matchesHotkey(e: Monaco.IKeyboardEvent, hk: HotkeyConfig): boolean {
  if (e.browserEvent.key.toLowerCase() !== hk.key.toLowerCase()) return false;

  const needsMod =
    hk.modifiers.includes('Mod') ||
    hk.modifiers.includes('Ctrl') ||
    hk.modifiers.includes('Meta');

  return (
    (e.ctrlKey || e.metaKey) === needsMod &&
    e.shiftKey === hk.modifiers.includes('Shift') &&
    e.altKey === hk.modifiers.includes('Alt')
  );
}

/**
 * Registers all Monaco actions and keyboard handlers.
 *
 * Three registration mechanisms are used:
 * - `addAction` with `contextMenuGroupId` → appears in context menu, command palette, and supports `keybindings` for automatic shortcut display
 * - `addAction` without `contextMenuGroupId` → command palette only
 * - `addCommand` → keybinding only (no menu, no palette)
 *
 * @param params - Initialization parameters
 * @param openDiffModal - Function to open the diff modal with original and formatted content
 */

export function registerActions(
  params: Prettify<InitParams>,
  openDiffModal: (orig: string, fmt: string) => void,
  initialHotkeys?: {
    commandPalette: HotkeyConfig | null;
    settings: HotkeyConfig | null;
    deleteFile: HotkeyConfig | null;
  }
): void {
  if (!editor) return;

  const paletteBinding = hotkeyToMonacoKeybinding(initialHotkeys?.commandPalette ?? null);
  const settingsBinding = hotkeyToMonacoKeybinding(initialHotkeys?.settings ?? null);
  const deleteBinding   = hotkeyToMonacoKeybinding(initialHotkeys?.deleteFile ?? null);

  // Add "Return to Default View" action if this is an unregistered extension
  if (params.isUnregisteredExtension) {
    editor.addAction({
      id: 'code-files-return-to-default-view',
      label: '↩️ Return to Default View',
      contextMenuGroupId: 'code-files',
      contextMenuOrder: 0,
      run: () => {
        // Only communication channel possible from the iframe: postMessage to Obsidian's parent window
        window.parent.postMessage(
          { type: 'return-to-default-view', context },
          // '*' until 'init' is received, then locked to 'app://obsidian.md' (desktop) or 'http://localhost:port' (mobile)
          getParentOrigin()
        );
      }
    });
  }

  // Alt+Z toggles word wrap and persists the setting
  editor.addAction({
    id: 'code-files-toggle-word-wrap',
    label: '↔ Toggle Word Wrap',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 0.4,
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
    run: () => {
      const current = editor!.getRawOptions().wordWrap;
      const next = current === 'on' ? 'off' : 'on';
      editor!.updateOptions({ wordWrap: next });
      window.parent.postMessage(
        { type: 'word-wrap-toggled', wordWrap: next, context },
        getParentOrigin()
      );
    }
  });



  editor.addAction({
    id: 'code-files-save',
    label: 'Save',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: async () => {
      if (formatOnSave) {
        const formatAction = editor!.getAction('editor.action.formatDocument');
        if (formatAction && formatAction.isSupported()) {
          await runFormatWithDiff();
          window.parent.postMessage(
            { type: 'save-document', context },
            getParentOrigin()
          );
          return;
        }
      }
      window.parent.postMessage({ type: 'save-document', context }, getParentOrigin());
    }
  });

  // Add "Format Document" action for all file types
  editor.addAction({
    id: 'code-files-format-document',
    label: '📝 Format Document',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 0.5,
    keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
    run: async () => {
      await runFormatWithDiff();
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

  // Add a context menu action in Monaco to rename the file extension
  editor.addAction({
    id: 'code-files-rename-extension',
    label: '🍋🟩 Rename Extension',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 1,
    run: () => {
      window.parent.postMessage(
        { type: 'open-rename-extension', context },
        getParentOrigin()
      );
    }
  });

  editor.addAction({
    id: 'code-files-change-theme',
    label: '🍒 Change Theme',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 2,
    run: () => {
      window.parent.postMessage(
        { type: 'open-theme-picker', context },
        getParentOrigin()
      );
    }
  });

  editor.addAction({
    id: 'code-files-formatter-config',
    label: '📐 Formatter Config',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 3,
    run: () => {
      window.parent.postMessage(
        { type: 'open-formatter-config', context },
        getParentOrigin()
      );
    }
  });

  editor.addAction({
    id: 'code-files-obsidian-settings',
    label: '🔧 Obsidian Settings',
    ...(settingsBinding ? { keybindings: [settingsBinding] } : {}),
    run: () => {
      window.parent.postMessage({ type: 'open-settings', context }, getParentOrigin());
    }
  });

  editor.addAction({
    id: 'code-files-obsidian-palette',
    label: '🎹 Obsidian Command Palette',
    ...(paletteBinding ? { keybindings: [paletteBinding] } : {}),
    run: () => {
      window.parent.postMessage(
        { type: 'open-obsidian-palette', context },
        getParentOrigin()
      );
    }
  });

  editor.addAction({
    id: 'code-files-delete-file',
    label: '🗑️ Delete File',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 4,
    ...(deleteBinding ? { keybindings: [deleteBinding] } : {}),
    run: () => {
      window.parent.postMessage({ type: 'delete-file', context }, getParentOrigin());
    }
  });

  editor.addAction({
    id: 'code-files-open-console',
    label: '🖥️ Open Console',
    contextMenuGroupId: 'code-files',
    contextMenuOrder: 5,
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ],
    run: () => {
      window.parent.postMessage({ type: 'toggle-console', context }, getParentOrigin());
    }
  });

  // Dynamic shortcuts from Obsidian hotkey config.
  // Uses browserEvent.key (actual character produced) instead of scancode KeyCode,
  // so it works regardless of keyboard layout and follows user-configured hotkeys.
  editor.onKeyDown((e: Monaco.IKeyboardEvent) => {
    if (currentCommandPaletteHotkey && matchesHotkey(e, currentCommandPaletteHotkey)) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage(
        { type: 'open-obsidian-palette', context },
        getParentOrigin()
      );
      return;
    }

    if (currentSettingsHotkey && matchesHotkey(e, currentSettingsHotkey)) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'open-settings', context }, getParentOrigin());
      return;
    }

    if (currentDeleteFileHotkey && matchesHotkey(e, currentDeleteFileHotkey)) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'delete-file', context }, getParentOrigin());
    }
  });
}
