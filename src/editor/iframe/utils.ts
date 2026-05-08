/**
 * Shared utilities for iframe modules.
 * Handles parent origin capture for secure postMessage communication,
 * and provides a general-purpose throttle helper.
 */

/**
 * Parent window origin used as `targetOrigin` for outgoing `postMessage` calls.
 * `*` is only a temporary fallback before the `init` message is received.
 */
let parentOrigin = '*';

/**
 * Captures the parent window origin from the `init` message event.
 * Called once on `init` — locks all subsequent postMessage calls to the real origin.
 * @param origin - `e.origin` from the `init` MessageEvent (`app://obsidian.md` or `http://localhost:port`)
 */
export function setParentOrigin(origin: string): void {
  parentOrigin = origin;
}

/**
 * Gets the captured parent origin for postMessage communication.
 * @returns `app://obsidian.md` (desktop), `http://localhost:port` (mobile), or `'*'` before `init`
 */
export function getParentOrigin(): string {
  return parentOrigin;
}

/**
 * Simple throttle utility to limit execution frequency of expensive operations.
 * @param func - The function to throttle
 * @param limit - Minimum time in milliseconds between executions
 */
export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  let lastFunc: ReturnType<typeof setTimeout>;
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => func(...args), limit);
    }
  };
}
