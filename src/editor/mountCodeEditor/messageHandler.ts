/**
 * Message handler for the mounted code editor.
 * Handles incoming messages from the editor view and processes them.
 */
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

/** Tracks the current working directory for each file's console session. */
const currentCwd = new Map<string, string>();

/**
 * CP850 (DOS Latin 1) high-byte lookup table (0x80–0xFF → Unicode).
 * Used to decode output from cmd.exe builtins (dir, type, etc.) on Windows,
 * which use the OEM code page regardless of chcp settings when piped.
 */
// prettier-ignore
const CP850_HIGH =
  '\u00C7\u00FC\u00E9\u00E2\u00E4\u00E0\u00E5\u00E7\u00EA\u00EB\u00E8\u00EF\u00EE\u00EC\u00C4\u00C5' +
  '\u00C9\u00E6\u00C6\u00F4\u00F6\u00F2\u00FB\u00F9\u00FF\u00D6\u00DC\u00F8\u00A3\u00D8\u00D7\u0192' +
  '\u00E1\u00ED\u00F3\u00FA\u00F1\u00D1\u00AA\u00BA\u00BF\u00AE\u00AC\u00BD\u00BC\u00A1\u00AB\u00BB' +
  '\u2591\u2592\u2593\u2502\u2524\u00C1\u00C2\u00C0\u00A9\u2563\u2551\u2557\u255D\u00A2\u00A5\u2510' +
  '\u2514\u2534\u252C\u251C\u2500\u253C\u00E3\u00C3\u255A\u2554\u2569\u2566\u2560\u2550\u256C\u00A4' +
  '\u00F0\u00D0\u00CA\u00CB\u00C8\u0131\u00CD\u00CE\u00CF\u2518\u250C\u2588\u2584\u00A6\u00CC\u2580' +
  '\u00D3\u00DF\u00D4\u00D2\u00F5\u00D5\u00B5\u00FE\u00DE\u00DA\u00DB\u00D9\u00FD\u00DD\u00AF\u00B4' +
  '\u00AD\u00B1\u2017\u00BE\u00B6\u00A7\u00F7\u00B8\u00B0\u00A8\u00B7\u00B9\u00B3\u00B2\u25A0\u00A0';

/**
 * Decodes a Buffer of CP850-encoded bytes into a Unicode string.
 * @param buf - Raw bytes from a Windows cmd.exe process.
 */
function decodeCp850(buf: Buffer): string {
  let result = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    result += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80];
  }
  return result;
}

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
    onOpenRenameExtension,
    onConsoleVisibilityChanged,
    initialConsoleOpen
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

      // Send initial CWD to the iframe console
      const adapter = getDataAdapterEx(plugin.app);
      const fileDir = path.join(adapter.basePath, codeContext.replace(/[^/\\]*$/, ''));
      const initialCwd = currentCwd.get(codeContext) ?? fileDir;
      send('console-cwd-changed', { cwd: initialCwd });

      if (initialConsoleOpen) {
        send('console-show', {});
      }
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

        const adapter = getDataAdapterEx(plugin.app);
        const basePath = adapter.basePath;
        const fileDir = path.join(basePath, codeContext.replace(/[^/\\]*$/, ''));
        const activeCwd = currentCwd.get(codeContext) ?? fileDir;

        // Task: Intercept 'cd' commands to update the persistent CWD
        const cdMatch = cmdLine.trim().match(/^cd\s+(.+)/i);
        if (cdMatch) {
          const target = cdMatch[1].replace(/^["']|["']$/g, '');
          const resolved = path.resolve(activeCwd, target);
          try {
            const fs = require('fs');
            const stats = fs.statSync(resolved);
            if (stats.isDirectory()) {
              currentCwd.set(codeContext, resolved);
              send('console-cwd-changed', { cwd: resolved });
              // Local command: no spawn needed
              send('console-output', { text: '' });
              send('console-process-exited', { code: 0 });
              break;
            }
          } catch {
            // Fall through to spawn if directory doesn't exist
          }
        }

        // Kill any existing process for this file before starting a new one.
        const existing = activeProcesses.get(codeContext);
        if (existing) killProcessTree(existing);

        const shellCmd = cmdLine.trim();

        try {
          const proc = spawn(shellCmd, [], {
            cwd: activeCwd,
            env: {
              ...process.env,
              PYTHONIOENCODING: 'utf-8', // Ensure UTF-8 for Python scripts
              GIT_PAGER: '', // Avoid hanging on git log
              FORCE_COLOR: '1' // Encourage color output for TTY-aware tools
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            detached: process.platform !== 'win32'
          });
          activeProcesses.set(codeContext, proc);

          // Decode process output, handling Windows CP850 encoding.
          // On Windows, cmd.exe builtins (dir, type) output in CP850 (OEM code page),
          // while programs like Python/Node output UTF-8. We try UTF-8 first and
          // fall back to CP850 decoding if the bytes aren't valid UTF-8.
          const decodeChunk = process.platform === 'win32'
            ? (chunk: Buffer) => {
                try {
                  return new TextDecoder('utf-8', { fatal: true }).decode(chunk);
                } catch {
                  return decodeCp850(chunk);
                }
              }
            : (chunk: Buffer) => new TextDecoder().decode(chunk, { stream: true });

          // Relay stdout data to the iframe
          proc.stdout?.on('data', (chunk) => {
            send('console-output', { text: decodeChunk(chunk) });
          });
          // Relay stderr data to the iframe
          proc.stderr?.on('data', (chunk) => {
            send('console-output', { text: decodeChunk(chunk) });
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
       * CONSOLE: Visibility changed (e.g. via toggle).
       */
      case 'console-visibility-changed': {
        if (!Platform.isDesktop) break;
        onConsoleVisibilityChanged?.(data.visible as boolean);
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
