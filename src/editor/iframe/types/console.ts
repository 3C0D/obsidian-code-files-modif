/**
 * Console Message Types for Monaco Iframe Communication
 */

/** Messages sent FROM iframe TO parent Obsidian process */
export type ConsoleOutMessage =
  | { type: 'toggle-console'; context: string }
  | { type: 'run-command'; cmd: string; context: string }
  | { type: 'send-stdin'; text: string; context: string }
  | { type: 'stop-command'; context: string }
  | { type: 'console-height-changed'; height: number; context: string };

/** Messages sent FROM parent Obsidian process TO iframe */
export type ConsoleInMessage =
  | { type: 'console-toggle' }
  | { type: 'console-output'; text: string }
  | { type: 'console-process-exited'; code: number | null }
  | { type: 'console-history'; history: string[] };
