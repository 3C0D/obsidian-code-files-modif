# Integrated Console Functionality (Monaco Iframe)

The console is integrated directly into the Monaco iframe. It allows running system commands (Node.js, Python, etc.) on the currently open file without using a separate Obsidian view.

## Global Architecture

The console panel is a DOM element internal to the Monaco iframe. The process (`child_process.spawn`) runs on the parent side (Obsidian) and communicates with the iframe via `postMessage`.

- **Isolation**: The iframe (blob URL) cannot execute system code itself. It delegates everything to the parent via `postMessage`.
- **Modularity**: The business logic is isolated in `src/editor/iframe/console.ts`.
- **Typing**: Communications are secured by types defined in `src/editor/iframe/types/console.ts`.
- **Desktop Only**: Execution is reserved for the Desktop version of Obsidian (Electron exposes Node.js; the mobile version does not have it).

---

## UI Structure (monacoEditor.html)

The Monaco editor and the console are encapsulated in a flex `#wrapper` (column direction):

```html
<div id="wrapper">
    <div id="container"></div>
    <div id="console-pane" tabindex="0">
        <div id="console-resize-handle"></div>
        <div id="console-output"></div>
        <div id="console-prompt-line">
            <span id="console-prompt-cwd"></span>
            <span id="console-prompt-symbol">$</span>
            <input id="console-input-field" type="text" spellcheck="false" />
        </div>
    </div>
</div>
```

`tabindex="0"` makes the `div` focusable, allowing keyboard shortcuts (Ctrl+C, Ctrl+J) to be captured even when the cursor is not in the input field.

---

## Integration in Monaco (actions.ts)

The console is registered as an action and a command in Monaco:

### 1. Keyboard Shortcut (Ctrl+J)
```ts
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
    window.parent.postMessage({ type: 'toggle-console', context }, getParentOrigin());
});
```

### 2. Context Menu
A "🖥️ Open Console" action is added to the `code-files` group of the context menu.

---

## Iframe Logic (console.ts)

### The `isRunning` mechanism (Command Mode vs Stdin Mode)

This is the key point for interactivity. The iframe maintains an internal `isRunning` state to know how to interpret the **Enter** key:

1. **If `isRunning` is FALSE**:
   - The user types a command (e.g., `python script.py`).
   - The iframe sends `run-command` to the parent.
   - The parent launches (`spawn`) the process.
   - The iframe sets `isRunning` to **TRUE**.

2. **If `isRunning` is TRUE**:
   - A program is already running.
   - The typed text is a response to a program request (e.g., a Python `input()`).
   - The iframe sends `send-stdin` to the parent.
   - The parent writes this text to the standard input (`stdin`) of the existing process.

3. **Return to initial state**:
   - As soon as the parent detects that the process has finished, it sends a structured `console-process-exited` message.
   - The iframe sets `isRunning` back to **FALSE**, freeing the console for a new command.

> [!NOTE]
> This mechanism is robust: it relies on a dedicated message (`console-process-exited`) and not on a textual scan of the output, which eliminates any risk of false positives if a program were to write text containing "Process exited".

### Optimized Resizing (Performance)

To prevent the interface from freezing while dragging the handle, the logic is split into two flows:

1. **Visual Update (Synchronous)**: The DOM height (`pane.style.height`) changes immediately with each `mousemove`. The border follows the cursor smoothly.
2. **Logical Update (Throttled)**: The expensive `editor.layout()` call is encapsulated in a generic `throttle` utility, limited to one execution every 50 ms. Monaco readjusts regularly without saturating the main thread.

The chosen height is persisted in the plugin settings when the mouse is released.

### Path Handling and Normalization (CWD)

The console implements a robust system for displaying the current working directory (CWD) in the prompt, supporting vault-relative and home-relative paths.

1. **Home Directory Resolution**:
   - The `homePath` is resolved on the **parent side** (Obsidian) using `require('os').homedir()` (Desktop only).
   - This path is sent to the iframe via `postMessage` during initialization and whenever the CWD changes (e.g., after a `cd` command).
   - This avoids issues with native Node.js modules in the iframe context and ensures cross-platform compatibility (mobile safety).

2. **Normalization and Robustness**:
   - **Case-Insensitivity**: On Windows, paths are normalized to lowercase for comparison, preventing mismatches between `C:\Users` and `c:\users`.
   - **Separator Uniformity**: All backslashes (`\`) are converted to forward slashes (`/`) for internal comparison and display.
   - **Trailing Slashes**: A trailing slash is added to the home directory path during comparison to avoid partial matches (e.g., matching `Users/mik` against `Users/mik_extra`).

3. **Smart Display Logic (`formatCwd`)**:
   - **Vault-relative**: If the CWD is inside the vault, the path is shown relative to the vault root.
   - **Home-relative**: If the CWD is outside the vault but inside the user's home directory, it is displayed starting with `~/`.
   - **Absolute fallback**: If neither matches, the full absolute path is shown.
   - This logic is unified in a `formatCwd()` function used for the prompt, the `pwd` command, and command execution echoes.

### Visibility State Persistence

Console visibility is persisted per file. If the console is open when Obsidian is closed or when changing files, it will reappear open upon the next load.

1. **Visibility Notification**: On every opening or closing (via Ctrl+J or button), the iframe sends a `console-visibility-changed` message containing the `visible` state.
2. **Parent Synchronization**: The `CodeEditorView` view intercepts this message, updates its internal `isConsoleOpen` variable, and calls `this.app.workspace.requestSaveLayout()` to force Obsidian to remember the view's state.
3. **Restoration**: During `setState` (Obsidian reload), the view retrieves `isConsoleOpen`. It passes this value to `mountCodeEditor`. As soon as the iframe is ready (`ready` signal), the parent sends a `console-show` message to force the display if necessary.

### Input Management and UX

- **Keyboard shortcuts**:
  - **Ctrl+L** (or Cmd+L): Clears the console output (equivalent to the `clear` or `cls` command).
  - **Ctrl+J** (or Cmd+J): Shows or hides the console panel.
  - **Ctrl+C** (or Cmd+C): Interrupts the current process (sends SIGINT/taskkill).
  - **Ctrl+D/Z** (or Cmd+D/Z): Sends EOF (end-of-stream) to the current process (closes the stdin pipe).
  - **Enter**: Executes the command or sends the input to the current process.
  - **Up/Down Arrows**: Navigates through command history.
- **Cleanup**: The input field is systematically cleared after sending.
- **History**: Navigation with Up/Down arrows. History is persisted in plugin settings per file (limited to the last 50 unique commands).
- **Visual Prompt (Inline)**: Displays the current folder (CWD) in color and a `$` symbol directly in the prompt line. The input is transparent and borderless for smooth integration. CWD is updated dynamically via `cd` and persists per file.
- **Navigation (cd)**: `cd` commands are intercepted on the parent side. Instead of launching a process, the path is resolved, validated, and the persistent CWD is updated for the file. The prompt immediately displays the new directory.
- **Auto-fill**: Intelligent pre-filling based on file extension (supports TS, JS, PY, C++, Rust, Go, etc.). Uses `tsx` for TypeScript.

  | Extension                   | Pre-filled Command        |
  | --------------------------- | ------------------------- |
  | `.ts`, `.mts`, `.cts`       | `npx tsx <file>`          |
  | `.js`, `.mjs`, `.cjs`       | `node <file>`             |
  | `.py`                       | `python <file>`           |
  | `.sh`                       | `bash <file>`             |
  | `.ps1`                      | `powershell -File <file>` |
  | `.rb`                       | `ruby <file>`             |
  | `.go`                       | `go run <file>`           |
  | `.rs`                       | `cargo run`               |
  | `.java`                     | `java <file>`             |
  | `.lua`, `.php`, `.r`, `.pl` | specific command + file   |

- **Copy**: Right-click on output to copy selection to clipboard via `navigator.clipboard`.
- **Drag-and-Drop**: Dragging files from the explorer into the input inserts their path (in quotes if necessary).
- **Multi-line Paste (stdin mode)**: In interactive mode, pasting text containing line breaks sends each line separately.
- **ANSI**: Color rendering via `ansi_up`.
- **Truncate**: Output is limited to the last 5,000 lines to preserve DOM performance.

### Shell Management (Windows)

On Windows, the console supports multiple command interpreters. The plugin automatically detects available shells:

- **Windows PowerShell (`powershell.exe`)**: Always available (v5.1). Label: `PS`.
- **Command Prompt (`cmd.exe`)**: Always available. Label: `CMD`.
- **PowerShell Core (`pwsh.exe`)**: Dynamically detected if installed (v7+). Label: `PWSH`.

The `PWSH` label is used for PowerShell Core to be version-independent (avoids labels like `PS7` that become obsolete with higher versions).

The default shell choice is made in the plugin settings (**Obsidian Settings → Code Files → Console Settings**).

---

## Process Management (messageHandler.ts)

The parent manages the actual execution via Node.js `child_process.spawn`.

### 1. Launching (`run-command`)

The process is launched with `stdio: ['pipe', 'pipe', 'pipe']`: the three streams (input, standard output, errors) are connected and controlled by the plugin.

The environment is enriched to ensure compatibility and improve the experience:

```ts
env: {
  ...process.env,        // Inherits PATH and system variables
  PYTHONIOENCODING: 'utf-8', // Forces UTF-8 encoding for Python
  GIT_PAGER: '',         // Disables git pager (prevents git log from blocking)
  FORCE_COLOR: '1',      // Asks programs to produce ANSI colors
}
```

These variables ensure better compatibility with modern tools and avoid common blockages (like Git waiting for keyboard interaction).

The CWD (working directory) is maintained by the parent in a `Map` per context. It is initialized to the file's directory but can be modified via the intercepted `cd` command.

### 2. Process Exit Notification

When the process closes, the parent sends two distinct messages:

- `console-output` with the text `"\nProcess exited with code N\n"` (for display).
- `console-process-exited` with the structured exit code (to reset `isRunning`).

A 50 ms delay is applied before sending to ensure all `data` events from `stdout`/`stderr` have been processed (inevitable race condition with Node.js streams).

### 3. Interruption and Cleanup (`stop-command` and `cleanup`)

The kill logic is centralized in a `killProcessTree` function reused by `stop-command` and by the cleanup upon view destruction. This function properly handles stopping full process trees:

- **Windows**: Uses `taskkill /pid [pid] /T /F` to kill the entire process tree (`cmd.exe` shell and all its children recursively).
- **Unix**: Sends `SIGINT` to the entire process group via `process.kill(-proc.pid, 'SIGINT')` (requires `detached: true` on spawn to create a new group).
- **Fallback**: `proc.kill('SIGINT')` if tree-kill fails, followed by a delay to allow propagation.

After a `stop-command`, a `console-process-exited` message is manually sent to ensure `isRunning` returns to `false`, as the forced kill may prevent the natural `close` event from triggering.

### 4. Stream Encoding and Decoding Management

To ensure accented characters (like `é` in French) display correctly, a hybrid decoding strategy is employed, particularly optimized for Windows:

- **Node.js Side (Automatic Decoding)**: For each data block received:
    1. The plugin attempts a **strict UTF-8** decoding using `TextDecoder` with `fatal: true`.
    2. If UTF-8 decoding fails (invalid characters), it automatically switches to a manual **CP850** (IBM850/OEM Latin 1) decoder via a complete mapping table (0x80–0xFF).
    3. This ensures that internal `cmd.exe` commands (`dir`, `type`, system messages) display without corruption, while preserving UTF-8 for modern tools like Python, Node.js, etc.

> [!IMPORTANT]
> Two separate decoding instances are maintained for `stdout` and `stderr` to preserve the internal state of each stream independently. On Unix systems, only UTF-8 is used (no CP850 fallback).

---

## Known Issues & TODO

- [ ] **Advanced Interactivity**: Support for auto-completion (Tab) in the console.

---

## Technical Notes

- **Race Condition**: 50 ms delay at the end of the process to flush `stdout`/`stderr` buffers before signaling exit.
- **Performance**: `editor.layout()` is called only during size or visibility changes, never continuously.
- **Dispatching**: Automatic routing of `console-*` messages in `init.ts`.
- **History**: Persisted in `plugin.settings.consoleHistories` (object indexed by file path, capped at 50 entries per file, automatic deduplication).
- **Height**: Persisted in `plugin.settings.consoleHeight` (default value: 200px).

---

## Related Files

- [`src/editor/iframe/index.ts`](../src/editor/iframe/index.ts): Public API of the iframe bundle (type and variable re-exports).
- [`src/editor/iframe/console.ts`](../src/editor/iframe/console.ts): Console business logic (UI, states, incoming messages).
- [`src/editor/iframe/init.ts`](../src/editor/iframe/init.ts): Message dispatcher (forwards `context` to handlers).
- [`src/editor/iframe/types/console.ts`](../src/editor/iframe/types/console.ts): `postMessage` message types (input/output).
- [`src/editor/iframe/types/types.ts`](../src/editor/iframe/types/types.ts): Shared types (InitParams, etc.).
- [`src/editor/mountCodeEditor/messageHandler.ts`](../src/editor/mountCodeEditor/messageHandler.ts): Process management and encoding on the Obsidian side.
- [`src/editor/monacoHtml.css`](../src/editor/monacoHtml.css): ANSI styles and theming for the console.
- [`src/editor/monacoEditor.html`](../src/editor/monacoEditor.html): Console DOM structure (prompt line design).
- [`src/editor/iframe/actions.ts`](../src/editor/iframe/actions.ts): Monaco actions and keyboard shortcuts.
- [`src/editor/mountCodeEditor/mountCodeEditor.ts`](../src/editor/mountCodeEditor/mountCodeEditor.ts): Iframe mounting orchestration.

---

## Appendix — Theory: What is an Embedded Console?

### The Standard Model: stdin / stdout / stderr

Every command-line program communicates via three standard streams:

- **stdin** (standard input): data the program receives. In a classic terminal, this is what the user types.
- **stdout** (standard output): what the program writes as normal result. For example, `print("hello")` in Python writes to stdout.
- **stderr** (standard error): reserved for error and warning messages. Separate from stdout so errors can be redirected independently.

`spawn` with `stdio: ['pipe', 'pipe', 'pipe']` connects these three streams to the plugin, which can thus read and write to them on demand.

### What We Built: A "Run Panel"

Our console is what is called a **run panel**: a contextual execution panel. It launches a program, collects its output, and allows sending data to its input. This is the model used by integrated IDEs (VSCode "Terminal", PyCharm "Run", etc.) for simple executions.

This model is perfectly suited for:
- Running scripts (Python, Node.js, Go, Rust, etc.)
- Viewing colored output (ANSI)
- Interacting with programs that require simple inputs (Python `input()`, Node.js `readline`)

### What We Did Not Build: A Terminal Emulator (PTY)

A **PTY** (Pseudo-Terminal) is a system component that simulates a real hardware terminal. It handles low-level protocols: cursor positioning, line clearing, raw/cooked modes, window size (TIOCGWINSZ), etc.

Projects like `obsidian-terminal` implement a full PTY with `xterm.js` (rendering) and auxiliary scripts (Python or C for the system side) to support programs that require a real terminal: `vim`, `htop`, `ssh`, `man`, interactive shells with completion, etc.

This level of complexity is not justified in our case for two reasons:

1. Our target usage is script execution, not general-purpose shell emulation.
2. A full PTY implies multi-platform native dependencies, WebGL canvas rendering, and a significantly larger maintenance surface.

### Comparative Summary

| Capability                        | Run Panel (our approach) | Full PTY Emulator      |
| --------------------------------- | ------------------------ | ---------------------- |
| Run a script                      | Yes                      | Yes                    |
| View colored output (ANSI)        | Yes (via `ansi_up`)      | Yes (native xterm.js)  |
| Send text to the program          | Yes (stdin pipe)         | Yes (PTY master)       |
| Interactive shell (`bash`, `cmd`) | Partial                  | Yes                    |
| `vim`, `htop`, `ssh`              | No                       | Yes                    |
| Dynamic window size (resize PTY)  | Not necessary            | Yes                    |
| Implementation complexity         | Low                      | High                   |
| Native dependencies               | None                     | Yes (Python/C scripts) |

### Unix Signals

When a process needs to be interrupted, the system uses **signals**: asynchronous notifications sent to a process.

- **SIGINT**: Interruption (equivalent to Ctrl+C). Asks the program to stop gracefully.
- **SIGTERM**: Soft termination. The program can choose to ignore this signal.
- **SIGKILL**: Forced termination. Uncatchable, the kernel kills the process immediately.

On Windows, this model does not natively exist. `taskkill /T /F` is used to force-kill a process tree.

### The "Process Group" Problem

When launching `npx tsx script.ts` with `shell: true`, the system actually creates a chain: a shell (cmd.exe or sh) which itself launches `npx`, which itself launches `node`. If SIGINT is sent only to the shell, child processes may continue running in the background.

`detached: true` on Unix detaches the process in its own group. `process.kill(-pid, 'SIGINT')` (note the `-` before the PID) then sends the signal to the entire group simultaneously, ensuring a complete stop of the chain.
