import type CodeFilesPlugin from '../../main.ts';
import { buildMergedConfig } from '../../utils/settingsUtils.ts';
import { getActiveExtensions } from '../../utils/extensionUtils.ts';
import { getObsidianHotkey, parseHotkeyOverride } from '../../utils/hotkeyUtils.ts';
import { resolveThemeParams } from '../../utils/themeUtils.ts';
import { BUILTIN_THEMES } from '../../types/variables.ts';

/**
 * Builds the initParams object sent to the Monaco iframe on 'ready'.
 * Resolves hotkeys, editor settings, theme data, and editorConfig for the given context.
 *
 * @param plugin - The plugin instance.
 * @param codeContext - Unique identifier for this editor instance (file path or modal ID).
 * @param language - Monaco language ID.
 * @param theme - Resolved Monaco theme ID.
 * @param extension - File extension extracted from codeContext (empty string if none).
 * @returns The initParams object to send via postMessage.
 */
export async function buildInitParams(
    plugin: CodeFilesPlugin,
    codeContext: string,
    language: string,
    theme: string,
    extension: string
): Promise<Record<string, unknown>> {
    // Reads Obsidian's configured hotkey for a command, falling back to the command's default hotkeys.
    const commandPaletteHotkey = getObsidianHotkey(plugin.app, 'command-palette:open');
    const settingsHotkey = getObsidianHotkey(plugin.app, 'app:open-settings');
    const deleteFileHotkey = getObsidianHotkey(plugin.app, 'app:delete-file') ?? {
        modifiers: ['Mod'],
        key: 'Delete'
    };

    // Apply overrides if they exist (overrides are stored as 'Mod' internally for cross-platform consistency)
    const finalCommandPaletteHotkey =
        parseHotkeyOverride(plugin.settings.commandPaletteHotkeyOverride) ??
        commandPaletteHotkey ?? { modifiers: ['Mod'], key: 'p' };
    const finalSettingsHotkey =
        parseHotkeyOverride(plugin.settings.settingsHotkeyOverride) ??
        settingsHotkey ?? { modifiers: ['Mod'], key: ',' };
    const finalDeleteFileHotkey =
        parseHotkeyOverride(plugin.settings.deleteFileHotkeyOverride) ?? deleteFileHotkey;

    // Disable minimap and line numbers for config editors (modal + settings tab)
    // - editor-settings-config: config editor in the gear icon modal
    // - settings-editor-config: config editor in the plugin settings tab
    // - modal-editor.*: code fence editor modals (keep line numbers, disable minimap only)
    const isConfigEditor =
        codeContext.includes('editor-settings-config') ||
        codeContext.includes('settings-editor-config');
    const isModalEditor = codeContext.startsWith('modal-editor.');

    const initParams: Record<string, unknown> = {
        context: codeContext,
        lang: language,
        theme: theme.replace(/[^a-z0-9\-]/gi, '-'),
        wordWrap: plugin.settings.wordWrap,
        folding: plugin.settings.folding,
        lineNumbers: isConfigEditor ? false : plugin.settings.lineNumbers,
        minimap: isConfigEditor || isModalEditor ? false : plugin.settings.minimap,
        // Monaco uses negative flags (noSemanticValidation, noSyntaxValidation), but settings use positive flags
        noSemanticValidation: !plugin.settings.semanticValidation,
        noSyntaxValidation: !plugin.settings.syntaxValidation,
        projectRootFolder: plugin.settings.projectRootFolder,
        commandPaletteHotkey: finalCommandPaletteHotkey,
        settingsHotkey: finalSettingsHotkey,
        deleteFileHotkey: finalDeleteFileHotkey
    };

    // If the editor is for a file with an extension that doesn't have a registered formatter,
    // set a flag so the Monaco iframe can show a warning and hide formatting options.
    if (extension && !getActiveExtensions(plugin.settings).includes(extension)) {
        initParams.isUnregisteredExtension = true;
    }

    // Custom themes need their JSON fetched and passed as themeData; built-in themes are handled by Monaco directly.
    if (!BUILTIN_THEMES.includes(theme)) {
        const resolved = await resolveThemeParams(plugin, theme);
        if (resolved.themeData) initParams.themeData = resolved.themeData;
    }

    // Transparent background prevents a color flash in the iframe while Monaco loads.
    initParams.background = 'transparent';
    initParams.editorConfig = buildMergedConfig(plugin, extension);

    return initParams;
}