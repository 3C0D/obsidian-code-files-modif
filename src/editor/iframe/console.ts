/**
 * Console pane implementation for the Monaco iframe.
 * Manages the UI lifecycle of the integrated terminal-like panel.
 */
import { AnsiUp } from 'ansi_up';
import type * as monaco from 'monaco-editor';
import { getParentOrigin, throttle } from './utils.ts';
import { matchesHotkey } from './keybindingUtils.ts';
import type { HotkeyConfig } from './types/index.ts';

// AnsiUp converts ANSI escape codes (terminal color sequences like \x1b[32m) to HTML <span> tags,
// so process output with colors (e.g. npm, jest, python) renders correctly in the console pane.
const ansiUp = new AnsiUp();
ansiUp.use_classes = true; // Use CSS classes instead of inline styles for better theme integration

/**
 * State tracking for the console.
 * isRunning: Tracks if a child process is currently active.
 *   - true:  Enter key sends text to the process's stdin.
 *   - false: Enter key starts a new shell command.
 */
let isRunning = false;
let currentCwd = '';
let vaultPath = '';
const history: string[] = [];
let historyIndex = -1;
let currentConsoleHotkey: HotkeyConfig | null = null;

/**
 * Updates the prompt UI elements based on current state (CWD, isRunning).
 */
const updatePrompt = (): void => {
  const cwdEl = document.getElementById('console-prompt-cwd');
  const symbolEl = document.getElementById('console-prompt-symbol');
  const input = document.getElementById('console-input-field') as HTMLInputElement;
  if (cwdEl) {
    // Strip everything before the vault root, then show full relative path
    const relative =
      vaultPath && currentCwd.startsWith(vaultPath)
        ? currentCwd.slice(vaultPath.length).replace(/^[/\\]/, '')
        : currentCwd.split(/[/\\]/).slice(-2).join('/');
    cwdEl.textContent = relative || '/';
    cwdEl.style.display = isRunning ? 'none' : '';
  }
  if (symbolEl) {
    symbolEl.style.display = isRunning ? 'none' : '';
  }
  if (input) {
    input.placeholder = isRunning ? 'stdin...' : '';
  }
};

/**
 * Initializes the console pane elements and registers all event listeners.
 * Called once during the main editor initialization.
 *
 * @param ctx - The code context (usually the relative file path)
 * @param editor - The Monaco editor instance (used to trigger layout updates)
 */
export function initConsolePane(
  ctx: string,
  editor: monaco.editor.IStandaloneCodeEditor | null,
  initialHeight?: number,
  hotkey?: HotkeyConfig | null
): void {
  currentConsoleHotkey = hotkey || null;
  const pane = document.getElementById('console-pane');
  const output = document.getElementById('console-output');
  const input = document.getElementById('console-input-field') as HTMLInputElement;
  const resizeHandle = document.getElementById('console-resize-handle');

  // Guard against missing DOM elements (e.g. if the HTML template changed)
  if (!pane || !output || !input) return;

  // Add close button event listener
  const closeButton = document.getElementById('console-close-btn') as HTMLButtonElement;
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.parent.postMessage(
        { type: 'toggle-console', context: ctx },
        getParentOrigin()
      );
    });
  }

  // Restore persistent console height if provided
  if (initialHeight) {
    pane.style.height = initialHeight + 'px';
  }

  const sendCommand = (): void => {
    const cmd = input.value.trim();
    // Allow empty lines in stdin mode (e.g., to signal EOF in Python scripts)
    if (!cmd && !isRunning) return;

    // Handle local 'clear' commands without round-tripping to the parent process
    if ((cmd === 'clear' || cmd === 'cls') && !isRunning) {
      output.innerHTML = '';
      input.value = '';
      return;
    }

    // Handle 'pwd' locally to diagnose currentCwd state without round-tripping
    if (cmd === 'pwd') {
      const shortDir = currentCwd.split(/[/\\]/).slice(-2).join('/') || '/';
      output.innerHTML += `<span class="console-cwd">${shortDir}</span><span class="console-command-line"> $ pwd\n${currentCwd || '/'}\n</span>`;
      output.scrollTop = output.scrollHeight;
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
      // Scroll to the bottom to keep the latest output visible
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
    const shortDir = currentCwd.split(/[/\\]/).slice(-2).join('/') || '/';
    output.innerHTML += `<span class="console-cwd">${shortDir}</span><span class="console-command-line"> $ ${cmd}\n</span>`;
    output.scrollTop = output.scrollHeight;

    // Command History management
    history.push(cmd);
    historyIndex = history.length;

    isRunning = true; // Lock the console into Stdin mode until the process exits
    updatePrompt();
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
    // Handle Ctrl+L: Clear console output (like 'clear' or 'cls' command)
    if (e.key === 'l' && (e.ctrlKey || e.metaKey) && !isRunning) {
      e.preventDefault();
      output.innerHTML = '';
      return;
    }
    // Handle Ctrl+C: Kill process if running, otherwise allow copy
    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      if (isRunning) {
        e.preventDefault();
        window.parent.postMessage(
          { type: 'stop-command', context: ctx },
          getParentOrigin()
        );
      }
      // Otherwise, let the browser handle the default copy behavior
    }
    // Handle Ctrl+D: Send EOF (close stdin pipe) to the running process
    if ((e.key === 'd' || e.key === 'z') && (e.ctrlKey || e.metaKey) && isRunning) {
      e.preventDefault();
      window.parent.postMessage(
        { type: 'send-stdin-eof', context: ctx },
        getParentOrigin()
      );
    }
    // Intercept Console Hotkey to toggle visibility (same shortcut as the main editor)
    if (currentConsoleHotkey && matchesHotkey(e, currentConsoleHotkey)) {
      e.preventDefault();
      window.parent.postMessage(
        { type: 'toggle-console', context: ctx },
        getParentOrigin()
      );
    } else if (!currentConsoleHotkey && e.key === 'j' && (e.ctrlKey || e.metaKey)) {
      // Fallback to Ctrl+J if no hotkey is configured yet
      e.preventDefault();
      window.parent.postMessage(
        { type: 'toggle-console', context: ctx },
        getParentOrigin()
      );
    }
    // Global Enter key for the whole console area
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand();
    }
  });

  /**
   * Focus input field when clicking the output area.
   * We skip focusing if the user is currently selecting text for copying.
   */
  output.addEventListener('click', () => {
    const selection = window.getSelection()?.toString();
    if (!selection || selection.length === 0) {
      input.focus();
    }
  });

  /**
   * Copy selection on right click.
   */
  output.addEventListener('contextmenu', (e) => {
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) {
      e.preventDefault();
      navigator.clipboard.writeText(selection);
      window.parent.postMessage(
        { type: 'console-notify', text: 'Selection copied', context: ctx },
        getParentOrigin()
      );
    }
  });

  /**
   * Input field specific listeners.
   * Handles Enter to submit and Arrows for history navigation.
   */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
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
   * Drag-and-drop handler (no-op in the iframe).
   * file.path is inaccessible in sandboxed iframes — path resolution is delegated
   * to the parent Obsidian context via the drop-relay overlay in messageHandler.ts,
   * which forwards resolved paths back via the 'console-drop-paths' message.
   */
  const handleDrop = (e: DragEvent): void => {
    // File path resolution is handled by the parent via the drop-relay overlay.
    // Direct file.path access is blocked by iframe sandboxing.
    e.preventDefault();
  };

  input.addEventListener('dragover', (e) => e.preventDefault());
  input.addEventListener('drop', handleDrop);
  output.addEventListener('dragover', (e) => e.preventDefault());
  output.addEventListener('drop', handleDrop);

  /**
   * Support multi-line paste in stdin mode.
   */
  input.addEventListener('paste', (e) => {
    if (!isRunning) return;
    const text = e.clipboardData?.getData('text');
    if (text && text.includes('\n')) {
      e.preventDefault();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      for (const line of lines) {
        output.innerHTML += `<span class="console-stdin-line">${line}\n</span>`;
        window.parent.postMessage(
          { type: 'send-stdin', text: line, context: ctx },
          getParentOrigin()
        );
      }
      // Scroll to the bottom to keep the latest output visible
      output.scrollTop = output.scrollHeight;
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

      // Notify parent of new height for persistence across sessions
      window.parent.postMessage(
        { type: 'console-height-changed', height: pane.offsetHeight, context: ctx },
        getParentOrigin()
      );
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
   * Helps users start running scripts quickly (e.g. 'npx tsx file.ts').
   */
  const ext = ctx.match(/\.([^./\\]+)$/)?.[1]?.toLowerCase();
  const fileName = ctx.split('/').pop() || '';
  const PREFILL: Record<string, string> = {
    ts: 'npx tsx ',
    mts: 'npx tsx ',
    cts: 'npx tsx ',
    js: 'node ',
    mjs: 'node ',
    cjs: 'node ',
    py: 'python ',
    sh: 'bash ',
    ps1: 'powershell -File ',
    rb: 'ruby ',
    go: 'go run ',
    rs: 'cargo run', // No filename — cargo uses Cargo.toml
    java: 'java ',
    c: 'gcc -o out.exe ' + fileName + ' && .\\out.exe',
    cpp: 'g++ -o out.exe ' + fileName + ' && .\\out.exe',
    lua: 'lua ',
    php: 'php ',
    r: 'Rscript ',
    pl: 'perl '
  };
  const prefix = ext ? PREFILL[ext] : undefined;
  if (prefix !== undefined) {
    // For commands that expect a filename suffix
    input.value = prefix.endsWith(' ') ? prefix + fileName : prefix;
  }
}

/**
 * Handles incoming console-related messages from the parent window.
 * Part of the central message dispatcher in init.ts.
 *
 * @param data - The message payload from the parent
 * @param editor - The Monaco editor instance
 */
export function handleConsoleMessage(
  data: Record<string, unknown>,
  editor: monaco.editor.IStandaloneCodeEditor | null,
  ctx: string | null
): void {
  const pane = document.getElementById('console-pane');
  const output = document.getElementById('console-output');

  switch (data.type) {
    case 'console-toggle': {
      if (pane) {
        pane.classList.toggle('visible');
        editor?.layout(); // Recalculate editor size to fill the remaining space
        const isVisible = pane.classList.contains('visible');
        if (!isVisible) {
          editor?.focus(); // Return focus to code if the console is closed
        }
        // Notify the parent about the visibility change for state persistence
        window.parent.postMessage(
          { type: 'console-visibility-changed', visible: isVisible, context: ctx || '' },
          getParentOrigin()
        );
      }
      return;
    }

    case 'console-show': {
      if (pane && !pane.classList.contains('visible')) {
        pane.classList.add('visible');
        editor?.layout();
      }
      return;
    }

    case 'console-output': {
      if (output) {
        const text = data.text as string;

        // Convert ANSI escape codes (colors) to HTML spans
        output.innerHTML += ansiUp.ansi_to_html(text);

        // Auto-truncate output to prevent DOM bloat (keep last 5000 lines)
        const MAX_OUTPUT_LINES = 5000;
        const lines = output.innerHTML.split('\n');
        if (lines.length > MAX_OUTPUT_LINES) {
          output.innerHTML = lines.slice(-MAX_OUTPUT_LINES).join('\n');
        }

        // Scroll to the bottom to keep the latest output visible
        output.scrollTop = output.scrollHeight;
      }
      return;
    }

    case 'console-process-exited': {
      // Process exited — release the stdin lock
      isRunning = false;
      updatePrompt();
      return;
    }

    case 'console-cwd-changed': {
      currentCwd = data.cwd as string;
      if (data.vaultPath) vaultPath = data.vaultPath as string;
      updatePrompt();
      return;
    }

    case 'console-history': {
      const incoming = data.history as string[];
      // Only restore if iframe history is empty (fresh init)
      if (history.length === 0) {
        history.push(...incoming);
        historyIndex = history.length;
      }
      return;
    }

    /**
     * CONSOLE: Receive file paths resolved by the parent drop-relay overlay.
     * Appends them to the console input field, space-separated.
     * Paths containing spaces are automatically quoted.
     */
    case 'console-drop-paths': {
      const inputEl = document.getElementById('console-input-field') as HTMLInputElement;
      const paths = data.paths as string[];
      if (inputEl && paths?.length) {
        inputEl.focus();
        // Place cursor at end before inserting
        inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        // execCommand integrates the insertion into the native undo stack,
        // unlike direct .value assignment which bypasses undo history entirely.
        document.execCommand(
          'insertText',
          false,
          (inputEl.value ? ' ' : '') + paths.join(' ')
        );
      }
      return;
    }

    default:
      return;
  }
}

/**
 * Updates the console hotkey dynamically when Obsidian settings change.
 * @param hotkey - The new hotkey configuration
 */
export function updateConsoleHotkey(hotkey: HotkeyConfig | null): void {
  currentConsoleHotkey = hotkey;
}
