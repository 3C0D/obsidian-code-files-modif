/**
 * Console pane implementation for the Monaco iframe.
 * Manages the UI lifecycle of the integrated terminal-like panel.
 */
import { AnsiUp } from 'ansi_up';
import type * as monaco from 'monaco-editor';
import { getParentOrigin, throttle } from './utils.ts';

// Initialize ANSI to HTML converter
const ansiUp = new AnsiUp();
ansiUp.use_classes = true; // Use CSS classes instead of inline styles for better theme integration

/**
 * State tracking for the console.
 * isRunning: Tracks if a child process is currently active.
 *   - true:  Enter key sends text to the process's stdin.
 *   - false: Enter key starts a new shell command.
 */
let isRunning = false;
const history: string[] = [];
let historyIndex = -1;

/**
 * Initializes the console pane elements and registers all event listeners.
 * Called once during the main editor initialization.
 *
 * @param ctx - The code context (usually the relative file path)
 * @param editor - The Monaco editor instance (used to trigger layout updates)
 */
export function initConsolePane(
  ctx: string,
  editor: monaco.editor.IStandaloneCodeEditor | null
): void {
  const pane = document.getElementById('console-pane');
  const output = document.getElementById('console-output');
  const input = document.getElementById('console-input-field') as HTMLInputElement;
  const runBtn = document.getElementById('console-run-btn');
  const stopBtn = document.getElementById('console-stop-btn');
  const resizeHandle = document.getElementById('console-resize-handle');

  // Guard against missing DOM elements (e.g. if the HTML template changed)
  if (!pane || !output || !input || !runBtn || !stopBtn) return;

  /**
   * Processes the current input value.
   * Logic branches based on whether a process is already running.
   */
  const sendCommand = (): void => {
    const cmd = input.value.trim();
    if (!cmd) return;

    // Handle local 'clear' commands without round-tripping to the parent process
    if (cmd === 'clear' || cmd === 'cls') {
      output.innerHTML = '';
      input.value = '';
      return;
    }

    if (isRunning) {
      /**
       * MODE: Interactive Stdin
       * If a process is running (e.g. a Python script waiting for input()),
       * we send the text to the parent which writes it to the process's stdin pipe.
       */
      output.innerHTML += `<span class="console-stdin-line">${cmd}\n</span>`;
      output.scrollTop = output.scrollHeight;
      window.parent.postMessage(
        { type: 'send-stdin', text: cmd, context: ctx },
        getParentOrigin()
      );
      input.value = '';
      return;
    }

    /**
     * MODE: New Command Execution
     * No process is active, so we treat the input as a new shell command to spawn.
     */
    output.innerHTML += `<span class="console-command-line">$ ${cmd}\n</span>`;
    output.scrollTop = output.scrollHeight;

    // Command History management
    history.push(cmd);
    historyIndex = history.length;

    isRunning = true; // Lock the console into Stdin mode until the process exits
    window.parent.postMessage(
      { type: 'run-command', cmd, context: ctx },
      getParentOrigin()
    );
    input.value = ''; // Clear input after sending command
  };

  /**
   * Global hotkeys for the console pane area.
   * Handles Ctrl+C for interruption and Ctrl+J for visibility toggle.
   */
  pane.addEventListener('keydown', (e) => {
    // Intercept Ctrl+C to kill the active process
    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.parent.postMessage(
        { type: 'stop-command', context: ctx },
        getParentOrigin()
      );
    }
    // Intercept Ctrl+J to toggle visibility (same shortcut as the main editor)
    if (e.key === 'j' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.parent.postMessage(
        { type: 'toggle-console', context: ctx },
        getParentOrigin()
      );
    }
  });

  runBtn.addEventListener('click', sendCommand);
  stopBtn.addEventListener('click', () => {
    window.parent.postMessage({ type: 'stop-command', context: ctx }, getParentOrigin());
  });

  /**
   * Input field specific listeners.
   * Handles Enter to submit and Arrows for history navigation.
   */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendCommand();
    } else if (e.key === 'ArrowUp') {
      // Navigate backward in command history
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      // Navigate forward in command history
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[historyIndex];
      } else {
        // Reset to empty input if we go past the latest command
        historyIndex = history.length;
        input.value = '';
      }
    }
  });

  /**
   * Vertical Resize Logic.
   * Allows dragging the top border of the console to change its height.
   * We must call editor.layout() during resizing to keep Monaco responsive.
   */
  if (resizeHandle) {
    let startY = 0;
    let startHeight = 0;

    // Throttled layout update to avoid blocking the main thread
    const throttledLayout = throttle(() => {
      editor?.layout();
    }, 50);

    const onMouseMove = (e: MouseEvent): void => {
      const delta = startY - e.clientY;
      // Clamp height between 80px and 80% of viewport
      const newHeight = Math.max(
        80,
        Math.min(window.innerHeight * 0.8, startHeight + delta)
      );

      // 1. VISUAL UPDATE (Immediate): Update the DOM height so the handle follows the mouse fluently
      pane.style.height = newHeight + 'px';

      // 2. LOGICAL UPDATE (Throttled): Trigger Monaco's expensive layout calculation at a controlled rate
      throttledLayout();
    };

    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = ''; // Re-enable text selection
    };

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = pane.offsetHeight;
      document.body.style.userSelect = 'none'; // Prevent selecting text while dragging
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * Automatic command suggestion based on file extension.
   * Helps users start running scripts quickly (e.g. 'npx ts-node file.ts').
   */
  const ext = ctx.match(/\.([^./\\]+)$/)?.[1];
  const fileName = ctx.split('/').pop() || '';
  if (ext === 'ts') input.value = 'npx tsx ' + fileName;
  else if (ext === 'py') input.value = 'python ' + fileName;
  else if (ext === 'js') input.value = 'node ' + fileName;
}

/**
 * Handles incoming console-related messages from the parent window.
 * Part of the central message dispatcher in init.ts.
 *
 * @param data - The message payload from the parent
 * @param editor - The Monaco editor instance
 * @returns boolean - true if the message was handled by this module
 */
export function handleConsoleMessage(
  data: Record<string, unknown>,
  editor: monaco.editor.IStandaloneCodeEditor | null
): boolean {
  const pane = document.getElementById('console-pane');
  const output = document.getElementById('console-output');

  switch (data.type) {
    case 'console-toggle': {
      if (pane) {
        pane.classList.toggle('visible');
        editor?.layout(); // Recalculate editor size to fill the remaining space
        if (!pane.classList.contains('visible')) {
          editor?.focus(); // Return focus to code if the console is closed
        }
      }
      return true;
    }

    case 'console-output': {
      if (output) {
        const text = data.text as string;

        // Convert ANSI escape codes (colors) to HTML spans
        output.innerHTML += ansiUp.ansi_to_html(text);

        // Scroll to the bottom to keep the latest output visible
        output.scrollTop = output.scrollHeight;

        /**
         * State Reset Logic.
         * We look for the conventional termination string sent by the parent's
         * messageHandler when a process closes (either naturally or via kill).
         */
        if (text.includes('Process exited with code')) {
          isRunning = false;
        }
      }
      return true;
    }

    case 'console-history': {
      const incoming = data.history as string[];
      // Only restore if iframe history is empty (fresh init)
      if (history.length === 0) {
        history.push(...incoming);
        historyIndex = history.length;
      }
      return true;
    }

    default:
      return false;
  }
}
