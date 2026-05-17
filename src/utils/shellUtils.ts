import { Platform } from 'obsidian';
import type { execFileSync as ExecFileSyncFn } from 'child_process';

let execFileSync: typeof ExecFileSyncFn | undefined;
if (Platform.isDesktop) {
  execFileSync = require('child_process').execFileSync;
}

/**
 * Checks if pwsh.exe (PowerShell 7+) is available on the host system.
 * cmd.exe and powershell.exe are guaranteed on Windows and need no probing.
 *
 * @param shell - Shell executable name (e.g. 'pwsh.exe')
 */
export function isShellAvailable(shell: string): boolean {
  if (!Platform.isDesktop || !execFileSync) return false;
  try {
    const args = ['-Command', '$PSVersionTable'];
    execFileSync(shell, args, { timeout: 1000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Cached ordered list of available Windows shells. Computed once per session. */
let cachedAvailableShells: string[] | null = null;

/**
 * Returns the ordered list of available Windows shells, computed once per session.
 * cmd.exe and powershell.exe are always present; only pwsh.exe (PowerShell 7+) is optional.
 */
export function getAvailableShells(): string[] {
  if (cachedAvailableShells) return cachedAvailableShells;
  // cmd.exe and powershell.exe are guaranteed on Windows; no need to probe them.
  cachedAvailableShells = ['powershell.exe'];
  if (isShellAvailable('pwsh.exe')) cachedAvailableShells.push('pwsh.exe');
  cachedAvailableShells.push('cmd.exe');
  return cachedAvailableShells;
}
