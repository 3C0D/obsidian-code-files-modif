import { ItemView, type WorkspaceLeaf, type ViewStateResult, Platform } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import { mountCodeEditor } from '../mountCodeEditor/index.ts';
import type { CodeEditorHandle } from '../../types/index.ts';
import { spawn, type ChildProcess } from 'child_process';
import { AnsiUp } from 'ansi_up';

export const CONSOLE_VIEW_TYPE = 'console-view';

export class ConsoleView extends ItemView {
  private outputEl: HTMLDivElement;
  private inputEditor: CodeEditorHandle | null = null;
  private currentProcess: ChildProcess | null = null;
  private filePath: string;
  private ansiUp: AnsiUp;

  constructor(leaf: WorkspaceLeaf, private plugin: CodeFilesPlugin) {
    super(leaf);
    this.ansiUp = new AnsiUp();
  }

  getViewType(): string {
    return CONSOLE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return `Console: ${this.filePath}`;
  }

  getIcon(): string {
    return 'terminal';
  }

  async setState(state: any, result: ViewStateResult): Promise<void> {
    this.filePath = state.file;
    await super.setState(state, result);
  }

  getState(): any {
    return {
      file: this.filePath,
    };
  }

  async onOpen(): Promise<void> {
    if (!Platform.isDesktop) {
      this.contentEl.setText('Console is only available on desktop.');
      return;
    }

    // Zone de sortie
    this.outputEl = this.contentEl.createDiv({ cls: 'console-output' });
    this.outputEl.style.cssText = `
      height: calc(100% - 80px);
      overflow-y: auto;
      background: var(--background-primary);
      color: var(--text-normal);
      padding: 8px;
      font-family: var(--font-interface);
      font-size: var(--font-ui-smaller);
      white-space: pre-wrap;
      word-wrap: break-word;
    `;

    // Mini Monaco pour la saisie
    const inputContainer = this.contentEl.createDiv({ cls: 'console-input' });
    inputContainer.style.cssText = `
      height: 80px;
      border-top: 1px solid var(--background-modifier-border);
    `;

    const initialCommand = this.getDefaultCommand();
    this.inputEditor = await mountCodeEditor({
      plugin: this.plugin,
      language: 'shell',
      initialValue: initialCommand,
      codeContext: `console-input-${this.filePath}`,
      containerEl: inputContainer,
      onSave: () => this.runCommand(),
    });

    // Add buttons
    const buttonContainer = inputContainer.createDiv();
    buttonContainer.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      z-index: 10;
      display: flex;
      gap: 5px;
    `;

    const runButton = buttonContainer.createEl('button', { text: 'Run' });
    runButton.addEventListener('click', () => this.runCommand());

    const stopButton = buttonContainer.createEl('button', { text: 'Stop' });
    stopButton.addEventListener('click', () => this.stopCommand());
  }

  private getDefaultCommand(): string {
    const ext = this.filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
        return `node "${this.filePath}"`;
      case 'ts':
        return `ts-node "${this.filePath}"`;
      case 'py':
        return `python "${this.filePath}"`;
      default:
        return `node "${this.filePath}"`;
    }
  }

  private runCommand(): void {
    if (!this.inputEditor) return;

    // Kill previous process if running
    this.currentProcess?.kill();

    const cmdLine = this.inputEditor.getValue();
    if (!cmdLine.trim()) return;

    // Parse command line (simple split, no advanced shell parsing)
    const parts = cmdLine.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    this.appendOutput(`$ ${cmdLine}\n`);

    try {
      this.currentProcess = spawn(cmd, args, {
        cwd: (this.plugin.app.vault.adapter as any).basePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.currentProcess.stdout?.on('data', (data) => {
        this.appendOutput(this.ansiUp.ansi_to_html(data.toString()));
      });

      this.currentProcess.stderr?.on('data', (data) => {
        this.appendOutput(this.ansiUp.ansi_to_html(data.toString()));
      });

      this.currentProcess.on('close', (code) => {
        this.appendOutput(`\nProcess exited with code ${code}\n`);
        this.currentProcess = null;
      });

      this.currentProcess.on('error', (err) => {
        this.appendOutput(`Error: ${err.message}\n`);
        this.currentProcess = null;
      });
    } catch (err) {
      this.appendOutput(`Failed to start process: ${err}\n`);
    }
  }

  private stopCommand(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGINT');
      this.appendOutput('\nProcess stopped\n');
    }
  }

  private appendOutput(text: string): void {
    this.outputEl.innerHTML += text;
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  async onClose(): Promise<void> {
    this.currentProcess?.kill();
    await this.inputEditor?.destroy();
  }
}