import type { App } from 'obsidian';

/**
 * Utility to register a handler for Obsidian's 'css-change' event.
 * Returns a cleanup function to unregister the handler.
 *
 * @param app - The Obsidian App instance.
 * @param handler - The callback to execute on CSS change.
 * @returns A function that unregisters the handler when called.
 */
export function onCssChange(app: App, handler: () => void): () => void {
  const ref = app.workspace.on('css-change', handler);
  return () => app.workspace.offref(ref);
}