/**
 * Console message types for Monaco iframe communication.
 * Documents all postMessage payloads between the iframe and Obsidian.
 * Reference documentation only — not yet enforced at runtime on postMessage calls.
 */

/** Messages sent FROM iframe TO parent Obsidian process */
export type ConsoleOutMessage =
  | { type: 'toggle-console'; context: string }
  | { type: 'run-command'; cmd: string; context: string }
  | { type: 'send-stdin'; text: string; context: string }
  | { type: 'send-stdin-eof'; context: string }
  | { type: 'stop-command'; context: string }
  | { type: 'console-height-changed'; height: number; context: string }
  | { type: 'console-visibility-changed'; visible: boolean; context: string }
  | { type: 'console-notify'; text: string; context: string };

/** Messages sent FROM parent Obsidian process TO iframe */
export type ConsoleInMessage =
  | { type: 'console-toggle' }
  | { type: 'console-show' }
  | { type: 'console-output'; text: string }
  | { type: 'console-process-exited'; code: number | null }
  | { type: 'console-history'; history: string[] };
