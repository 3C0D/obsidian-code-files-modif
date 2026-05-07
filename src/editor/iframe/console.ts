/**
 * Console pane implementation for the Monaco iframe.
 * Handles command execution, history, stdin, resize, and ANSI rendering.
 */
import { AnsiUp } from 'ansi_up';
import type * as monaco from 'monaco-editor';
import { getParentOrigin } from './utils.ts';

const ansiUp = new AnsiUp();
ansiUp.use_classes = true;

let isRunning = false;
const history: string[] = [];
let historyIndex = -1;

/**
 * Initializes the console pane elements and event listeners.
 * @param ctx - The code context (file path)
 * @param editor - The Monaco editor instance
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

  if (!pane || !output || !input || !runBtn || !stopBtn) return;

  const sendCommand = (): void => {
    const cmd = input.value.trim();
    if (!cmd) return;

    if (cmd === 'clear' || cmd === 'cls') {
      output.innerHTML = '';
      input.value = '';
      return;
    }

    if (isRunning) {
      // Send to stdin of the active process
      output.innerHTML += `<span class="console-stdin-line">${cmd}\n</span>`;
      output.scrollTop = output.scrollHeight;
      window.parent.postMessage(
        { type: 'send-stdin', text: cmd, context: ctx },
        getParentOrigin()
      );
      input.value = '';
      return;
    }

    // New command execution
    output.innerHTML += `<span class="console-command-line">$ ${cmd}\n</span>`;
    output.scrollTop = output.scrollHeight;

    // History management
    history.push(cmd);
    historyIndex = history.length;

    isRunning = true;
    window.parent.postMessage(
      { type: 'run-command', cmd, context: ctx },
      getParentOrigin()
    );
  };

  // Keyboard navigation and shortcuts
  pane.addEventListener('keydown', (e) => {
    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.parent.postMessage(
        { type: 'stop-command', context: ctx },
        getParentOrigin()
      );
    }
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

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        input.value = '';
      }
    }
  });

  // Resize logic
  if (resizeHandle) {
    let startY = 0;
    let startHeight = 0;

    const onMouseMove = (e: MouseEvent): void => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(
        80,
        Math.min(window.innerHeight * 0.8, startHeight + delta)
      );
      pane.style.height = newHeight + 'px';
      editor?.layout();
    };

    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
    };

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = pane.offsetHeight;
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // Pre-fill based on extension
  const ext = ctx.match(/\.([^./\\]+)$/)?.[1];
  if (ext === 'ts') input.value = 'npx ts-node ' + ctx.split('/').pop();
  else if (ext === 'py') input.value = 'python ' + ctx.split('/').pop();
  else if (ext === 'js') input.value = 'node ' + ctx.split('/').pop();
}

/**
 * Handles incoming console messages from the parent.
 * @param data - Message data
 * @param editor - Monaco editor instance
 * @returns true if the message was handled
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
        editor?.layout();
        if (!pane.classList.contains('visible')) {
          editor?.focus();
        }
      }
      return true;
    }

    case 'console-output': {
      if (output) {
        const text = data.text as string;
        output.innerHTML += ansiUp.ansi_to_html(text);
        output.scrollTop = output.scrollHeight;

        if (text.includes('Process exited with code')) {
          isRunning = false;
        }
      }
      return true;
    }

    default:
      return false;
  }
}
