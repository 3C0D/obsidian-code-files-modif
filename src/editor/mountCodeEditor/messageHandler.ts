import type { MessageHandlerContext, Prettify } from '../../types/index.ts';
import { CodeEditorView } from '../codeEditorView/index.ts';
import { broadcastHotkeys } from '../../utils/broadcast.ts';
import { around } from 'monkey-around';
import { openInMonacoLeaf } from '../codeEditorView/editorOpeners.ts';
import { Platform } from 'obsidian';
import { spawn, type ChildProcess } from 'child_process';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import path from 'path';

/** Global registry for active console processes. */
export const activeProcesses = new Map<string, ChildProcess>();

/**
 * Force-kills a process and its entire child tree.
 * @param proc - The child process to terminate.
 */
function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    if (process.platform === 'win32') {
      // Windows: taskkill /T kills the entire tree, /F forces it.
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true });
    } else {
      // Unix: Passing negative PID signals the process group.
      process.kill(-proc.pid, 'SIGINT');
    }
  } catch {
    proc.kill('SIGINT');
  }
}

/**
 * Builds the postMessage handler for a Monaco iframe instance.
 * This is the central bridge between the isolated iframe and the Obsidian/Node.js environment.
 *
 * @param ctx - The context containing refs to the iframe, current file, and plugin instance.
 */
export function buildMessageHandler(ctx: Prettify<MessageHandlerContext>): {
  handler: (event: MessageEvent) => Promise<void>;
  cleanup: () => void;
} {
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

  /**
   * Main message listener function.
   * Processes all events sent by the iframe via window.parent.postMessage.
   */
  const onMessage = async ({ data, source }: MessageEvent): Promise<void> => {
    // SECURITY: Ensure we only process messages intended for THIS specific iframe instance.
    if (source !== iframe.contentWindow) return;

    // Handle 'ready' signal: Triggered when Monaco is fully loaded in the iframe.
    if (data.type === 'ready') {
      send('init', initParams);
      send('change-value', { value: valueRef.current });
      if (autoFocus) send('focus', {});
      await loadProjectFiles(send);

      // Restore command history for this file context from persistent settings
      const hist = plugin.settings.consoleHistories[codeContext];
      if (hist?.length) send('console-history', { history: hist });
      return;
    }

    // DISPATCHING: All other messages must provide a 'context' matching this file path.
    if (data.context !== codeContext) return;

    switch (data.type) {
      // ... (existing cases: open-formatter-config, settings, delete, etc.)
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
        const uninstall = around(plugin.app.setting, {
          onClose(old) {
            return function (this: unknown) {
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
            (l) => l.view instanceof CodeEditorView && l.view.file?.path === codeContext
          );
        leaf?.detach();
        await plugin.app.vault.trash(file, true);
        break;
      }
      case 'open-obsidian-palette': {
        const cmdPalette = plugin.app.internalPlugins.getPluginById('command-palette');
        if (!cmdPalette) break;
        const modal = cmdPalette.instance.modal;
        const uninstall = around(modal, {
          onClose(old) {
            return function (this: unknown) {
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
            (l) => l.view instanceof CodeEditorView && l.view.file?.path === codeContext
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

      /**
       * CONSOLE: Toggle visibility.
       * Simply reflects the command back to the iframe.
       * The iframe manages the actual DOM visibility class.
       */
      case 'toggle-console': {
        if (!Platform.isDesktop) break;
        send('console-toggle', {});
        break;
      }

      /**
       * CONSOLE: Run a new system command.
       * Spawns a child process and pipes its output to the iframe.
       */
      case 'run-command': {
        if (!Platform.isDesktop) break;
        const cmdLine = data.cmd as string;
        if (!cmdLine?.trim()) break;

        // Persist command in history (cross-session settings)
        const hist = plugin.settings.consoleHistories[codeContext] ?? [];
        if (!hist.includes(cmdLine.trim())) {
          hist.push(cmdLine.trim());
          // Keep only last 50 entries per file
          if (hist.length > 50) hist.shift();
          plugin.settings.consoleHistories[codeContext] = hist;
          await plugin.saveSettings();
        }

        // Kill any existing process for this file before starting a new one.
        const existing = activeProcesses.get(codeContext);
        if (existing) killProcessTree(existing);

        const parts = cmdLine.trim().split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        // Determine the absolute directory of the current file.
        // Commands should run relative to the file, not the vault root.
        const adapter = getDataAdapterEx(plugin.app);
        const basePath = adapter.basePath;
        const fileDir = path.join(basePath, codeContext.replace(/[^/\\]*$/, ''));

        try {
          const proc = spawn(cmd, args, {
            cwd: fileDir,
            env: {
              ...process.env,
              PYTHONIOENCODING: 'utf-8', // Ensure UTF-8 for Python scripts
              GIT_PAGER: '',             // Avoid hanging on git log
              FORCE_COLOR: '1'           // Encourage color output for TTY-aware tools
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            detached: process.platform !== 'win32'
          });
          activeProcesses.set(codeContext, proc);

          // Relay stdout data to the iframe
          proc.stdout?.on('data', (chunk) => {
            send('console-output', { text: chunk.toString() });
          });
          // Relay stderr data to the iframe
          proc.stderr?.on('data', (chunk) => {
            send('console-output', { text: chunk.toString() });
          });

          /**
           * Process Exit Handling.
           * We wait 50ms (setTimeout) to ensure all remaining 'data' events
           * from stdout/stderr have been processed before signaling the exit.
           */
          proc.on('close', (code) => {
            setTimeout(() => {
              const status = code === null ? 'Interrupted' : `code ${code}`;
              send('console-output', {
                text: `\n[Process exited: ${status}]\n`
              });
              // Task 1: Send structured exit message
              send('console-process-exited', { code: code ?? null });
              activeProcesses.delete(codeContext);
            }, 50);
          });

          proc.on('error', (err) => {
            send('console-output', { text: `Error: ${err.message}\n` });
            // Task 3: Also send exit signal on error
            send('console-process-exited', { code: null });
            activeProcesses.delete(codeContext);
          });
        } catch (err) {
          send('console-output', { text: `Failed to start: ${err}\n` });
        }
        break;
      }

      /**
       * CONSOLE: Persist height changes.
       */
      case 'console-height-changed': {
        if (!Platform.isDesktop) break;
        plugin.settings.consoleHeight = data.height as number;
        await plugin.saveSettings();
        break;
      }

      /**
       * CONSOLE: Write to the standard input of the active process.
       * Used for interactive scripts (e.g. answering a prompt).
       */
      case 'send-stdin': {
        if (!Platform.isDesktop) break;
        const proc = activeProcesses.get(codeContext);
        if (proc?.stdin?.writable) {
          // We append a newline because stdin usually expects a line-buffered input.
          proc.stdin.write((data.text as string) + '\n');
        }
        break;
      }

      /**
       * CONSOLE: Force-kill the active process tree.
       * Triggered by Ctrl+C in the console or the Stop button.
       */
      case 'stop-command': {
        if (!Platform.isDesktop) break;
        const proc = activeProcesses.get(codeContext);
        if (proc) killProcessTree(proc);
        activeProcesses.delete(codeContext);

        /**
         * MANUAL NOTIFICATION:
         * Force-killing (especially on Windows) might prevent the 'close' event
         * from firing normally. We send a manual notice to ensure the iframe's
         * 'isRunning' flag is reset.
         */
        /*
        send('console-output', {
          text: '\nProcess interrupted (SIGINT)\nProcess exited with code null\n'
        });
        */
        break;
      }

      default:
        break;
    }
  };

  return {
    handler: onMessage,
    /**
     * Cleanup Function.
     * Called when the editor view is destroyed.
     * Ensures we don't leave zombie background processes running.
     */
    cleanup: () => {
      const proc = activeProcesses.get(codeContext);
      if (proc) killProcessTree(proc);
      activeProcesses.delete(codeContext);
    }
  };
}
