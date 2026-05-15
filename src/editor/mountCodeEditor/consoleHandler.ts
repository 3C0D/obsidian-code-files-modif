/**
 * Console handling for the mounted code editor.
 * Manages terminal commands, process execution, and output streaming.
 */
import type { ChildProcess } from 'child_process';
import { Notice, Platform } from 'obsidian';
import { getDataAdapterEx } from 'obsidian-typings/implementations';
import type CodeFilesPlugin from '../../main.ts';
import type { IframeMessage } from '../../types/index.ts';

let spawn:
  | ((command: string, args: string[], options: unknown) => ChildProcess)
  | undefined;
let path:
  | { join: (...paths: string[]) => string; resolve: (...paths: string[]) => string }
  | undefined;
let fs: { statSync(p: string): { isDirectory(): boolean } } | undefined;

if (Platform.isDesktop) {
  spawn = require('child_process').spawn;
  path = require('path');
  fs = require('fs');
}

/** Global registry for active console processes. */
export const activeProcesses = new Map<string, ChildProcess>();

/** Tracks the current working directory for each file's console session. */
const currentCwd = new Map<string, string>();

/** Tracks exit timers for processes to ensure data flush. */
const closeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Kills the console process and clears state for a specific editor context.
 * Called when an editor view is destroyed.
 */
export function cleanupConsole(codeContext: string): void {
  const proc = activeProcesses.get(codeContext);
  if (proc) {
    killProcessTree(proc);
    activeProcesses.delete(codeContext);
  }
  currentCwd.delete(codeContext);
  const timer = closeTimers.get(codeContext);
  if (timer) {
    clearTimeout(timer);
    closeTimers.delete(codeContext);
  }
}

/**
 * Kills ALL active console processes and clears all tracking state.
 * Called when the plugin is unloaded.
 */
export function cleanupAllConsoles(): void {
  for (const proc of activeProcesses.values()) {
    killProcessTree(proc);
  }
  activeProcesses.clear();
  currentCwd.clear();
  for (const timer of closeTimers.values()) {
    clearTimeout(timer);
  }
  closeTimers.clear();
}

/**
 * Initializes the console state for a new editor instance.
 * Sends the current history and working directory to the iframe.
 */
export function initConsole(
  plugin: CodeFilesPlugin,
  codeContext: string,
  send: (type: string, payload: unknown) => void
): void {
  if (!Platform.isDesktop || !path) return;

  const { basePath, cwd } = resolveConsoleCwd(plugin, codeContext);

  // Send initial CWD to the iframe console
  send('console-cwd-changed', { cwd, vaultPath: basePath });

  // Restore command history from persistent settings
  const hist = plugin.settings.consoleHistories[codeContext];
  if (hist?.length) {
    send('console-history', { history: hist });
  }
}

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
 * Handles console-related iframe messages.
 * Returns true if the message was handled, false otherwise.
 */
export async function handleConsoleMessage(
  msg: IframeMessage & { context: string },
  codeContext: string,
  plugin: CodeFilesPlugin,
  send: (type: string, payload: unknown) => void,
  onConsoleVisibilityChanged?: (visible: boolean) => void
): Promise<boolean> {
  switch (msg.type) {
    /**
     * CONSOLE: Run a new system command.
     * Spawns a child process and pipes its output to the iframe.
     */
    case 'run-command': {
      if (!Platform.isDesktop || !spawn || !path) return true;
      const cmdLine = msg.cmd;
      if (!cmdLine?.trim()) return true;

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
        return true;
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
          const timer = setTimeout(() => {
            closeTimers.delete(codeContext);
            const status = code === null ? 'Interrupted' : `code ${code}`;
            send('console-output', {
              text: `\n[Process exited: ${status}]\n`
            });
            send('console-process-exited', { code: code ?? null });
            activeProcesses.delete(codeContext);
          }, 50);
          closeTimers.set(codeContext, timer);
        });

        proc.on('error', (err) => {
          send('console-output', { text: `Error: ${err.message}\n` });
          send('console-process-exited', { code: null });
          activeProcesses.delete(codeContext);
        });
      } catch (err) {
        send('console-output', { text: `Failed to start: ${err}\n` });
      }
      return true;
    }

    /**
     * CONSOLE: Persist height changes.
     */
    case 'console-height-changed': {
      if (!Platform.isDesktop) return true;
      plugin.settings.consoleHeight = msg.height;
      await plugin.saveSettings();
      return true;
    }

    /**
     * CONSOLE: Visibility changed (e.g. via toggle).
     */
    case 'console-visibility-changed': {
      if (!Platform.isDesktop) return true;
      onConsoleVisibilityChanged?.(msg.visible);
      return true;
    }

    /**
     * CONSOLE: Toggle visibility.
     * Triggered by hotkey (Ctrl+J) in Monaco.
     */
    case 'toggle-console': {
      if (!Platform.isDesktop) return true;
      send('console-toggle', {});
      return true;
    }

    /**
     * CONSOLE: Write to the standard input of the active process.
     * Used for interactive scripts (e.g. answering a prompt).
     */
    case 'send-stdin': {
      if (!Platform.isDesktop) return true;
      const proc = activeProcesses.get(codeContext);
      if (proc?.stdin?.writable) {
        // We append a newline because stdin usually expects a line-buffered input.
        proc.stdin.write(msg.text + '\n');
      }
      return true;
    }

    /**
     * CONSOLE: Send EOF (close stdin pipe) to the active process.
     * Triggered by Ctrl+D in the console when a process is running.
     * Equivalent to pressing Ctrl+D / Ctrl+Z in a terminal.
     */
    case 'send-stdin-eof': {
      if (!Platform.isDesktop) return true;
      const proc = activeProcesses.get(codeContext);
      if (proc?.stdin?.writable) {
        proc.stdin.end();
      }
      return true;
    }

    /**
     * CONSOLE: Display a temporary notification to the user.
     * Used for status feedback (e.g. "Selection copied").
     */
    case 'console-notify': {
      if (!Platform.isDesktop) return true;
      new Notice(msg.text);
      return true;
    }

    /**
     * CONSOLE: Force-kill the active process tree.
     * Triggered by Ctrl+C in the console or the Stop button.
     */
    case 'stop-command': {
      if (!Platform.isDesktop) return true;
      const proc = activeProcesses.get(codeContext);
      if (proc) killProcessTree(proc);
      activeProcesses.delete(codeContext);
      return true;
    }

    default:
      return false;
  }
}
