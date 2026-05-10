/**
 * Message handler for the mounted code editor.
 * Handles incoming messages from the editor view and processes them.
 */
import type { MessageHandlerContext, Prettify } from '../../types/index.ts';
import { CodeEditorView } from '../codeEditorView/index.ts';
import { broadcastHotkeys } from '../../utils/broadcast.ts';
import { around } from 'monkey-around';
import { openInMonacoLeaf } from '../codeEditorView/editorOpeners.ts';
import { Notice, Platform } from 'obsidian';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type { ChildProcess } from 'child_process';
import type CodeFilesPlugin from '../../main.ts';

// Desktop-only imports for console functionality
let spawn:
  | ((command: string, args: string[], options: unknown) => ChildProcess)
  | undefined;
let path:
  | { join: (...paths: string[]) => string; resolve: (...paths: string[]) => string }
  | undefined;
let fs: { statSync(p: string): { isDirectory(): boolean } } | undefined;
let webUtils: { getPathForFile(file: File): string } | undefined;

if (Platform.isDesktop) {
  spawn = require('child_process').spawn;
  path = require('path');
  webUtils = require('electron').webUtils;
  fs = require('fs');
}

/** Global registry for active console processes. */
export const activeProcesses = new Map<string, ChildProcess>();

/** Tracks the current working directory for each file's console session. */
const currentCwd = new Map<string, string>();

/**
 * CP850 (DOS Latin 1) high-byte lookup table (0x80–0xFF → Unicode).
 * Used to decode output from cmd.exe builtins (dir, type, etc.) on Windows,
 * which use the OEM code page regardless of chcp settings when piped.
 * ÇüéâäàåçêëèïîìÄÅÉ...
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
    // Bytes < 0x80 (ASCII) are kept as-is; bytes ≥ 0x80 are CP850 chars mapped via CP850_HIGH.
    // e.g. byte 0x82 (130)→ CP850_HIGH[0x82 - 0x80] = CP850_HIGH[2] → 'é'
    result += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80];
  }
  return result;
}

/**
 * Resolves the base vault path and the current working directory for a file's console session.
 * Uses the plugin's data adapter to get the vault root and falls back to the file's directory.
 */
function resolveConsoleCwd(
  plugin: CodeFilesPlugin,
  codeContext: string
): { basePath: string; cwd: string } {
  const adapter = getDataAdapterEx(plugin.app);
  const basePath = adapter.basePath;
  const fileDir = path!.join(basePath, codeContext.replace(/[^/\\]*$/, ''));
  const cwd = currentCwd.get(codeContext) ?? fileDir;
  return { basePath, cwd };
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
      spawn!('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true });
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

      // Desktop-only: initialise console state (CWD, history, visibility)
      // The integrated console relies on Node.js APIs (child_process, path, fs),
      // which are only available in the desktop Electron environment.
      if (Platform.isDesktop) {
        const { basePath, cwd } = resolveConsoleCwd(plugin, codeContext);
        send('console-cwd-changed', { cwd, vaultPath: basePath });
        const hist = plugin.settings.consoleHistories[codeContext];
        if (hist?.length) send('console-history', { history: hist });
        if (initialConsoleOpen) send('console-show', {});
      }
      return;
    }

    // DISPATCHING: All other messages must provide a 'context' matching this file path.
    if (data.context !== codeContext) return;

    switch (data.type) {
      case 'open-formatter-config': {
        const ext = codeContext.match(/\.([^./\\]+)$/)?.[1] ?? ''; // Extract the file extension from the path (empty string for extensionless files).
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
              // Defer hotkey broadcast: settings modal teardown is asynchronous in Obsidian,
              // so we wait 200 ms to ensure the panel is fully closed before re-syncing.
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

      /**
       * Re-opens the current file with Obsidian's default viewer (i.e. exits the Monaco leaf).
       */
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

      /**
       * Prettier found a diff: notify the parent to show the diff action in the toolbar.
       */
      case 'format-diff-available': {
        onFormatDiff?.();
        break;
      }

      /**
       * User reverted the format diff: hide the toolbar action.
       */
      case 'format-diff-reverted': {
        onFormatDiffReverted?.();
        break;
      }

      /**
       * Editor content changed: sync the internal value ref and notify the parent view.
       */
      case 'change': {
        if (valueRef.current !== data.value) {
          valueRef.current = data.value as string;
          onChange?.();
        }
        break;
      }

      /**
       * User triggered a save (Ctrl+S): delegate to the onSave callback (writes to vault).
       */
      case 'save-document': {
        onSave?.();
        break;
      }

      /**
       * Word-wrap toggle: persist the new state immediately so it survives a reload.
       */
      case 'word-wrap-toggled': {
        plugin.settings.wordWrap = data.wordWrap as 'on' | 'off';
        await plugin.saveSettings();
        break;
      }

      /**
       * Cross-file navigation request from Monaco (e.g. Cmd+Click on an import).
       * Opens the target vault file in a Monaco leaf, restoring cursor position if provided.
       */
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
        if (!Platform.isDesktop || !spawn || !path) break;
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

        const { basePath, cwd: activeCwd } = resolveConsoleCwd(plugin, codeContext);

        // Intercept 'cd' commands to update the persistent CWD without spawning a subprocess.
        // Regex allows: 'cd', 'cd ..', 'cd..', 'cd~', 'cd /abs', 'cd "path with spaces"'
        const cdMatch = cmdLine.trim().match(/^cd(\s.*|\.\.?|~.*)?$/i);
        if (cdMatch !== null) {
          const target = (cdMatch[1] ?? '').trim().replace(/^["']|["']$/g, '');
          // path.resolve() mimics `cd <target>`: combines activeCwd + target into a new absolute path.
          // If target is empty/'' (bare 'cd') or '~' → go to vault root (mirrors shell behavior).
          const resolved =
            target && target !== '~' ? path!.resolve(activeCwd, target) : basePath;
          try {
            if (fs!.statSync(resolved).isDirectory()) {
              currentCwd.set(codeContext, resolved);
              send('console-cwd-changed', { cwd: resolved });
              send('console-output', { text: '' });
              send('console-process-exited', { code: 0 });
            } else {
              send('console-output', { text: `cd: not a directory: ${target || '~'}\n` });
              send('console-process-exited', { code: 1 });
            }
          } catch {
            send('console-output', {
              text: `cd: no such file or directory: ${target || '~'}\n`
            });
            send('console-process-exited', { code: 1 });
          }
          break;
        }

        // Kill any existing process for this file before starting a new one.
        const existing = activeProcesses.get(codeContext);
        if (existing) killProcessTree(existing);

        const shellCmd = cmdLine.trim();

        // Spawn the actual system process and pipe its stdout/stderr to the iframe.
        // If spawn itself fails (e.g. command not found), the catch sends an error to the console.
        try {
          const proc = spawn!(shellCmd, [], {
            cwd: activeCwd,
            env: {
              ...process.env, // Inherit PATH, HOME, etc. from the parent process
              PYTHONIOENCODING: 'utf-8', // Ensure UTF-8 for Python scripts
              GIT_PAGER: '', // Avoid hanging on git log
              FORCE_COLOR: '1' // Encourage color output for TTY-aware tools
            },
            stdio: ['pipe', 'pipe', 'pipe'], // Pipe stdin, stdout, stderr for communication
            shell: true, // Use the system shell to allow built-in commands and complex expressions
            detached: process.platform !== 'win32' // Detach on Unix to allow independent process groups, but not on Windows where it's unreliable
          });
          activeProcesses.set(codeContext, proc);

          // Decode process output, handling Windows CP850 encoding.
          // On Windows, cmd.exe builtins (dir, type) output in CP850 (OEM code page),
          // while programs like Python/Node output UTF-8. We try UTF-8 first and
          // fall back to CP850 decoding if the bytes aren't valid UTF-8.
          const decodeChunk =
            process.platform === 'win32'
              ? (chunk: Buffer) => {
                  try {
                    return new TextDecoder('utf-8', { fatal: true }).decode(chunk); // intentionally fails on non-UTF-8 bytes to fall back to CP850
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
              send('console-process-exited', { code: code ?? null });
              activeProcesses.delete(codeContext);
            }, 50);
          });

          proc.on('error', (err) => {
            send('console-output', { text: `Error: ${err.message}\n` });
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
       * CONSOLE: Send EOF (close stdin pipe) to the active process.
       * Triggered by Ctrl+D in the console when a process is running.
       * Equivalent to pressing Ctrl+D / Ctrl+Z in a terminal.
       */
      case 'send-stdin-eof': {
        if (!Platform.isDesktop) break;
        const proc = activeProcesses.get(codeContext);
        if (proc?.stdin?.writable) {
          proc.stdin.end();
        }
        break;
      }

      /**
       * CONSOLE: Display a temporary notification to the user.
       * Used for status feedback (e.g. "Selection copied").
       */
      case 'console-notify': {
        if (!Platform.isDesktop) break;
        new Notice(data.text as string);
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
        break;
      }

      default:
        break;
    }
  };

  // Store relay cleanup refs in closure for the returned cleanup fn
  let _removeDragRelay: (() => void) | undefined;

  if (Platform.isDesktop) {
    /**
     * Drag-and-drop relay for the sandboxed iframe.
     * file.path and text/uri-list are both blocked inside the iframe.
     * A transparent overlay is placed over the iframe on dragenter to intercept
     * the drop at the parent (Electron) level, where file.path is accessible.
     * The overlay is single-use: it removes itself after the first drop or leave.
     */
    let dragOverlay: HTMLDivElement | null = null;
    let dropping = false; // Guard against immediate re-trigger after drop

    const hideOverlay = (): void => {
      dragOverlay?.remove();
      dragOverlay = null;
    };

    const showOverlay = (): void => {
      if (dragOverlay) return;
      const rect = iframe.getBoundingClientRect();
      dragOverlay = document.createElement('div');
      dragOverlay.style.cssText = `
        position: fixed;
        left: ${rect.left}px; top: ${rect.top}px;
        width: ${rect.width}px; height: ${rect.height}px;
        z-index: 9999;
        background: transparent;
      `;

      dragOverlay.addEventListener('dragover', (e) => e.preventDefault());

      dragOverlay.addEventListener(
        'drop',
        (e) => {
          e.preventDefault();
          e.stopPropagation(); // Prevent event from reaching the iframe
          if (dropping) return;
          dropping = true;
          setTimeout(() => {
            dropping = false;
          }, 300);

          hideOverlay();

          const files = Array.from(e.dataTransfer?.files ?? []);
          const basePath = getDataAdapterEx(plugin.app).basePath;
          const paths: string[] = [];

          for (const f of files) {
            const absPath: string = webUtils?.getPathForFile(f) ?? '';
            if (!absPath) continue;
            const resolved = absPath.startsWith(basePath)
              ? absPath.slice(basePath.length).replace(/^[/\\]/, '')
              : absPath;
            paths.push(resolved.includes(' ') ? `"${resolved}"` : resolved);
          }
          if (paths.length) send('console-drop-paths', { paths });
        },
        { once: true }
      );

      document.body.appendChild(dragOverlay);
    };

    const onDragEnter = (e: DragEvent): void => {
      const hasFiles = Array.from(e.dataTransfer?.items ?? []).some(
        (i) => i.kind === 'file'
      );
      if (hasFiles) showOverlay();
    };

    // Fallback: drag cancelled (Escape) or dropped outside any valid target
    const onDragEnd = (): void => hideOverlay();

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragend', onDragEnd);

    _removeDragRelay = (): void => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragend', onDragEnd);
      hideOverlay();
    };
  }

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
      _removeDragRelay?.();
    }
  };
}
