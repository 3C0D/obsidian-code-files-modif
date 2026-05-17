import { Platform } from 'obsidian';

/**
 * Checks if a specific Windows shell is available on the host system.
 * Returns true if the shell runs successfully, false otherwise.
 *
 * @param shell - The shell executable name (e.g. 'cmd.exe', 'powershell.exe', 'pwsh.exe')
 */
export function isShellAvailable(shell: string): boolean {
  if (!Platform.isDesktop) return false;
  try {
    const { execFileSync } = require('child_process');
    const args = shell === 'cmd.exe' ? ['/c', 'ver'] : ['-Command', '$PSVersionTable'];
    execFileSync(shell, args, { timeout: 1000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
