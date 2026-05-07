/**
 * Shared utilities for iframe modules.
 * Handles parent origin capture for secure postMessage communication.
 */

let parentOrigin = '*';

/**
 * Captures the parent window origin from the init message event.
 * Must be called once before any postMessage is sent to the parent.
 * @param origin - The origin of the parent window (from event.origin)
 */
export function setParentOrigin(origin: string): void {
  parentOrigin = origin;
}

/**
 * Gets the captured parent origin for postMessage communication.
 * @returns The parent window origin, or '*' if not yet captured
 */
export function getParentOrigin(): string {
  return parentOrigin;
}

/**
 * Simple throttle utility to limit execution frequency of expensive operations.
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
