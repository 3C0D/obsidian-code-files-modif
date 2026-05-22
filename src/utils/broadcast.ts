/**
 * Broadcasts settings changes to all open Monaco Editor instances via postMessage.
 * Each function targets specific settings:
 * - broadcastOptions: semantic/syntax validation toggles
 * - broadcastBrightness: CSS filter on iframe elements
 * - broadcastEditorConfig: merged editor config (tabSize, formatOnSave, etc.)
 * - broadcastProjectFiles: loads TS/JS files from project root for IntelliSense and cross-file navigation
 * - broadcastHotkeys: updates editor hotkeys to match Obsidian's settings
 */
import { Notice } from 'obsidian';
import type CodeFilesPlugin from '../main.ts';
import { getCodeEditorViews } from '../editor/codeEditorView/index.ts';
import { buildMergedConfig } from './settingsUtils.ts';
import { getExtension } from './extensionUtils.ts';
import { staticMap } from './getLanguage.ts';
import { readProjectFiles, readTsConfig } from './projectUtils.ts';
import { getObsidianHotkey, parseHotkeyOverride, formatHotkey } from './hotkeyUtils.ts';

/**
 * Sends a postMessage to each open Monaco iframe
 * to update validation options.
 * Called after toggling semantic/syntax validation
 * in settings — each iframe receives the message
 * and updates its internal Monaco configuration.
 *
 * @param plugin - The plugin instance.
 */
export function broadcastOptions(plugin: CodeFilesPlugin): void {
  for (const view of getCodeEditorViews(plugin.app)) {
    view.editor?.send('change-options', {
      noSemanticValidation: !plugin.settings.semanticValidation,
      noSyntaxValidation: !plugin.settings.syntaxValidation
    });
  }
}

/**
 * Applies a CSS brightness filter on each iframe.
 * Monaco runs in an isolated iframe so Obsidian's
 * theme variables don't reach it — a CSS filter
 * on the iframe itself is the only way to
 * dim/brighten the editor.
 *
 * @param plugin - The plugin instance.
 */
export function broadcastBrightness(plugin: CodeFilesPlugin): void {
  for (const view of getCodeEditorViews(plugin.app)) {
    if (view.editor?.iframe) {
      view.editor.iframe.style.filter = `brightness(${plugin.settings.editorBrightness})`;
    }
  }
}

/**
 * Sends the merged editor config (global `'*'`
 * + language fallback + per-extension override) to open iframes.
 *
 * When `ext` is `'*'`, the config is sent to all open views.
 * Otherwise, only views whose file extension matches `ext` directly,
 * or whose mapped language matches `ext`, are updated.
 *
 * @param plugin - The plugin instance.
 * @param ext - The file extension to target.

 */
export function broadcastEditorConfig(plugin: CodeFilesPlugin, ext: string): void {
  for (const view of getCodeEditorViews(plugin.app)) {
    if (!view.file) continue;

    const fileExt = getExtension(view.file.name);
    const language = staticMap[fileExt] ?? 'plaintext';

    // Update if global change (*), direct extension match, or inherited language match (e.g. json -> jsonc)
    if (ext === '*' || fileExt === ext || language === ext) {
      const config = buildMergedConfig(plugin, fileExt);
      view.editor?.send('change-editor-config', { config });
    }
  }
}

/**
 * Loads all TypeScript/JavaScript files from the
 * project root folder and broadcasts them to all
 * open Monaco editors.
 *
 * Why load file contents?
 * Monaco's TypeScript language service needs the actual
 * source code to provide IntelliSense (autocomplete,
 * type checking) and enable cross-file navigation
 * (Ctrl+Click on imports). The content is added as
 * "extra libraries" to Monaco's TypeScript compiler,
 * allowing it to resolve imports and show definitions
 * from other files in the project.
 *
 * How it works:
 * 1. Reads all .ts/.tsx/.js/.jsx files from projectRootFolder
 * 2. Sends {path, content} pairs to each Monaco iframe
 * 3. Monaco calls addExtraLib() and createModel() to register
 *    the files with its TypeScript language service
 * 4. If no project root is set, sends an empty array to clear
 *    previously loaded files
 *
 * @param plugin - The plugin instance.
 */
export async function broadcastProjectFiles(plugin: CodeFilesPlugin): Promise<void> {
  const files = await readProjectFiles(plugin);
  const tsConfigOptions = plugin.settings.useTsConfig ? await readTsConfig(plugin) : null;
  for (const view of getCodeEditorViews(plugin.app)) {
    view.editor?.send('load-project-files', { files, tsConfigOptions });
  }
}

/**
 * Checks if Obsidian hotkeys have changed and broadcasts updates to all open Monaco editors.
 * Called when settings modal closes to detect hotkey changes made by the user.
 * Monaco updates keybindings dynamically via postMessage without requiring a reload.
 *
 * Hotkeys are stored internally as 'Mod' for cross-platform consistency:
 * - 'Mod' = 'Ctrl' on Windows/Linux
 * - 'Mod' = 'Cmd' on Mac
 * This matches Obsidian's internal representation and ensures overrides work consistently.
 *
 * @param plugin - The plugin instance.
 */
export function broadcastHotkeys(plugin: CodeFilesPlugin): void {
  // Apply overrides if they exist (overrides are stored as 'Mod' internally)
  const resolveHotkey = (
    commandId: string,
    fallback: { modifiers: string[]; key: string },
    override: string
  ): { modifiers: string[]; key: string } =>
    parseHotkeyOverride(override) ?? getObsidianHotkey(plugin.app, commandId) ?? fallback;

  const finalSettingsHotkey = resolveHotkey(
    'app:open-settings',
    { modifiers: ['Mod'], key: ',' },
    plugin.settings.settingsHotkeyOverride
  );
  const finalPaletteHotkey = resolveHotkey(
    'command-palette:open',
    { modifiers: ['Mod'], key: 'p' },
    plugin.settings.commandPaletteHotkeyOverride
  );
  const finalDeleteFileHotkey = resolveHotkey(
    'app:delete-file',
    { modifiers: ['Mod'], key: 'Delete' },
    plugin.settings.deleteFileHotkeyOverride
  );
  // Console hotkey is direct (no Obsidian hotkey)
  const finalConsoleHotkey = parseHotkeyOverride(plugin.settings.consoleHotkey) ?? {
    modifiers: ['Mod'],
    key: 'j'
  };

  const currentHotkeys = JSON.stringify({
    settingsHotkey: finalSettingsHotkey,
    paletteHotkey: finalPaletteHotkey,
    deleteFileHotkey: finalDeleteFileHotkey,
    consoleHotkey: finalConsoleHotkey
  });

  if (currentHotkeys === plugin._lastHotkeys) return;
  plugin._lastHotkeys = currentHotkeys;

  // Broadcast hotkey updates to all open views
  for (const view of getCodeEditorViews(plugin.app)) {
    view.editor?.send('update-hotkeys', {
      commandPaletteHotkey: finalPaletteHotkey,
      settingsHotkey: finalSettingsHotkey,
      deleteFileHotkey: finalDeleteFileHotkey,
      consoleHotkey: finalConsoleHotkey
    });
  }

  // Show notice to user using resolved hotkey strings
  const settingsStr = formatHotkey(finalSettingsHotkey, true);
  const paletteStr = formatHotkey(finalPaletteHotkey, true);
  const deleteStr = formatHotkey(finalDeleteFileHotkey, true);

  // consoleHotkey intentionally omitted from notice — not an Obsidian command override
  new Notice(
    `Editor hotkeys reloaded (Settings: ${settingsStr}, Palette: ${paletteStr}, Delete: ${deleteStr})`
  );
}
