import { Platform, type App } from 'obsidian';

/**
 * Checks whether the explorer-shortcuts relay feature should be enabled.
 * The feature is only active on Desktop and only when the third-party plugin
 * "explorer-shortcuts" is installed and enabled.
 */
export function isExplorerShortcutsEnabled(app: App): boolean {
  return Platform.isDesktop && app.plugins.enabledPlugins.has('explorer-shortcuts');
}

/**
 * Sets up a mousemove listener on the parent document that detects when the mouse
 * hovers over the file-explorer nav container and notifies the iframe via the
 * provided send function.
 *
 * Returns a cleanup function that removes the listener.
 */
export function setupExplorerHoverTracker(
  send: (type: string, payload: Record<string, unknown>) => void
): () => void {
  let mouseOverExplorer = false;

  const onMouseMove = (e: MouseEvent): void => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = !!el?.closest(
      ".workspace-leaf-content[data-type='file-explorer'] .nav-files-container"
    );
    if (over !== mouseOverExplorer) {
      mouseOverExplorer = over;
      send('explorer-hover', { over });
    }
  };

  document.addEventListener('mousemove', onMouseMove);

  return () => {
    document.removeEventListener('mousemove', onMouseMove);
  };
}
