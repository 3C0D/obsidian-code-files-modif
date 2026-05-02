import type { MessageHandlerContext, Prettify } from '../../types/index.ts';
import { CodeEditorView } from '../codeEditorView/index.ts';
import { broadcastHotkeys } from '../../utils/broadcast.ts';
import { around } from 'monkey-around';
import { openInMonacoLeaf } from '../codeEditorView/editorOpeners.ts';

/**
 * Builds the postMessage handler for a Monaco iframe instance.
 * Filtered by source to only process messages from the given iframe.
 */
export function buildMessageHandler(
	ctx: Prettify<MessageHandlerContext>
): (event: MessageEvent) => Promise<void> {
	const {
		iframe,
		send,
		valueRef,
		codeContext,
		plugin,
		initParams,
		loadProjectFiles,
		autoFocus,
		onChange,
		onSave,
		onFormatDiff,
		onFormatDiffReverted,
		onOpenEditorConfig,
		onOpenThemePicker,
		onOpenRenameExtension
	} = ctx;

	return async ({ data, source }: MessageEvent): Promise<void> => {
		// Guard against messages from other iframes or sources
		if (source !== iframe.contentWindow) return;

		// Handle 'ready' first — no context check needed, targets this iframe only
		if (data.type === 'ready') {
			send('init', initParams);
			send('change-value', { value: valueRef.current });
			if (autoFocus) send('focus', {});
			await loadProjectFiles(send);
			return;
		}

		// All other messages must match this editor's context
		// Ensures the message comes from this specific iframe:
		// - data.context: identifier sent by the iframe (e.g., file path)
		// - codeContext: this editor's identifier (passed to mountCodeEditor)
		if (data.context !== codeContext) return;

		switch (data.type) {
			case 'open-formatter-config': {
				const ext = codeContext.match(/\.([^./\\]+)$/)?.[1] ?? '';
				onOpenEditorConfig?.(ext);
				break;
			}
			case 'open-theme-picker': {
				onOpenThemePicker?.();
				break;
			}
			case 'open-settings': {
				// Patch settings modal onClose to detect hotkey changes safely via monkey-around.
				// This ensures we always restore the original method and don't overwrite other patches.
				// Wait 200ms after close to ensure Obsidian has saved the new hotkeys.
				const uninstall = around(plugin.app.setting, {
					onClose(old) {
						return () => {
							const result = old.apply(this);
							uninstall();
							setTimeout(() => {
								broadcastHotkeys(plugin);
							}, 200);
							send('focus', {});
							return result;
						};
					}
				});
				plugin.app.setting.open();
				break;
			}
			case 'delete-file': {
				const file = plugin.app.vault.getFileByPath(codeContext);
				if (!file) break;
				const leaf = plugin.app.workspace
					.getLeavesOfType('code-editor')
					.find(
						(l) =>
							l.view instanceof CodeEditorView &&
							l.view.file?.path === codeContext
					);
				leaf?.detach();
				await plugin.app.vault.trash(file, true);
				break;
			}
			case 'open-obsidian-palette': {
				// Patch onClose to refocus Monaco when command palette closes safely via monkey-around.
				const cmdPalette =
					plugin.app.internalPlugins.getPluginById('command-palette');
				if (!cmdPalette) break;
				const modal = cmdPalette.instance.modal;
				const uninstall = around(modal, {
					onClose(old) {
						return () => {
							const result = old.apply(this);
							uninstall();
							send('focus', {});
							return result;
						};
					}
				});
				modal.open();
				break;
			}
			case 'open-rename-extension': {
				onOpenRenameExtension?.();
				break;
			}
			case 'return-to-default-view': {
				const file = plugin.app.vault.getFileByPath(codeContext);
				if (!file) break;
				const leaf = plugin.app.workspace
					.getLeavesOfType('code-editor')
					.find(
						(l) =>
							l.view instanceof CodeEditorView &&
							l.view.file?.path === codeContext
					);
				if (leaf) {
					await leaf.openFile(file);
				}
				break;
			}
			case 'format-diff-available': {
				onFormatDiff?.();
				break;
			}
			case 'format-diff-reverted': {
				onFormatDiffReverted?.();
				break;
			}
			case 'change': {
				if (valueRef.current !== data.value) {
					valueRef.current = data.value as string;
					onChange?.();
				}
				break;
			}
			case 'save-document': {
				onSave?.();
				break;
			}
			case 'word-wrap-toggled': {
				plugin.settings.wordWrap = data.wordWrap as 'on' | 'off';
				await plugin.saveSettings();
				break;
			}
			case 'open-file': {
				const vaultPath = data.path as string;
				const position = data.position as {
					lineNumber: number;
					column: number;
				} | null;
				const file = plugin.app.vault.getFileByPath(vaultPath);
				if (!file) break;
				await openInMonacoLeaf(file, plugin, true, position, true);
				break;
			}
			default:
				break;
		}
	};
}
