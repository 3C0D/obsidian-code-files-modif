/**
 * Shared utilities for iframe modules.
 * Handles parent origin capture for secure postMessage communication.
 */

let parentOrigin = '*';

/**
 * Captures the parent window origin from the init message event.
 * Must be called once before any postMessage is sent to the parent.
 * @param origin - The origin of the parent window (from event.origin)
 */
export function setParentOrigin(origin: string): void {
	parentOrigin = origin;
}

/**
 * Gets the captured parent origin for postMessage communication.
 * @returns The parent window origin, or '*' if not yet captured
 */
export function getParentOrigin(): string {
	return parentOrigin;
}
