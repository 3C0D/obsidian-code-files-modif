/**
 * Console handling for the mounted code editor.
 * Manages terminal commands, process execution, and output streaming.
 */
import type { ChildProcess } from 'child_process';
import { Notice, Platform } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import type { IframeMessage } from '../../types/iframeMessages.ts';
import { getAdapter } from '../../utils/hiddenFiles/state.ts';

let spawn:
  | ((command: string, args?: readonly string[], options?: unknown) => ChildProcess)
  | undefined;
let path:
  | { join: (...paths: string[]) => string; resolve: (...paths: string[]) => string; isAbsolute: (p: string) => boolean }
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

/**
 * CP850 (DOS Latin 1) high-byte lookup table (0x80–0xFF → Unicode).
 * Used to decode output from cmd.exe builtins (dir, type, etc.) on Windows,
 * which use the OEM code page regardless of chcp settings when piped.
 * ÇüéâäàåçêëèïîìÄÅÉ...
 */
// prettier-ignore
const cp850: readonly string[] = [
  'Ç', 'ü', 'é', 'â', 'ä', 'à', 'å', 'ç', 'ê', 'ë', 'è', 'ï', 'î', 'ì', 'Ä', 'Å',
  'É', 'æ', 'Æ', 'ô', 'ö', 'ò', 'û', 'ù', 'ÿ', 'Ö', 'Ü', '¢', '£', '¥', '₧', 'ƒ',
  'á', 'í', 'ó', 'ú', 'ñ', 'Ñ', 'ª', 'º', '¿', '⌐', '¬', '½', '¼', '¡', '«', '»',
  '░', '▒', '▓', '│', '┤', '╡', '╢', '╖', '╕', '╣', '║', '╗', '╝', '╜', '╛', '┐',
  '└', '┴', '┬', '├', '─', '┼', '╞', '╟', '╚', '╔', '╩', '╦', '╠', '═', '╬', '╧',
  '╨', '╤', '╥', '╙', '╘', '╒', '╓', '╫', '╪', '┘', '┌', '█', '▄', '▌', '▐', '▀',
  'α', 'ß', 'Γ', 'π', 'Σ', 'σ', 'µ', 'τ', 'Φ', 'Θ', 'Ω', 'δ', '∞', 'φ', 'ε', '∩',
  '≡', '±', '≥', '≤', '⌠', '⌡', '÷', '≈', '°', '∙', '·', '√', 'ⁿ', '²', '■', ' '
];

function decodeCp850(buf: Buffer): string {
  let result = '';
  for (const byte of buf) {
    if (byte < 0x80) {
      result += String.fromCharCode(byte);
    } else {
      result += cp850[byte - 0x80];
    }
  }
  return result;
}

function resolveConsoleCwd(
  plugin: CodeFilesPlugin,
  codeContext: string
): { basePath: string; cwd: string } {
  const adapter = getAdapter(plugin);
  const basePath = adapter.basePath;
  const fileDir = path!.join(basePath, codeContext.replace(/[^/\\]*$/, ''));
  const cwd = currentCwd.get(codeContext) ?? fileDir;
  return { basePath, cwd };
}

function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid || !spawn) return;

  try {
    if (Platform.isDesktop && process.platform === 'win32') {
      // On Windows, use taskkill to kill the entire tree
      const killer = spawn('taskkill', ['/pid', proc.pid.toString(), '/t', '/f'], {
        stdio: 'ignore',
      });
      killer.on('close', () => {});
    } else {
      // On Unix-like systems, use pkill to kill the process group
      const killer = spawn('pkill', ['-P', proc.pid.toString()], {
        stdio: 'ignore',
      });
      killer.on('close', () => {});
    }
  } catch {
    // Fallback: try to kill just the main process
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 5000);
  }
}

export function handleConsoleMessage(
  msg: IframeMessage,
  codeContext: string,
  send: (type: string, data?: unknown) => void,
  plugin: CodeFilesPlugin
): void {
  switch (msg.type) {
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
        if (!Platform.isDesktop || !spawn || !path || !fs) break;
      const cmdLine = msg.cmd;
      if (!cmdLine?.trim()) break;

      // Persist command in history (cross-session settings)
      const hist = plugin.settings.consoleHistories[codeContext] ?? [];
      if (!hist.includes(cmdLine.trim())) {
        hist.push(cmdLine.trim());
        // Keep only last 50 entries per file
        if (hist.length > 50) hist.shift();
        plugin.settings.consoleHistories[codeContext] = hist;
        plugin.saveSettings();
      }

      const { basePath, cwd: activeCwd } = resolveConsoleCwd(plugin, codeContext);

      // Intercept 'cd' commands to update the persistent CWD without spawning a subprocess.
      // Regex allows: 'cd', 'cd ..', 'cd..', 'cd~', 'cd /abs', 'cd "path with spaces"'
      const cdMatch = cmdLine.trim().match(/^cd(\s.*|\.\.?|~.*)?$/i);
      if (cdMatch !== null) {
        const target = (cdMatch[1] ?? '').trim().replace(/^["']|["']$/g, '');

        let newCwd: string;
        if (target === '~' || target.startsWith('~/')) {
          // Expand ~ to home directory
          const home = process.env.HOME || process.env.USERPROFILE || basePath;
          newCwd = target === '~' ? home : path.resolve(home, target.slice(2));
        } else if (path.isAbsolute(target)) {
          newCwd = target;
        } else {
          newCwd = path.resolve(activeCwd, target);
        }

        // Validate the new CWD exists and is a directory
        try {
          const stat = fs.statSync(newCwd);
          if (stat.isDirectory()) {
            currentCwd.set(codeContext, newCwd);
            send('console-output', { output: `Changed directory to ${newCwd}\n` });
          } else {
            send('console-output', { output: `cd: ${target}: Not a directory\n` });
          }
        } catch {
          send('console-output', { output: `cd: ${target}: No such file or directory\n` });
        }
        break;
      }

      // Kill any existing process for this file
      const existingProc = activeProcesses.get(codeContext);
      if (existingProc) {
        killProcessTree(existingProc);
        activeProcesses.delete(codeContext);
      }

      // Parse the command line (basic shell-like parsing)
      const args = cmdLine.trim().split(/\s+/);
      const cmd = args.shift()!;

      try {
        // Spawn the process
        const proc = spawn(cmd, args, {
          cwd: activeCwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32', // Use shell on Windows for built-in commands
          env: { ...process.env, FORCE_COLOR: '1' }, // Enable colors for supported tools
        });

        activeProcesses.set(codeContext, proc);

        // Handle stdout
        if (proc.stdout) {
          proc.stdout.on('data', (data: Buffer) => {
            let output = data.toString('utf8');
            if (process.platform === 'win32' && !output) {
              // Fallback to CP850 decoding for cmd.exe builtins
              output = decodeCp850(data);
            }
            send('console-output', { output });
          });
        }

        // Handle stderr
        if (proc.stderr) {
          proc.stderr.on('data', (data: Buffer) => {
            let output = data.toString('utf8');
            if (process.platform === 'win32' && !output) {
              output = decodeCp850(data);
            }
            send('console-error', { output });
          });
        }

        // Handle process exit
        proc.on('close', (code: number | null) => {
          activeProcesses.delete(codeContext);
          send('console-exit', { code });
        });

        proc.on('error', (err: Error) => {
          activeProcesses.delete(codeContext);
          send('console-error', { output: `Error: ${err.message}\n` });
        });
      } catch (e: unknown) {
        send('console-error', { output: `Failed to start command: ${String(e)}\n` });
      }
      break;
    }

    case 'console-height-changed': {
      if (!Platform.isDesktop) break;
      plugin.settings.consoleHeight = msg.height;
      plugin.saveSettings();
      break;
    }

    /**
     * CONSOLE: Visibility changed (e.g. via toggle).
     */
    case 'console-visibility-changed': {
      if (!Platform.isDesktop) break;
      // Note: onConsoleVisibilityChanged is not defined here, assuming it's passed or handled elsewhere
      // For now, just acknowledge
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
        proc.stdin.write(msg.text + '\n');
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
      new Notice(msg.text);
      break;
    }

    /**
     * CONSOLE: Force-kill the active process tree.
     * Triggered by Ctrl+C in the console or the Stop button.
     */
    case 'stop-command': {
      if (!Platform.isDesktop) break;
      const proc = activeProcesses.get(codeContext);
      if (proc) {
        killProcessTree(proc);
        activeProcesses.delete(codeContext);
      }
      break;
    }
  }
}

export function cleanupConsole(): void {
  for (const proc of activeProcesses.values()) {
    killProcessTree(proc);
  }
  activeProcesses.clear();
  currentCwd.clear();
}
