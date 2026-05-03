/**
 * Shared utilities for the Monaco iframe modules.
 * Why: Centralizes common variables and functions like parentOrigin to avoid duplication.
 * How: Exports shared state and setters for iframe-wide configuration.
 */

let parentOrigin = '*';

export function setParentOrigin(origin: string): void {
	parentOrigin = origin;
}

export { parentOrigin };