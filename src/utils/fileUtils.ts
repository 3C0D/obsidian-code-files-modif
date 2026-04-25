/**
 * File utilities for handling extensions and file names.
 */

/**
 * Extracts the extension from a filename.
 * Handles dotfiles (.env → "env") and normal files (myfile.py → "py").
 * Returns empty string for files without extension that don't start with a dot (like LICENSE, README).
 *
 * @param filename - The filename to extract the extension from
 * @returns The extension of the file, without the leading dot
 */
export function getExtension(filename: string): string {
	if (filename.startsWith('.') && !filename.includes('.', 1)) return filename.slice(1);
	const lastDot = filename.lastIndexOf('.');
	return lastDot > 0 ? filename.slice(lastDot + 1) : '';
}
