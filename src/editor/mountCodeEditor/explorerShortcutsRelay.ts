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

/** Minimal relay message shape, mirroring the IframeMessage union variants. */
type KeyRelayMessage = {
  type: 'keydown-relay' | 'keyup-relay';
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * Handles a keydown-relay or keyup-relay message from the Monaco iframe.
 * Dispatches a synthetic keyboard event on the parent document so capture-phase
 * listeners in other plugins (e.g. obsidian-explorer-shortcuts) can receive it,
 * then transfers focus to the file explorer for follow-up keys (anything except Space).
 *
 * Must be called before context validation in the message handler because
 * these messages carry no 'context' field.
 */
export function handleKeyRelayMessage(msg: KeyRelayMessage, app: App): void {
  const eventType = msg.type === 'keydown-relay' ? 'keydown' : 'keyup';
  const synth = new KeyboardEvent(eventType, {
    key: msg.key,
    code: msg.code,
    ctrlKey: msg.ctrlKey,
    metaKey: msg.metaKey,
    shiftKey: msg.shiftKey,
    altKey: msg.altKey,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(synth);

  // Transfer focus to the file explorer for follow-up keys (anything except Space).
  // This lets the user press Escape or keep navigating with arrow keys.
  if (msg.key !== ' ') {
    const fileExplorerLeaf = app.workspace.getLeavesOfType('file-explorer').first();
    if (fileExplorerLeaf) {
      app.workspace.setActiveLeaf(fileExplorerLeaf, { focus: true });
    }
  }
}
