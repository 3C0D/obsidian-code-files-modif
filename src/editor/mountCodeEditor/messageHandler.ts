import type { MessageHandlerContext } from '../../types/types.ts';
import { CodeEditorView } from '../codeEditorView/index.ts';
import { broadcastHotkeys } from '../../utils/broadcast.ts';
import { around } from 'monkey-around';

/**
 * Builds the postMessage handler for a Monaco iframe instance.
 * Filtered by source to only process messages from the given iframe.
 */
export function buildMessageHandler(
	ctx: MessageHandlerContext
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
				console.debug('open-file in mountCodeEditor');

				// Look for an existing leaf in the main editor area (no sidebars, no popout windows)
				const existingLeaf = plugin.app.workspace
					.getLeavesOfType('code-editor')
					.find((l) => {
						// Must be in the main window
						if (l.view.containerEl.win !== window) return false;
						// Must be in the root split (editor area), not left/right sidebar
						const root = plugin.app.workspace.rootSplit;
						let el: Element | null = l.containerEl;
						while (el && el !== root.containerEl) el = el.parentElement;
						if (!el) return false;
						// File must match
						return (
							l.view instanceof CodeEditorView &&
							l.view.file?.path === vaultPath
						);
					});

				const leaf = existingLeaf ?? plugin.app.workspace.getLeaf('tab');
				if (!existingLeaf) await leaf.openFile(file);
				plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

				if (position) {
					// Wait for Monaco to mount in new tabs.
					// empirical delay, no clean alternative: 150ms is an empirical delay to ensure Monaco is ready
					// to receive the 'scroll-to-position' command after it is opened in a new tab.
					setTimeout(
						() => {
							if (leaf.view instanceof CodeEditorView && leaf.view.editor) {
								leaf.view.editor.send('scroll-to-position', {
									position
								});
							}
						},
						existingLeaf ? 0 : 150
					);
				}
				break;
			}
			default:
				break;
		}
	};
}
